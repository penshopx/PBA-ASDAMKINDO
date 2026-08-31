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
  verificationsTable,
} from "@workspace/db";
import { getAuthenticatedUser, requireRole, requireUser } from "../lib/auth";

const router: IRouter = Router();
const memberOnly = [requireUser, requireRole("member")];

const milestoneNames = ["Orientasi", "Praktik terarah", "Bukti kompetensi", "Refleksi & evaluasi"];
const diagnosticQuestions = {
  technical: "Penguasaan teknis sesuai bidang",
  safety: "Keselamatan dan kepatuhan kerja",
  communication: "Komunikasi dan kolaborasi",
  problemSolving: "Pemecahan masalah",
  evidence: "Kesiapan menunjukkan bukti",
} as const;
const diagnosticQuestionKeys = Object.keys(diagnosticQuestions);

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
    .map((program) => ({
      ...program,
      price: Number(program.price),
      enrolledCount: 0,
      completedCount: 0,
    }));

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
  const answerKeys = Object.keys(body.data.answers);
  const answersAreComplete =
    answerKeys.length === diagnosticQuestionKeys.length &&
    diagnosticQuestionKeys.every((key) => answerKeys.includes(key)) &&
    Object.values(body.data.answers).every(
      (value) => Number.isInteger(value) && value >= 1 && value <= 5,
    );
  if (!answersAreComplete) {
    res.status(400).json({ error: "Jawaban diagnostik belum lengkap atau tidak valid." });
    return;
  }
  const user = getAuthenticatedUser(req);
  const values = Object.values(body.data.answers);
  const score = Math.round((values.reduce((sum, value) => sum + value, 0) / (values.length * 5)) * 100);
  const focusAreas = Object.entries(body.data.answers)
    .filter(([, value]) => value <= 2)
    .map(([key]) => diagnosticQuestions[key as keyof typeof diagnosticQuestions]);
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
  const title = body.data.title.trim();
  const description = body.data.description.trim();
  if (title.length < 2 || description.length === 0) {
    res.status(400).json({ error: "Judul dan deskripsi bukti wajib diisi." });
    return;
  }
  const user = getAuthenticatedUser(req);
  const now = new Date();
  const evidenceId = randomUUID();
  const result = await db.transaction(async (tx) => {
    const [created] = await tx.insert(memberEvidenceTable).values({
      id: evidenceId,
      memberUserId: user.id,
      clientRequestId: body.data.clientRequestId,
      evidenceType: body.data.evidenceType,
      title,
      description,
      referenceUrl: body.data.referenceUrl ?? null,
      status: body.data.status,
      submittedAt: body.data.status === "submitted" ? now : null,
    }).onConflictDoNothing({
      target: [memberEvidenceTable.memberUserId, memberEvidenceTable.clientRequestId],
    }).returning();
    const [evidence] = created
      ? [created]
      : await tx
          .select()
          .from(memberEvidenceTable)
          .where(and(
            eq(memberEvidenceTable.memberUserId, user.id),
            eq(memberEvidenceTable.clientRequestId, body.data.clientRequestId),
          ))
          .limit(1);
    if (!evidence) {
      throw new Error("Idempotent evidence could not be loaded after insert conflict.");
    }
    if (created && body.data.status === "submitted") {
      await tx.insert(verificationsTable).values({
        id: `verification-${evidence.id}`,
        subjectType: "competency",
        subjectId: evidence.id,
        subjectName: evidence.title,
        evidenceType: evidence.evidenceType,
        status: "pending",
        submittedByUserId: user.id,
      }).onConflictDoNothing();
    }
    return { evidence, created: Boolean(created) };
  });
  const expectedReferenceUrl = body.data.referenceUrl ?? null;
  if (!result.created && (
    result.evidence.evidenceType !== body.data.evidenceType ||
    result.evidence.title !== title ||
    result.evidence.description !== description ||
    result.evidence.referenceUrl !== expectedReferenceUrl ||
    result.evidence.status !== body.data.status
  )) {
    res.status(409).json({ error: "Kunci permintaan ini sudah dipakai untuk data bukti yang berbeda." });
    return;
  }
  res.status(201).json(SaveMemberEvidenceResponse.parse(evidenceResponse(result.evidence)));
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
  const requestedDetails = body.data.evidenceType !== undefined ||
    body.data.title !== undefined ||
    body.data.description !== undefined ||
    body.data.referenceUrl !== undefined;
  const isResubmission = existing.status === "changes_requested" && status === "submitted";
  const isInitialSubmission = existing.status === "draft" && status === "submitted";
  const isIdempotentSubmission = existing.status === "submitted" && status === "submitted" && !requestedDetails;

  if (existing.status === "verified" || existing.status === "rejected") {
    res.status(409).json({ error: "Bukti yang sudah diputuskan tidak dapat diubah." });
    return;
  }
  if (existing.status === "submitted" && !isIdempotentSubmission) {
    res.status(409).json({ error: "Bukti yang sedang ditinjau tidak dapat diubah." });
    return;
  }
  if (isIdempotentSubmission) {
    const current = await db.transaction(async (tx) => {
      await tx.insert(verificationsTable).values({
        id: `verification-${existing.id}`,
        subjectType: "competency",
        subjectId: existing.id,
        subjectName: existing.title,
        evidenceType: existing.evidenceType,
        status: "pending",
        submittedByUserId: user.id,
      }).onConflictDoNothing();
      const [latest] = await tx
        .select()
        .from(memberEvidenceTable)
        .where(and(
          eq(memberEvidenceTable.id, existing.id),
          eq(memberEvidenceTable.memberUserId, user.id),
        ))
        .limit(1);
      return latest;
    });
    if (!current) {
      res.status(404).json({ error: "Bukti kompetensi tidak ditemukan." });
      return;
    }
    res.json(UpdateMemberEvidenceResponse.parse(evidenceResponse(current)));
    return;
  }
  if (existing.status === "changes_requested" && status === "draft") {
    res.status(400).json({ error: "Bukti dengan permintaan perubahan harus diajukan ulang, bukan diturunkan menjadi draft." });
    return;
  }
  if (status === "submitted" && !isInitialSubmission && !isResubmission && !isIdempotentSubmission) {
    res.status(400).json({ error: "Transisi status bukti tidak valid." });
    return;
  }

  const nextTitle = body.data.title?.trim() ?? existing.title;
  const nextDescription = body.data.description?.trim() ?? existing.description;
  if (requestedDetails && (nextTitle.length < 2 || nextDescription.length === 0)) {
    res.status(400).json({ error: "Judul dan deskripsi bukti wajib diisi." });
    return;
  }
  const now = new Date();
  const evidence = await db.transaction(async (tx) => {
    const nextStatus = status ?? existing.status;
    const shouldSubmit = nextStatus === "submitted" && (isInitialSubmission || isResubmission);
    const [updated] = await tx.update(memberEvidenceTable).set({
      ...(body.data.evidenceType === undefined ? {} : { evidenceType: body.data.evidenceType }),
      ...(body.data.title === undefined ? {} : { title: nextTitle }),
      ...(body.data.description === undefined ? {} : { description: nextDescription }),
      ...(body.data.referenceUrl === undefined ? {} : { referenceUrl: body.data.referenceUrl ?? null }),
      ...(status === undefined ? {} : { status }),
      submittedAt: shouldSubmit ? now : existing.submittedAt,
      verifiedAt: shouldSubmit ? null : existing.verifiedAt,
      updatedAt: now,
    }).where(and(
      eq(memberEvidenceTable.id, existing.id),
      eq(memberEvidenceTable.status, existing.status),
    )).returning();
    if (!updated) return null;

    if (shouldSubmit) {
      await tx.insert(verificationsTable).values({
        id: `verification-${updated.id}`,
        subjectType: "competency",
        subjectId: updated.id,
        subjectName: updated.title,
        evidenceType: updated.evidenceType,
        status: "pending",
        submittedByUserId: user.id,
      }).onConflictDoNothing();
      await tx.update(verificationsTable).set({
        subjectName: updated.title,
        evidenceType: updated.evidenceType,
        status: "pending",
        submittedAt: now,
        reviewedByUserId: null,
        reviewedAt: null,
        reviewNote: null,
      }).where(and(
        eq(verificationsTable.subjectType, "competency"),
        eq(verificationsTable.subjectId, updated.id),
      ));
    }
    return updated;
  });
  if (!evidence) {
    const [current] = await db
      .select()
      .from(memberEvidenceTable)
      .where(and(eq(memberEvidenceTable.id, existing.id), eq(memberEvidenceTable.memberUserId, user.id)))
      .limit(1);
    if (current?.status === "submitted" && status === "submitted" && !requestedDetails) {
      res.json(UpdateMemberEvidenceResponse.parse(evidenceResponse(current)));
      return;
    }
    res.status(409).json({ error: "Status bukti berubah. Muat ulang sebelum mencoba kembali." });
    return;
  }
  res.json(UpdateMemberEvidenceResponse.parse(evidenceResponse(evidence)));
});

export default router;