import { randomUUID } from "node:crypto";
import { and, count, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetAdminTalentPoolQueryParams,
  GetAdminTalentPoolResponse,
  GetCompanyTalentPoolQueryParams,
  GetCompanyTalentPoolResponse,
  GetMemberPassportResponse,
  GetPublicPassportParams,
  GetPublicPassportResponse,
  UpdateMemberPassportBody,
  UpdateMemberPassportConsentBody,
  UpdateMemberPassportConsentResponse,
  UpdateMemberPassportResponse,
} from "@workspace/api-zod";
import {
  auditLogsTable,
  db,
  memberEvidenceTable,
  memberProfilesTable,
  passportConsentsTable,
  professionalPassportsTable,
  usersTable,
} from "@workspace/db";
import { getAuthenticatedUser, requireRole, requireUser } from "../lib/auth";

const router: IRouter = Router();
const memberOnly = [requireUser, requireRole("member")];
const adminOnly = [requireUser, requireRole("admin", "super_admin")];
const companyOnly = [requireUser, requireRole("company")];

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const publicPath = (slug: string) => `/passport/${slug}`;

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
}

async function ensureMemberPassport(user: ReturnType<typeof getAuthenticatedUser>) {
  const [existing] = await db
    .select()
    .from(professionalPassportsTable)
    .where(eq(professionalPassportsTable.memberUserId, user.id))
    .limit(1);
  if (existing) return existing;

  const base = slugify(user.name) || "anggota-pba";
  const slug = `${base}-${randomUUID().slice(0, 8)}`;
  const [created] = await db
    .insert(professionalPassportsTable)
    .values({
      id: randomUUID(),
      memberUserId: user.id,
      slug,
    })
    .onConflictDoNothing({ target: professionalPassportsTable.memberUserId })
    .returning();
  if (created) return created;

  const [concurrent] = await db
    .select()
    .from(professionalPassportsTable)
    .where(eq(professionalPassportsTable.memberUserId, user.id))
    .limit(1);
  if (!concurrent) throw new Error("Professional Passport gagal dibuat.");
  return concurrent;
}

async function ensureConsent(userId: string) {
  const [consent] = await db
    .insert(passportConsentsTable)
    .values({
      id: randomUUID(),
      memberUserId: userId,
      status: "revoked",
      revokedAt: new Date(),
    })
    .onConflictDoNothing({ target: passportConsentsTable.memberUserId })
    .returning();
  if (consent) return consent;
  const [existing] = await db
    .select()
    .from(passportConsentsTable)
    .where(eq(passportConsentsTable.memberUserId, userId))
    .limit(1);
  if (!existing) throw new Error("Status consent gagal dibuat.");
  return existing;
}

function consentResponse(consent: typeof passportConsentsTable.$inferSelect) {
  return {
    id: consent.id,
    scope: consent.scope,
    status: consent.status,
    grantedAt: consent.grantedAt?.toISOString() ?? null,
    revokedAt: consent.revokedAt?.toISOString() ?? null,
    updatedAt: consent.updatedAt,
  };
}

function memberPassportResponse(
  passport: typeof professionalPassportsTable.$inferSelect,
  consent: typeof passportConsentsTable.$inferSelect,
) {
  return {
    ...passport,
    preferredRoles: asStrings(passport.preferredRoles),
    preferredLocations: asStrings(passport.preferredLocations),
    preferredWorkModes: asStrings(passport.preferredWorkModes),
    publicUrl: publicPath(passport.slug),
    consent: consentResponse(consent),
  };
}

async function recordAudit(
  executor: any,
  actor: ReturnType<typeof getAuthenticatedUser>,
  values: {
    action: string;
    entityId: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    note?: string | null;
  },
) {
  await executor.insert(auditLogsTable).values({
    id: randomUUID(),
    actorUserId: actor.id,
    actorRole: actor.role,
    entityType: "professional_passport",
    ...values,
  });
}

router.get("/member/passport", ...memberOnly, async (req, res): Promise<void> => {
  const user = getAuthenticatedUser(req);
  const [passport, consent] = await Promise.all([
    ensureMemberPassport(user),
    ensureConsent(user.id),
  ]);
  res.json(GetMemberPassportResponse.parse(memberPassportResponse(passport, consent)));
});

