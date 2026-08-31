import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateCompanyRequirementBody,
  CreateCompanyRequirementResponse,
  CreateCompanyShortlistBody,
  CreateCompanyShortlistResponse,
  ListCompanyRequirementsResponse,
  ListCompanyTalentPoolQueryParams,
  ListCompanyTalentPoolResponse,
  UpdateCompanyRequirementBody,
  UpdateCompanyRequirementParams,
  UpdateCompanyRequirementResponse,
  UpdateCompanyShortlistBody,
  UpdateCompanyShortlistParams,
  UpdateCompanyShortlistResponse,
} from "@workspace/api-zod";
import {
  companyProfilesTable,
  companyRequirementsTable,
  db,
  matchingsTable,
  memberProfilesTable,
  notificationsTable,
  readinessDiagnosticsTable,
  usersTable,
} from "@workspace/db";
import { getAuthenticatedUser, requireRole, requireUser } from "../lib/auth";

const router: IRouter = Router();
const companyOnly = [requireUser, requireRole("company")];
const pipelineStatuses = ["review", "shortlisted", "interview", "placed"] as const;

function calendarDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function requirementInput(values: {
  kind: "talent" | "training";
  title: string;
  description: string;
  location: string;
  competencies: string[];
  minimumExperience: number;
  headcount: number;
  deadline: Date;
  status: "draft" | "open" | "closed";
}) {
  return {
    ...values,
    deadline: calendarDate(values.deadline),
  };
}

async function requirementResponse(requirement: typeof companyRequirementsTable.$inferSelect) {
  const [{ value }] = await db
    .select({ value: count(matchingsTable.id) })
    .from(matchingsTable)
    .where(eq(matchingsTable.requirementId, requirement.id));
  return {
    ...requirement,
    candidateCount: Number(value ?? 0),
  };
}

function matchingResponse(matching: typeof matchingsTable.$inferSelect) {
  return {
    id: matching.id,
    requirement: matching.requirement,
    companyName: matching.companyName,
    candidateUserId: matching.candidateUserId,
    candidateName: matching.candidateName,
    score: matching.score,
    status: matching.status,
    updatedAt: matching.updatedAt,
  };
}

function readinessLabel(score: number): string {
  return score >= 80 ? "Sangat siap" : score >= 60 ? "Cukup siap" : score > 0 ? "Perlu diperkuat" : "Belum dinilai";
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("id-ID");
}

function scoreCandidate(
  requirement: typeof companyRequirementsTable.$inferSelect,
  profile: typeof memberProfilesTable.$inferSelect,
  readinessScore: number,
) {
  const expertise = normalize(profile.expertise);
  const competencies = requirement.competencies.map(normalize).filter(Boolean);
  const matchedCompetencies = competencies.filter((competency) => expertise.includes(competency));
  const competencyScore = competencies.length ? (matchedCompetencies.length / competencies.length) * 50 : 0;
  const experienceMatch = profile.experienceYears >= requirement.minimumExperience;
  const locationMatch =
    normalize(profile.domicile).includes(normalize(requirement.location)) ||
    normalize(requirement.location).includes(normalize(profile.domicile));
  const score = Math.round(
    competencyScore +
      (experienceMatch ? 20 : Math.min(20, (profile.experienceYears / Math.max(requirement.minimumExperience, 1)) * 20)) +
      (locationMatch ? 15 : 0) +
      Math.min(15, readinessScore * 0.15),
  );
  const matchReasons = matchedCompetencies.length
    ? [`Kompetensi relevan: ${matchedCompetencies.join(", ")}`]
    : ["Profil kompetensi tersedia untuk ditinjau"];
  if (experienceMatch) matchReasons.push(`Pengalaman ${profile.experienceYears} tahun memenuhi minimum`);
  if (locationMatch) matchReasons.push(`Domisili sesuai area ${requirement.location}`);
  if (readinessScore >= 60) matchReasons.push(`Readiness score ${readinessScore} menunjukkan kesiapan yang baik`);
  return { score: Math.min(100, score), matchReasons };
}

router.get("/company/requirements", ...companyOnly, async (req, res): Promise<void> => {
  const user = getAuthenticatedUser(req);
  const requirements = await db
    .select()
    .from(companyRequirementsTable)
    .where(eq(companyRequirementsTable.companyUserId, user.id))
    .orderBy(desc(companyRequirementsTable.updatedAt));
  res.json(ListCompanyRequirementsResponse.parse(await Promise.all(requirements.map(requirementResponse))));
});

