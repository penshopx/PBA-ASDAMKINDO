import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetAdminTalentConsentSettingsResponse, GetAdminTalentPoolQueryParams, GetAdminTalentPoolResponse,
  GetCompanyTalentPoolQueryParams, GetCompanyTalentPoolResponse, GetMemberPassportResponse,
  GetPublicPassportParams, GetPublicPassportResponse, GrantMemberCompanyConsentBody,
  GrantMemberCompanyConsentResponse, ListCompanyConsentRequestsResponse, ListMemberCompaniesResponse,
  OverrideAdminTalentConsentBody, OverrideAdminTalentConsentParams, OverrideAdminTalentConsentResponse,
  RequestCompanyTalentConsentBody, RequestCompanyTalentConsentResponse, UpdateAdminTalentConsentSettingsBody,
  UpdateAdminTalentConsentSettingsResponse, UpdateMemberCompanyConsentBody, UpdateMemberCompanyConsentParams,
  UpdateMemberCompanyConsentResponse, UpdateMemberPassportBody, UpdateMemberPassportResponse,
} from "@workspace/api-zod";
import {
  companyProfilesTable, companyTalentConsentsTable, db, memberEvidenceTable, memberProfilesTable,
  notificationsTable, professionalPassportsTable, talentConsentSettingsTable, usersTable,
} from "@workspace/db";
import { getAuthenticatedUser, requireRole, requireUser } from "../lib/auth";
import { consentExpiry, expireCompanyTalentConsents, getTalentConsentSettings, recordConsentAudit } from "../lib/talent-consent";

const router: IRouter = Router();
const memberOnly = [requireUser, requireRole("member")];
const adminOnly = [requireUser, requireRole("admin", "super_admin")];
const companyOnly = [requireUser, requireRole("company")];
const asStrings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const publicPath = (slug: string) => `/passport/${slug}`;
const slugify = (v: string) => v.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 42);

async function ensureMemberPassport(user: ReturnType<typeof getAuthenticatedUser>) {
  const [found] = await db.select().from(professionalPassportsTable).where(eq(professionalPassportsTable.memberUserId, user.id)).limit(1);
  if (found) return found;
  await db.insert(professionalPassportsTable).values({ id: randomUUID(), memberUserId: user.id, slug: `${slugify(user.name) || "anggota-pba"}-${randomUUID().slice(0, 8)}` }).onConflictDoNothing({ target: professionalPassportsTable.memberUserId });
  const [created] = await db.select().from(professionalPassportsTable).where(eq(professionalPassportsTable.memberUserId, user.id)).limit(1);
  if (!created) throw new Error("Professional Passport gagal dibuat.");
  return created;
}
const settingsResponse = (s: Awaited<ReturnType<typeof getTalentConsentSettings>>) => ({ defaultDurationDays: s.defaultDurationDays, updatedAt: s.updatedAt });
function memberConsent(c: typeof companyTalentConsentsTable.$inferSelect, company: typeof companyProfilesTable.$inferSelect) {
  return { id: c.id, companyId: c.companyUserId, companyName: company.companyName, companyType: company.companyType, status: c.status as "requested" | "active" | "denied" | "revoked" | "expired", requestedAt: c.requestedAt, grantedAt: c.grantedAt, revokedAt: c.revokedAt, expiresAt: c.expiresAt, consentVersion: c.consentVersion, requestNote: c.requestNote, decisionNote: c.decisionNote, updatedAt: c.updatedAt };
}
async function memberPassportResponse(passport: typeof professionalPassportsTable.$inferSelect) {
  const [settings, rows] = await Promise.all([getTalentConsentSettings(), db.select({ consent: companyTalentConsentsTable, company: companyProfilesTable }).from(companyTalentConsentsTable).innerJoin(companyProfilesTable, eq(companyTalentConsentsTable.companyUserId, companyProfilesTable.userId)).where(eq(companyTalentConsentsTable.memberUserId, passport.memberUserId)).orderBy(desc(companyTalentConsentsTable.updatedAt))]);
  return { ...passport, preferredRoles: asStrings(passport.preferredRoles), preferredLocations: asStrings(passport.preferredLocations), preferredWorkModes: asStrings(passport.preferredWorkModes), publicUrl: publicPath(passport.slug), consents: rows.map((r) => memberConsent(r.consent, r.company)), consentSettings: settingsResponse(settings) };
}
async function notify(executor: any, userId: string, title: string, description: string, key: string) {
  await executor.insert(notificationsTable).values({ id: `notification-${randomUUID()}`, userId, title, description, type: "consent", dedupeKey: key });
}
async function companyForId(id: string) {
  const [company] = await db.select().from(companyProfilesTable).innerJoin(usersTable, eq(companyProfilesTable.userId, usersTable.id)).where(and(eq(companyProfilesTable.userId, id), eq(usersTable.role, "company"))).limit(1);
  return company?.company_profiles;
}