router.patch("/member/passport", ...memberOnly, async (req, res): Promise<void> => {
  const body = UpdateMemberPassportBody.safeParse(req.body);
  if (!body.success || Object.keys(body.data).length === 0) {
    res.status(400).json({ error: "Pengaturan Professional Passport tidak valid." });
    return;
  }

  const user = getAuthenticatedUser(req);
  const existing = await ensureMemberPassport(user);
  if (body.data.slug && body.data.slug !== existing.slug) {
    const [duplicate] = await db
      .select({ id: professionalPassportsTable.id })
      .from(professionalPassportsTable)
      .where(eq(professionalPassportsTable.slug, body.data.slug))
      .limit(1);
    if (duplicate) {
      res.status(400).json({ error: "URL passport sudah digunakan. Pilih URL lain." });
      return;
    }
  }

  try {
    const [updated] = await db.transaction(async (tx) => {
      const [passport] = await tx
        .update(professionalPassportsTable)
        .set({ ...body.data, updatedAt: new Date() })
        .where(eq(professionalPassportsTable.memberUserId, user.id))
        .returning();
      await recordAudit(tx, user, {
        action: "passport.updated",
        entityId: existing.id,
        fromStatus: existing.isPublic ? "public" : "private",
        toStatus: passport.isPublic ? "public" : "private",
        note: "Data passport, preferensi kerja, atau availability diperbarui oleh anggota.",
      });
      return [passport];
    });
    const consent = await ensureConsent(user.id);
    res.json(UpdateMemberPassportResponse.parse(memberPassportResponse(updated, consent)));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(400).json({ error: "URL passport sudah digunakan. Pilih URL lain." });
      return;
    }
    throw error;
  }
});

router.patch("/member/passport/consent", ...memberOnly, async (req, res): Promise<void> => {
  const body = UpdateMemberPassportConsentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Pilihan consent tidak valid." });
    return;
  }

  const user = getAuthenticatedUser(req);
  await ensureMemberPassport(user);
  const existing = await ensureConsent(user.id);
  const now = new Date();
  const nextStatus = body.data.active ? "active" : "revoked";
  const [updated] = await db.transaction(async (tx) => {
    const [consent] = await tx
      .update(passportConsentsTable)
      .set({
        status: nextStatus,
        grantedAt: body.data.active ? now : existing.grantedAt,
        revokedAt: body.data.active ? null : now,
        updatedAt: now,
      })
      .where(eq(passportConsentsTable.memberUserId, user.id))
      .returning();
    await recordAudit(tx, user, {
      action: body.data.active ? "passport.consent_granted" : "passport.consent_revoked",
      entityId: consent.id,
      fromStatus: existing.status,
      toStatus: consent.status,
      note: body.data.active
        ? "Anggota memberikan consent untuk ditampilkan di Talent Pool."
        : "Anggota mencabut consent Talent Pool.",
    });
    return [consent];
  });
  res.json(UpdateMemberPassportConsentResponse.parse(consentResponse(updated)));
});

router.get("/passport/:slug", async (req, res): Promise<void> => {
  const params = GetPublicPassportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "URL passport tidak valid." });
    return;
  }

  const [row] = await db
    .select({
      passport: professionalPassportsTable,
      user: usersTable,
      profile: memberProfilesTable,
    })
    .from(professionalPassportsTable)
    .innerJoin(usersTable, eq(professionalPassportsTable.memberUserId, usersTable.id))
    .leftJoin(memberProfilesTable, eq(memberProfilesTable.userId, usersTable.id))
    .where(and(
      eq(professionalPassportsTable.slug, params.data.slug),
      eq(professionalPassportsTable.isPublic, true),
      eq(usersTable.role, "member"),
    ))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Professional Passport tidak ditemukan atau masih privat." });
    return;
  }

  const [verified] = await db
    .select({ value: count(memberEvidenceTable.id) })
    .from(memberEvidenceTable)
    .where(and(
      eq(memberEvidenceTable.memberUserId, row.user.id),
      eq(memberEvidenceTable.status, "verified"),
    ));
  res.json(GetPublicPassportResponse.parse({
    slug: row.passport.slug,
    name: row.user.name,
    headline: row.passport.headline,
    bio: row.passport.bio,
    expertise: row.profile?.expertise ?? "",
    domicile: row.profile?.domicile ?? "",
    experienceYears: row.profile?.experienceYears ?? 0,
    preferredRoles: asStrings(row.passport.preferredRoles),
    preferredLocations: asStrings(row.passport.preferredLocations),
    preferredWorkModes: asStrings(row.passport.preferredWorkModes),
    availabilityStatus: row.passport.availabilityStatus,
    verifiedEvidenceCount: Number(verified?.value ?? 0),
    publicUrl: publicPath(row.passport.slug),
    updatedAt: row.passport.updatedAt,
  }));
});

type TalentRow = {
  user: typeof usersTable.$inferSelect;
  profile: typeof memberProfilesTable.$inferSelect | null;
  passport: typeof professionalPassportsTable.$inferSelect | null;
  consent: typeof passportConsentsTable.$inferSelect | null;
};