router.post("/company/requirements", ...companyOnly, async (req, res): Promise<void> => {
  const body = CreateCompanyRequirementBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Data kebutuhan belum lengkap atau tidak valid." });
    return;
  }
  const user = getAuthenticatedUser(req);
  const [created] = await db
    .insert(companyRequirementsTable)
    .values({
      id: `requirement-${randomUUID()}`,
      companyUserId: user.id,
      ...requirementInput(body.data),
    })
    .returning();
  res.status(201).json(CreateCompanyRequirementResponse.parse(await requirementResponse(created)));
});

router.patch("/company/requirements/:id", ...companyOnly, async (req, res): Promise<void> => {
  const params = UpdateCompanyRequirementParams.safeParse(req.params);
  const body = UpdateCompanyRequirementBody.safeParse(req.body);
  if (!params.success || !body.success || Object.keys(body.data).length === 0) {
    res.status(400).json({ error: "Perubahan kebutuhan tidak valid." });
    return;
  }
  const user = getAuthenticatedUser(req);
  const [existing] = await db
    .select()
    .from(companyRequirementsTable)
    .where(and(eq(companyRequirementsTable.id, params.data.id), eq(companyRequirementsTable.companyUserId, user.id)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Kebutuhan tidak ditemukan." });
    return;
  }
  const [updated] = await db
    .update(companyRequirementsTable)
    .set({
      ...(body.data.kind === undefined ? {} : { kind: body.data.kind }),
      ...(body.data.title === undefined ? {} : { title: body.data.title }),
      ...(body.data.description === undefined ? {} : { description: body.data.description }),
      ...(body.data.location === undefined ? {} : { location: body.data.location }),
      ...(body.data.competencies === undefined ? {} : { competencies: body.data.competencies }),
      ...(body.data.minimumExperience === undefined ? {} : { minimumExperience: body.data.minimumExperience }),
      ...(body.data.headcount === undefined ? {} : { headcount: body.data.headcount }),
      ...(body.data.deadline === undefined ? {} : { deadline: calendarDate(body.data.deadline) }),
      ...(body.data.status === undefined ? {} : { status: body.data.status }),
      updatedAt: new Date(),
    })
    .where(eq(companyRequirementsTable.id, existing.id))
    .returning();
  res.json(UpdateCompanyRequirementResponse.parse(await requirementResponse(updated)));
});

router.get("/company/talent-pool/matches", ...companyOnly, async (req, res): Promise<void> => {
  const query = ListCompanyTalentPoolQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Pilih kebutuhan untuk melihat Talent Pool." });
    return;
  }
  const user = getAuthenticatedUser(req);
  const [requirement] = await db
    .select()
    .from(companyRequirementsTable)
    .where(and(eq(companyRequirementsTable.id, query.data.requirementId), eq(companyRequirementsTable.companyUserId, user.id)))
    .limit(1);
  if (!requirement) {
    res.status(404).json({ error: "Kebutuhan tidak ditemukan." });
    return;
  }
  const rows = await db
    .select({
      user: usersTable,
      profile: memberProfilesTable,
      diagnostic: readinessDiagnosticsTable,
      matching: matchingsTable,
    })
    .from(memberProfilesTable)
    .innerJoin(usersTable, and(eq(memberProfilesTable.userId, usersTable.id), eq(usersTable.role, "member")))
    .leftJoin(readinessDiagnosticsTable, eq(readinessDiagnosticsTable.memberUserId, memberProfilesTable.userId))
    .leftJoin(
      matchingsTable,
      and(
        eq(matchingsTable.requirementId, requirement.id),
        eq(matchingsTable.candidateUserId, memberProfilesTable.userId),
        eq(matchingsTable.companyUserId, user.id),
      ),
    )
    .where(eq(memberProfilesTable.dataConsent, true));
  const candidates = rows
    .map(({ user: member, profile, diagnostic, matching }) => {
      const readinessScore = diagnostic?.score ?? 0;
      const scored = scoreCandidate(requirement, profile, readinessScore);
      return {
        memberUserId: member.id,
        name: member.name,
        domicile: profile.domicile,
        expertise: profile.expertise,
        experienceYears: profile.experienceYears,
        readinessScore,
        readinessLabel: readinessLabel(readinessScore),
        score: scored.score,
        matchReasons: scored.matchReasons,
        matchingId: matching?.id ?? null,
        status: matching?.status ?? "new",
      };
    })
    .sort((a, b) => b.score - a.score || b.readinessScore - a.readinessScore);
  res.json(ListCompanyTalentPoolResponse.parse(candidates));
});