router.get("/member/passport", ...memberOnly, async (req, res) => {
  await expireCompanyTalentConsents(); const passport = await ensureMemberPassport(getAuthenticatedUser(req));
  res.json(GetMemberPassportResponse.parse(await memberPassportResponse(passport)));
});
router.patch("/member/passport", ...memberOnly, async (req, res): Promise<void> => {
  const body = UpdateMemberPassportBody.safeParse(req.body); if (!body.success || !Object.keys(body.data).length) { res.status(400).json({ error: "Pengaturan Professional Passport tidak valid." }); return; }
  const user = getAuthenticatedUser(req); const old = await ensureMemberPassport(user);
  try {
    const [passport] = await db.transaction(async tx => {
      const [updated] = await tx.update(professionalPassportsTable).set({ ...body.data, updatedAt: new Date() }).where(eq(professionalPassportsTable.memberUserId, user.id)).returning();
      await recordConsentAudit(tx, user, { action: "passport.updated", entityId: old.id, note: "Data Professional Passport diperbarui oleh anggota." });
      return [updated];
    });
    res.json(UpdateMemberPassportResponse.parse(await memberPassportResponse(passport)));
  } catch (e) { if ((e as { code?: string }).code === "23505") { res.status(400).json({ error: "URL passport sudah digunakan. Pilih URL lain." }); return; } throw e; }
});
router.get("/member/companies", ...memberOnly, async (_req, res) => {
  const rows = await db.select({ id: companyProfilesTable.userId, companyName: companyProfilesTable.companyName, companyType: companyProfilesTable.companyType }).from(companyProfilesTable).innerJoin(usersTable, eq(companyProfilesTable.userId, usersTable.id)).where(eq(usersTable.role, "company")).orderBy(companyProfilesTable.companyName);
  res.json(ListMemberCompaniesResponse.parse(rows));
});
router.post("/member/passport/consents", ...memberOnly, async (req, res): Promise<void> => {
  const body = GrantMemberCompanyConsentBody.safeParse(req.body); if (!body.success) { res.status(400).json({ error: "Consent tidak valid." }); return; }
  const member = getAuthenticatedUser(req); const company = await companyForId(body.data.companyId); if (!company) { res.status(404).json({ error: "Perusahaan tidak ditemukan." }); return; }
  const settings = await getTalentConsentSettings(); const now = new Date();
  const consent = await db.transaction(async tx => {
    const [created] = await tx.insert(companyTalentConsentsTable).values({ id: randomUUID(), memberUserId: member.id, companyUserId: company.userId, status: "active", grantedAt: now, expiresAt: consentExpiry(settings.defaultDurationDays, now), grantedBy: member.id, requestNote: body.data.note ?? null, decisionNote: body.data.note ?? null }).onConflictDoUpdate({ target: [companyTalentConsentsTable.memberUserId, companyTalentConsentsTable.companyUserId], set: { status: "active", grantedAt: now, revokedAt: null, expiresAt: consentExpiry(settings.defaultDurationDays, now), grantedBy: member.id, decisionNote: body.data.note ?? null, consentVersion: sql`${companyTalentConsentsTable.consentVersion} + 1`, updatedAt: now } }).returning();
    await recordConsentAudit(tx, member, { action: "talent_consent.granted", entityId: created.id, toStatus: "active", note: body.data.note }); await notify(tx, company.userId, "Consent Talent Pool diberikan", "Seorang anggota memberikan akses Talent Pool kepada perusahaan Anda.", `consent-granted:${created.id}:v${created.consentVersion}`); return created;
  });
  res.status(201).json(GrantMemberCompanyConsentResponse.parse(memberConsent(consent, company)));
});
router.patch("/member/passport/consents/:id", ...memberOnly, async (req, res): Promise<void> => {
  const params = UpdateMemberCompanyConsentParams.safeParse(req.params), body = UpdateMemberCompanyConsentBody.safeParse(req.body); if (!params.success || !body.success) { res.status(400).json({ error: "Consent tidak valid." }); return; }
  const member = getAuthenticatedUser(req); const [old] = await db.select().from(companyTalentConsentsTable).where(and(eq(companyTalentConsentsTable.id, params.data.id), eq(companyTalentConsentsTable.memberUserId, member.id))).limit(1); if (!old) { res.status(404).json({ error: "Consent tidak ditemukan." }); return; }
  const company = await companyForId(old.companyUserId); if (!company) throw new Error("Profil perusahaan tidak ditemukan."); const now = new Date(); const settings = await getTalentConsentSettings();
  const status = body.data.action === "grant" ? "active" : body.data.action === "deny" ? "denied" : "revoked";
  const updated = await db.transaction(async tx => {
    const [changed] = await tx.update(companyTalentConsentsTable).set({ status, grantedAt: status === "active" ? now : old.grantedAt, revokedAt: status === "active" ? null : now, expiresAt: status === "active" ? consentExpiry(settings.defaultDurationDays, now) : old.expiresAt, grantedBy: status === "active" ? member.id : old.grantedBy, revokedBy: status === "active" ? null : member.id, decisionNote: body.data.note ?? null, consentVersion: old.consentVersion + 1, updatedAt: now }).where(eq(companyTalentConsentsTable.id, old.id)).returning();
    await recordConsentAudit(tx, member, { action: `talent_consent.${status}`, entityId: old.id, fromStatus: old.status, toStatus: status, note: body.data.note }); await notify(tx, company.userId, "Status consent diperbarui", `Consent Talent Pool anggota telah ${status}.`, `consent-${status}:${old.id}:v${changed.consentVersion}`); return changed;
  });
  res.json(UpdateMemberCompanyConsentResponse.parse(memberConsent(updated, company)));
});