function includesText(value: string, query?: string) {
  return !query || value.toLowerCase().includes(query.toLowerCase());
}

function matchesFilters(
  row: TalentRow,
  filters: { search?: string; availability?: string; location?: string },
) {
  const roles = asStrings(row.passport?.preferredRoles);
  const locations = asStrings(row.passport?.preferredLocations);
  const searchText = [
    row.user.name,
    row.profile?.expertise ?? "",
    row.passport?.headline ?? "",
    ...roles,
  ].join(" ");
  const locationText = [row.profile?.domicile ?? "", ...locations].join(" ");
  return includesText(searchText, filters.search)
    && includesText(locationText, filters.location)
    && (!filters.availability || row.passport?.availabilityStatus === filters.availability);
}

function adminCandidate(row: TalentRow) {
  return {
    id: row.passport?.id ?? row.user.id,
    memberUserId: row.user.id,
    name: row.user.name,
    headline: row.passport?.headline ?? "",
    expertise: row.profile?.expertise ?? "",
    domicile: row.profile?.domicile ?? "",
    experienceYears: row.profile?.experienceYears ?? 0,
    preferredRoles: asStrings(row.passport?.preferredRoles),
    preferredLocations: asStrings(row.passport?.preferredLocations),
    preferredWorkModes: asStrings(row.passport?.preferredWorkModes),
    availabilityStatus: row.passport?.availabilityStatus ?? "unavailable",
    isPublic: row.passport?.isPublic ?? false,
    consentStatus: row.consent?.status === "active" ? "active" : "revoked",
    consentGrantedAt: row.consent?.grantedAt?.toISOString() ?? null,
    publicUrl: row.passport?.isPublic ? publicPath(row.passport.slug) : null,
    updatedAt: row.passport?.updatedAt ?? row.user.updatedAt,
  };
}

router.get("/admin/talent-pool", ...adminOnly, async (req, res): Promise<void> => {
  const query = GetAdminTalentPoolQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Filter Talent Pool tidak valid." });
    return;
  }

  const rows = await db
    .select({
      user: usersTable,
      profile: memberProfilesTable,
      passport: professionalPassportsTable,
      consent: passportConsentsTable,
    })
    .from(usersTable)
    .leftJoin(memberProfilesTable, eq(memberProfilesTable.userId, usersTable.id))
    .leftJoin(professionalPassportsTable, eq(professionalPassportsTable.memberUserId, usersTable.id))
    .leftJoin(passportConsentsTable, eq(passportConsentsTable.memberUserId, usersTable.id))
    .where(eq(usersTable.role, "member"))
    .orderBy(desc(usersTable.updatedAt));

  const result = rows
    .filter((row) => {
      const consentStatus = row.consent?.status === "active" ? "active" : "revoked";
      return (query.data.consent === "all" || !query.data.consent || consentStatus === query.data.consent)
        && matchesFilters(row, query.data);
    })
    .map(adminCandidate);
  res.json(GetAdminTalentPoolResponse.parse(result));
});

router.get("/company/talent-pool", ...companyOnly, async (req, res): Promise<void> => {
  const query = GetCompanyTalentPoolQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Filter Talent Pool tidak valid." });
    return;
  }

  const rows = await db
    .select({
      user: usersTable,
      profile: memberProfilesTable,
      passport: professionalPassportsTable,
      consent: passportConsentsTable,
    })
    .from(professionalPassportsTable)
    .innerJoin(usersTable, eq(professionalPassportsTable.memberUserId, usersTable.id))
    .innerJoin(passportConsentsTable, and(
      eq(passportConsentsTable.memberUserId, usersTable.id),
      eq(passportConsentsTable.status, "active"),
    ))
    .leftJoin(memberProfilesTable, eq(memberProfilesTable.userId, usersTable.id))
    .where(eq(usersTable.role, "member"))
    .orderBy(desc(professionalPassportsTable.updatedAt));

  const result = rows
    .filter((row) => matchesFilters(row, query.data))
    .map((row) => ({
      id: row.passport.id,
      name: row.user.name,
      headline: row.passport.headline,
      expertise: row.profile?.expertise ?? "",
      domicile: row.profile?.domicile ?? "",
      experienceYears: row.profile?.experienceYears ?? 0,
      preferredRoles: asStrings(row.passport.preferredRoles),
      preferredLocations: asStrings(row.passport.preferredLocations),
      preferredWorkModes: asStrings(row.passport.preferredWorkModes),
      availabilityStatus: row.passport.availabilityStatus,
      publicUrl: row.passport.isPublic ? publicPath(row.passport.slug) : null,
      updatedAt: row.passport.updatedAt,
    }));
  res.json(GetCompanyTalentPoolResponse.parse(result));
});

export default router;