router.post("/company/shortlist", ...companyOnly, async (req, res): Promise<void> => {
  const body = CreateCompanyShortlistBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Kebutuhan dan kandidat wajib dipilih." });
    return;
  }
  const user = getAuthenticatedUser(req);
  const [requirement] = await db
    .select()
    .from(companyRequirementsTable)
    .where(and(eq(companyRequirementsTable.id, body.data.requirementId), eq(companyRequirementsTable.companyUserId, user.id)))
    .limit(1);
  const [candidate] = await db
    .select({ user: usersTable, profile: memberProfilesTable, diagnostic: readinessDiagnosticsTable })
    .from(memberProfilesTable)
    .innerJoin(usersTable, and(eq(memberProfilesTable.userId, usersTable.id), eq(usersTable.role, "member")))
    .leftJoin(readinessDiagnosticsTable, eq(readinessDiagnosticsTable.memberUserId, memberProfilesTable.userId))
    .where(and(eq(memberProfilesTable.userId, body.data.memberUserId), eq(memberProfilesTable.dataConsent, true)))
    .limit(1);
  if (!requirement || !candidate) {
    res.status(404).json({ error: "Kebutuhan atau kandidat tidak ditemukan." });
    return;
  }
  const [existing] = await db
    .select()
    .from(matchingsTable)
    .where(
      and(
        eq(matchingsTable.requirementId, requirement.id),
        eq(matchingsTable.companyUserId, user.id),
        eq(matchingsTable.candidateUserId, candidate.user.id),
      ),
    )
    .limit(1);
  if (existing) {
    res.json(CreateCompanyShortlistResponse.parse(matchingResponse(existing)));
    return;
  }
  const score = scoreCandidate(requirement, candidate.profile, candidate.diagnostic?.score ?? 0);
  const [companyProfile] = await db.select().from(companyProfilesTable).where(eq(companyProfilesTable.userId, user.id)).limit(1);
  const [created] = await db.transaction(async (tx) => {
    const [matching] = await tx
      .insert(matchingsTable)
      .values({
        id: `matching-${randomUUID()}`,
        requirementId: requirement.id,
        companyUserId: user.id,
        requirement: requirement.title,
        companyName: companyProfile?.companyName ?? user.organization ?? user.name,
        candidateUserId: candidate.user.id,
        candidateName: candidate.user.name,
        score: score.score,
        status: "shortlisted",
      })
      .returning();
    await tx.insert(notificationsTable).values([
      {
        id: `notification-${randomUUID()}`,
        userId: user.id,
        title: "Kandidat masuk shortlist",
        description: `${candidate.user.name} tersimpan untuk kebutuhan ${requirement.title}.`,
        type: "recruitment",
      },
      {
        id: `notification-${randomUUID()}`,
        userId: candidate.user.id,
        title: "Profil Anda ditinjau perusahaan",
        description: `Profil Anda sedang ditinjau untuk kebutuhan ${requirement.title}.`,
        type: "recruitment",
      },
    ]);
    return [matching];
  });
  res.status(201).json(CreateCompanyShortlistResponse.parse(matchingResponse(created)));
});

router.patch("/company/shortlist/:id", ...companyOnly, async (req, res): Promise<void> => {
  const params = UpdateCompanyShortlistParams.safeParse(req.params);
  const body = UpdateCompanyShortlistBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Status shortlist tidak valid." });
    return;
  }
  const user = getAuthenticatedUser(req);
  const [existing] = await db
    .select()
    .from(matchingsTable)
    .where(and(eq(matchingsTable.id, params.data.id), eq(matchingsTable.companyUserId, user.id)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Item shortlist tidak ditemukan." });
    return;
  }
  const [updated] = await db
    .update(matchingsTable)
    .set({ status: body.data.status, updatedAt: new Date() })
    .where(eq(matchingsTable.id, existing.id))
    .returning();
  await db.insert(notificationsTable).values({
    id: `notification-${randomUUID()}`,
    userId: user.id,
    title: "Pipeline kandidat diperbarui",
    description: `${existing.candidateName} untuk ${existing.requirement} sekarang berstatus ${body.data.status}.`,
    type: "recruitment",
  });
  if (existing.candidateUserId) {
    await db.insert(notificationsTable).values({
      id: `notification-${randomUUID()}`,
      userId: existing.candidateUserId,
      title: "Status peluang diperbarui",
      description: `Status tinjauan perusahaan untuk ${existing.requirement} berubah menjadi ${body.data.status}.`,
      type: "recruitment",
    });
  }
  res.json(UpdateCompanyShortlistResponse.parse(matchingResponse(updated)));
});

export default router;