router.get("/passport/:slug", async (req, res): Promise<void> => {
  const params = GetPublicPassportParams.safeParse(req.params); if (!params.success) { res.status(400).json({ error: "URL passport tidak valid." }); return; }
  const [row] = await db.select({ passport: professionalPassportsTable, user: usersTable, profile: memberProfilesTable }).from(professionalPassportsTable).innerJoin(usersTable, eq(professionalPassportsTable.memberUserId, usersTable.id)).leftJoin(memberProfilesTable, eq(memberProfilesTable.userId, usersTable.id)).where(and(eq(professionalPassportsTable.slug, params.data.slug), eq(professionalPassportsTable.isPublic, true), eq(usersTable.role, "member"))).limit(1);
  if (!row) { res.status(404).json({ error: "Professional Passport tidak ditemukan atau masih privat." }); return; }
  const [verified] = await db.select({ value: count(memberEvidenceTable.id) }).from(memberEvidenceTable).where(and(eq(memberEvidenceTable.memberUserId, row.user.id), eq(memberEvidenceTable.status, "verified")));
  res.json(GetPublicPassportResponse.parse({ slug: row.passport.slug, name: row.user.name, headline: row.passport.headline, bio: row.passport.bio, expertise: row.profile?.expertise ?? "", domicile: row.profile?.domicile ?? "", experienceYears: row.profile?.experienceYears ?? 0, preferredRoles: asStrings(row.passport.preferredRoles), preferredLocations: asStrings(row.passport.preferredLocations), preferredWorkModes: asStrings(row.passport.preferredWorkModes), availabilityStatus: row.passport.availabilityStatus, verifiedEvidenceCount: Number(verified?.value ?? 0), publicUrl: publicPath(row.passport.slug), updatedAt: row.passport.updatedAt }));
});

