import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetMemberJourneyResponse,
  SaveMemberDiagnosticBody,
  SaveMemberDiagnosticResponse,
  SaveMemberEvidenceBody,
  SaveMemberEvidenceResponse,
  UpdateMemberEvidenceBody,
  UpdateMemberEvidenceParams,
  UpdateMemberEvidenceResponse,
} from "@workspace/api-zod";
import {
  db,
  enrollmentsTable,
  matchingsTable,
  memberEvidenceTable,
  memberProfilesTable,
  programProgressTable,
  programsTable,
  readinessDiagnosticsTable,
} from "@workspace/db";
import { getAuthenticatedUser, requireRole, requireUser } from "../lib/auth";

const router: IRouter = Router();
const memberOnly = [requireUser, requireRole("member")];

const milestoneNames = ["Orientasi", "Praktik terarah", "Bukti kompetensi", "Refleksi & evaluasi"];

function dateOrNull(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function diagnosticResponse(diagnostic: typeof readinessDiagnosticsTable.$inferSelect) {
  return {
    ...diagnostic,
    answers: diagnostic.answers as Record<string, number>,
    focusAreas: diagnostic.focusAreas as string[],
    completedAt: diagnostic.completedAt,
    updatedAt: diagnostic.updatedAt,
  };
}

function evidenceResponse(evidence: typeof memberEvidenceTable.$inferSelect) {
  return {
    ...evidence,
    submittedAt: dateOrNull(evidence.submittedAt),
    verifiedAt: dateOrNull(evidence.verifiedAt),
    createdAt: evidence.createdAt,
    updatedAt: evidence.updatedAt,
  };
}

router.get("/member/journey", ...memberOnly, async (req, res): Promise<void> => {
  const user = getAuthenticatedUser(req);
  const [[diagnostic], profile, evidences, enrollments, matchings, programs, progressRows] = await Promise.all([
    db.select().from(readinessDiagnosticsTable).where(eq(readinessDiagnosticsTable.memberUserId, user.id)).limit(1),
    db.select().from(memberProfilesTable).where(eq(memberProfilesTable.userId, user.id)).limit(1),
    db.select().from(memberEvidenceTable).where(eq(memberEvidenceTable.memberUserId, user.id)).orderBy(desc(memberEvidenceTable.updatedAt)),
    db.select().from(enrollmentsTable).where(eq(enrollmentsTable.memberUserId, user.id)).orderBy(desc(enrollmentsTable.updatedAt)),
    db.select().from(matchingsTable).where(eq(matchingsTable.candidateUserId, user.id)).orderBy(desc(matchingsTable.score)),
    db.select().from(programsTable).where(eq(programsTable.status, "published")),
    db.select().from(programProgressTable).where(eq(programProgressTable.memberUserId, user.id)),
  ]);
  const programById = new Map(programs.map((program) => [program.id, program]));
  const progressByProgram = new Map(progressRows.map((row) => [row.programId, row]));
  const learningProgress = enrollments
    .filter((enrollment) => enrollment.status !== "cancelled")
    .map((enrollment) => {
      const program = programById.get(enrollment.programId);
      const stored = progressByProgram.get(enrollment.programId);
      const progress = stored?.progress ?? (enrollment.status === "completed" ? 100 : enrollment.status === "enrolled" ? 24 : 0);
      return {
        id: stored?.id ?? enrollment.id,
        programId: enrollment.programId,
        programName: program?.name ?? "Program tidak ditemukan",
        status: enrollment.status,
        progress,
        currentMilestone: stored?.currentMilestone ?? milestoneNames[Math.min(Math.floor(progress / 25), milestoneNames.length - 1)],
        milestones: (stored?.milestones as string[] | undefined) ?? milestoneNames,
        updatedAt: stored?.updatedAt ?? enrollment.updatedAt,
      };
    });
  const profileText = `${profile[0]?.expertise ?? ""} ${profile[0]?.primaryGoal ?? ""}`.toLowerCase();
  const recommendedPrograms = programs
    .filter((program) => !enrollments.some((enrollment) => enrollment.programId === program.id))
    .sort((a, b) => {
      const aMatch = profileText.includes(a.category.toLowerCase()) ? 1 : 0;
      const bMatch = profileText.includes(b.category.toLowerCase()) ? 1 : 0;
      return bMatch - aMatch;
    })
    .slice(0, 3)
    .map((program) => ({ ...program, price: Number(program.price) }));

  res.json(
    GetMemberJourneyResponse.parse({
      diagnostic: diagnostic ? diagnosticResponse(diagnostic) : null,
      evidences: evidences.map(evidenceResponse),
      learningProgress,
      opportunities: matchings,
      recommendedPrograms,
    }),
  );
});

router.post("/member/diagnostics", ...memberOnly, async (req, res): Promise<void> => {
  const body = SaveMemberDiagnosticBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Jawaban diagnostik belum lengkap atau tidak valid." });
    return;
  }
  const user = getAuthenticatedUser(req);
  const values = Object.values(body.data.answers);
  const score = Math.round((values.reduce((sum, value) => sum + value, 0) / (values.length * 5)) * 100);
  const focusAreas = Object.entries(body.data.answers)
    .filter(([, value]) => value <= 2)
    .map(([key]) => body.data.areaLabels[key] ?? key);
  const [diagnostic] = await db
    .insert(readinessDiagnosticsTable)
    .values({ id: `${user.id}-diagnostic`, memberUserId: user.id, answers: body.data.answers, score, focusAreas })
    .onConflictDoUpdate({
      target: readinessDiagnosticsTable.memberUserId,
      set: { answers: body.data.answers, score, focusAreas, completedAt: new Date(), updatedAt: new Date() },
    })
    .returning();
  res.json(SaveMemberDiagnosticResponse.parse(diagnosticResponse(diagnostic)));
});

router.post("/member/evidence", ...memberOnly, async (req, res): Promise<void> => {
  const body = SaveMemberEvidenceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Bukti kompetensi belum lengkap atau tidak valid." });
    return;
  }
  const user = getAuthenticatedUser(req);
  const now = new Date();
  const [evidence] = await db.insert(memberEvidenceTable).values({
    id: randomUUID(),
    memberUserId: user.id,
    ...body.data,
    submittedAt: body.data.status === "submitted" ? now : null,
  }).returning();
  res.status(201).json(SaveMemberEvidenceResponse.parse(evidenceResponse(evidence)));
});

router.patch("/member/evidence/:id", ...memberOnly, async (req, res): Promise<void> => {
  const params = UpdateMemberEvidenceParams.safeParse(req.params);
  const body = UpdateMemberEvidenceBody.safeParse(req.body);
  if (!params.success || !body.success || Object.keys(body.data).length === 0) {
    res.status(400).json({ error: "Perubahan bukti kompetensi tidak valid." });
    return;
  }
  const user = getAuthenticatedUser(req);
  const [existing] = await db.select().from(memberEvidenceTable).where(and(eq(memberEvidenceTable.id, params.data.id), eq(memberEvidenceTable.memberUserId, user.id))).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Bukti kompetensi tidak ditemukan." });
    return;
  }
  const status = body.data.status;
  const [evidence] = await db.update(memberEvidenceTable).set({
    ...body.data,
    submittedAt: status === "submitted" ? existing.submittedAt ?? new Date() : existing.submittedAt,
    updatedAt: new Date(),
  }).where(eq(memberEvidenceTable.id, existing.id)).returning();
  res.json(UpdateMemberEvidenceResponse.parse(evidenceResponse(evidence)));
});

export default router;