router.get("/company/talent-pool", ...companyOnly, async (req, res): Promise<void> => {
  const query = GetCompanyTalentPoolQueryParams.safeParse(req.query); if (!query.success) { res.status(400).json({ error: "Filter Talent Pool tidak valid." }); return; } await expireCompanyTalentConsents();
  const user = getAuthenticatedUser(req), q = query.data;
  const filters = and(eq(companyTalentConsentsTable.companyUserId, user.id), eq(companyTalentConsentsTable.status, "active"), gt(companyTalentConsentsTable.expiresAt, new Date()), eq(memberProfilesTable.dataConsent, true), q.availability ? eq(professionalPassportsTable.availabilityStatus, q.availability) : undefined, q.search ? or(ilike(usersTable.name, `%${q.search}%`), ilike(professionalPassportsTable.headline, `%${q.search}%`), ilike(memberProfilesTable.expertise, `%${q.search}%`)) : undefined, q.location ? or(ilike(memberProfilesTable.domicile, `%${q.location}%`), sql`${professionalPassportsTable.preferredLocations}::text ILIKE ${`%${q.location}%`}`) : undefined);
  const [totalRows, rows] = await Promise.all([
    db.select({ value: count() }).from(companyTalentConsentsTable).innerJoin(professionalPassportsTable, eq(companyTalentConsentsTable.memberUserId, professionalPassportsTable.memberUserId)).innerJoin(usersTable, eq(usersTable.id, professionalPassportsTable.memberUserId)).leftJoin(memberProfilesTable, eq(memberProfilesTable.userId, usersTable.id)).where(filters),
    db.select({ passport: professionalPassportsTable, user: usersTable, profile: memberProfilesTable, consent: companyTalentConsentsTable }).from(companyTalentConsentsTable).innerJoin(professionalPassportsTable, eq(companyTalentConsentsTable.memberUserId, professionalPassportsTable.memberUserId)).innerJoin(usersTable, eq(usersTable.id, professionalPassportsTable.memberUserId)).leftJoin(memberProfilesTable, eq(memberProfilesTable.userId, usersTable.id)).where(filters).orderBy(desc(professionalPassportsTable.updatedAt)).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
  ]);
  const items = rows.map(r => ({ id: r.passport.id, name: r.user.name, headline: r.passport.headline, expertise: r.profile?.expertise ?? "", domicile: r.profile?.domicile ?? "", experienceYears: r.profile?.experienceYears ?? 0, preferredRoles: asStrings(r.passport.preferredRoles), preferredLocations: asStrings(r.passport.preferredLocations), preferredWorkModes: asStrings(r.passport.preferredWorkModes), availabilityStatus: r.passport.availabilityStatus, publicUrl: r.passport.isPublic ? publicPath(r.passport.slug) : null, consentExpiresAt: r.consent.expiresAt!, updatedAt: r.passport.updatedAt }));
  const total = Number(totalRows[0]?.value ?? 0); res.json(GetCompanyTalentPoolResponse.parse({ items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) }));
});
function requestResponse(c: typeof companyTalentConsentsTable.$inferSelect, slug: string) {
  return { id: c.id, passportSlug: slug, status: c.status as "requested" | "active" | "denied" | "revoked" | "expired", requestedAt: c.requestedAt, grantedAt: c.grantedAt, expiresAt: c.expiresAt, consentVersion: c.consentVersion, requestNote: c.requestNote, updatedAt: c.updatedAt };
}
router.get("/company/talent-pool/consent-requests", ...companyOnly, async (req, res) => {
  await expireCompanyTalentConsents(); const user = getAuthenticatedUser(req);
  const rows = await db.select({ consent: companyTalentConsentsTable, slug: professionalPassportsTable.slug }).from(companyTalentConsentsTable).innerJoin(professionalPassportsTable, eq(companyTalentConsentsTable.memberUserId, professionalPassportsTable.memberUserId)).where(eq(companyTalentConsentsTable.companyUserId, user.id)).orderBy(desc(companyTalentConsentsTable.updatedAt));
  res.json(ListCompanyConsentRequestsResponse.parse(rows.map(r => requestResponse(r.consent, r.slug))));
});
router.post("/company/talent-pool/consent-requests", ...companyOnly, async (req, res): Promise<void> => {
  const body = RequestCompanyTalentConsentBody.safeParse(req.body); if (!body.success) { res.status(400).json({ error: "Permintaan consent tidak valid." }); return; }
  const company = getAuthenticatedUser(req); const [row] = await db.select({ passport: professionalPassportsTable }).from(professionalPassportsTable).innerJoin(usersTable, eq(professionalPassportsTable.memberUserId, usersTable.id)).where(and(eq(professionalPassportsTable.slug, body.data.passportSlug), eq(usersTable.role, "member"))).limit(1);
  if (!row) { res.status(404).json({ error: "Passport tidak ditemukan." }); return; }
  const [existing] = await db.select().from(companyTalentConsentsTable).where(and(eq(companyTalentConsentsTable.memberUserId, row.passport.memberUserId), eq(companyTalentConsentsTable.companyUserId, company.id))).limit(1);
  if (existing?.status === "active") { res.status(201).json(RequestCompanyTalentConsentResponse.parse(requestResponse(existing, row.passport.slug))); return; }
  const now = new Date(); const consent = await db.transaction(async tx => {
    const [created] = await tx.insert(companyTalentConsentsTable).values({ id: randomUUID(), memberUserId: row.passport.memberUserId, companyUserId: company.id, status: "requested", requestedAt: now, requestNote: body.data.note ?? null }).onConflictDoUpdate({ target: [companyTalentConsentsTable.memberUserId, companyTalentConsentsTable.companyUserId], set: { status: "requested", requestedAt: now, grantedAt: null, revokedAt: null, expiresAt: null, requestNote: body.data.note ?? null, decisionNote: null, consentVersion: sql`${companyTalentConsentsTable.consentVersion} + 1`, updatedAt: now } }).returning();
    await recordConsentAudit(tx, company, { action: "talent_consent.requested", entityId: created.id, toStatus: "requested", note: body.data.note }); await notify(tx, created.memberUserId, "Permintaan akses Talent Pool", "Sebuah perusahaan meminta akses ke Professional Passport Anda.", `consent-request:${created.id}:v${created.consentVersion}`); return created;
  });
  res.status(201).json(RequestCompanyTalentConsentResponse.parse(requestResponse(consent, row.passport.slug)));
});
function adminConsent(c: typeof companyTalentConsentsTable.$inferSelect, memberName: string, companyName: string) {
  return { id: c.id, memberUserId: c.memberUserId, memberName, companyUserId: c.companyUserId, companyName, status: c.status as "requested" | "active" | "denied" | "revoked" | "expired", grantedAt: c.grantedAt, revokedAt: c.revokedAt, expiresAt: c.expiresAt, consentVersion: c.consentVersion, grantedBy: c.grantedBy, revokedBy: c.revokedBy, requestNote: c.requestNote, decisionNote: c.decisionNote, updatedAt: c.updatedAt };
}
router.get("/admin/talent-pool", ...adminOnly, async (req, res): Promise<void> => {
  const query = GetAdminTalentPoolQueryParams.safeParse(req.query); if (!query.success) { res.status(400).json({ error: "Filter Talent Pool tidak valid." }); return; } await expireCompanyTalentConsents(); const q = query.data;
  const filters = and(q.consent !== "all" ? eq(companyTalentConsentsTable.status, q.consent) : undefined, q.companyId ? eq(companyTalentConsentsTable.companyUserId, q.companyId) : undefined, q.availability ? eq(professionalPassportsTable.availabilityStatus, q.availability) : undefined, q.search ? or(ilike(usersTable.name, `%${q.search}%`), ilike(professionalPassportsTable.headline, `%${q.search}%`), ilike(memberProfilesTable.expertise, `%${q.search}%`)) : undefined, q.location ? or(ilike(memberProfilesTable.domicile, `%${q.location}%`), sql`${professionalPassportsTable.preferredLocations}::text ILIKE ${`%${q.location}%`}`) : undefined);
  const [totalRows, rows] = await Promise.all([
    db.select({ value: count() }).from(companyTalentConsentsTable).innerJoin(usersTable, eq(companyTalentConsentsTable.memberUserId, usersTable.id)).innerJoin(companyProfilesTable, eq(companyTalentConsentsTable.companyUserId, companyProfilesTable.userId)).leftJoin(professionalPassportsTable, eq(professionalPassportsTable.memberUserId, usersTable.id)).leftJoin(memberProfilesTable, eq(memberProfilesTable.userId, usersTable.id)).where(filters),
    db.select({ consent: companyTalentConsentsTable, memberName: usersTable.name, companyName: companyProfilesTable.companyName }).from(companyTalentConsentsTable).innerJoin(usersTable, eq(companyTalentConsentsTable.memberUserId, usersTable.id)).innerJoin(companyProfilesTable, eq(companyTalentConsentsTable.companyUserId, companyProfilesTable.userId)).leftJoin(professionalPassportsTable, eq(professionalPassportsTable.memberUserId, usersTable.id)).leftJoin(memberProfilesTable, eq(memberProfilesTable.userId, usersTable.id)).where(filters).orderBy(desc(companyTalentConsentsTable.updatedAt)).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
  ]);
  const total = Number(totalRows[0]?.value ?? 0); res.json(GetAdminTalentPoolResponse.parse({ items: rows.map(r => adminConsent(r.consent, r.memberName, r.companyName)), page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) }));
});
router.get("/admin/talent-pool/settings", ...adminOnly, async (_req, res) => res.json(GetAdminTalentConsentSettingsResponse.parse(settingsResponse(await getTalentConsentSettings()))));
router.patch("/admin/talent-pool/settings", ...adminOnly, async (req, res): Promise<void> => {
  const body = UpdateAdminTalentConsentSettingsBody.safeParse(req.body); if (!body.success) { res.status(400).json({ error: "Pengaturan consent tidak valid." }); return; }
  const actor = getAuthenticatedUser(req), old = await getTalentConsentSettings(); const updated = await db.transaction(async tx => {
    const [changed] = await tx.update(talentConsentSettingsTable).set({ defaultDurationDays: body.data.defaultDurationDays, updatedBy: actor.id, updatedAt: new Date() }).where(eq(talentConsentSettingsTable.id, old.id)).returning();
    await recordConsentAudit(tx, actor, { action: "talent_consent.settings_updated", entityId: changed.id, note: body.data.note }); return changed;
  }); res.json(UpdateAdminTalentConsentSettingsResponse.parse(settingsResponse(updated)));
});
router.patch("/admin/talent-pool/consents/:id", ...adminOnly, async (req, res): Promise<void> => {
  const params = OverrideAdminTalentConsentParams.safeParse(req.params), body = OverrideAdminTalentConsentBody.safeParse(req.body); if (!params.success || !body.success || (body.data.action === "set_expiry" && !body.data.expiresAt)) { res.status(400).json({ error: "Override consent tidak valid." }); return; }
  await expireCompanyTalentConsents();
  const actor = getAuthenticatedUser(req); const [old] = await db.select().from(companyTalentConsentsTable).where(eq(companyTalentConsentsTable.id, params.data.id)).limit(1); if (!old) { res.status(404).json({ error: "Consent tidak ditemukan." }); return; } const now = new Date(), revoke = body.data.action === "revoke";
  if (!revoke && (old.status !== "active" || !body.data.expiresAt || body.data.expiresAt <= now)) { res.status(400).json({ error: "Masa berlaku hanya dapat diubah untuk consent aktif dengan tanggal masa depan." }); return; }
  const [member, company] = await Promise.all([db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, old.memberUserId)).limit(1), db.select({ name: companyProfilesTable.companyName }).from(companyProfilesTable).where(eq(companyProfilesTable.userId, old.companyUserId)).limit(1)]);
  const updated = await db.transaction(async tx => {
    const [changed] = await tx.update(companyTalentConsentsTable).set({ status: revoke ? "revoked" : old.status, revokedAt: revoke ? now : old.revokedAt, revokedBy: revoke ? actor.id : old.revokedBy, expiresAt: revoke ? old.expiresAt : body.data.expiresAt!, decisionNote: body.data.note, consentVersion: old.consentVersion + 1, updatedAt: now }).where(eq(companyTalentConsentsTable.id, old.id)).returning();
    await recordConsentAudit(tx, actor, { action: revoke ? "talent_consent.admin_revoked" : "talent_consent.expiry_overridden", entityId: old.id, fromStatus: old.status, toStatus: changed.status, note: body.data.note }); await notify(tx, old.memberUserId, "Consent Talent Pool diperbarui", "Admin memperbarui status atau masa berlaku consent Anda.", `consent-admin:${old.id}:v${changed.consentVersion}:member`); await notify(tx, old.companyUserId, "Consent Talent Pool diperbarui", "Admin memperbarui status atau masa berlaku akses Talent Pool.", `consent-admin:${old.id}:v${changed.consentVersion}:company`); return changed;
  });
  res.json(OverrideAdminTalentConsentResponse.parse(adminConsent(updated, member[0]?.name ?? "", company[0]?.name ?? "")));
});
export default router;