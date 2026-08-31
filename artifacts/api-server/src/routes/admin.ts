import { randomUUID } from "node:crypto";
import { and, count, countDistinct, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateAdminProgramBody,
  CreateAdminProgramResponse,
  DecideVerificationBody,
  DecideVerificationParams,
  DecideVerificationResponse,
  GetAdminFunnelResponse,
  GetAdminOperationsResponse,
  IngestAdminTransactionSettlementBody,
  IngestAdminTransactionSettlementResponse,
  ListAdminMatchingsQueryParams,
  ListAdminMatchingsResponse,
  ListAdminAuditLogsResponse,
  ResolveAdminTransactionReconciliationBody,
  ResolveAdminTransactionReconciliationParams,
  ResolveAdminTransactionReconciliationResponse,
  UpdateAdminEnrollmentBody,
  UpdateAdminEnrollmentParams,
  UpdateAdminEnrollmentResponse,
  UpdateAdminMatchingBody,
  UpdateAdminMatchingParams,
  UpdateAdminMatchingResponse,
  UpdateAdminProgramBody,
  UpdateAdminProgramParams,
  UpdateAdminProgramResponse,
  UpdateAdminTransactionBody,
  UpdateAdminTransactionParams,
  UpdateAdminTransactionResponse,
} from "@workspace/api-zod";
import {
  auditLogsTable,
  companyTalentConsentsTable,
  companyRequirementsTable,
  db,
  enrollmentsTable,
  matchingsTable,
  memberEvidenceTable,
  memberProfilesTable,
  professionalPassportsTable,
  programsTable,
  readinessDiagnosticsTable,
  transactionsTable,
  usersTable,
  verificationsTable,
} from "@workspace/db";
import { getAuthenticatedUser, requireRole, requireUser } from "../lib/auth";
import { expireCompanyTalentConsents } from "../lib/talent-consent";
import { listTalentMatches } from "../lib/talent-matching";
import { getVerificationSla, syncVerificationSlaReminders } from "../lib/verification-sla";

const router: IRouter = Router();
const adminRoles = ["admin", "super_admin"] as const;
const superAdminOnly = [requireUser, requireRole("super_admin")];

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function programResponse(
  program: typeof programsTable.$inferSelect,
  enrollmentCount = 0,
  completionCount = 0,
) {
  return {
    ...program,
    price: Number(program.price),
    capacity: program.capacity,
    enrollmentCount,
    completionCount,
    enrolledCount: enrollmentCount,
    completedCount: completionCount,
  };
}

function verificationResponse(verification: typeof verificationsTable.$inferSelect, now = new Date()) {
  return {
    ...verification,
    submittedAt: verification.submittedAt,
    reviewedAt: iso(verification.reviewedAt),
    ...getVerificationSla(verification, now),
  };
}

const SETTLEMENT_SLA_DAYS = 7;
const CENT_TOLERANCE = 0.01;
const ISO_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

function isValidIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_DATE_TIME.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  const daysInMonth =
    month >= 1 && month <= 12
      ? new Date(Date.UTC(year, month, 0)).getUTCDate()
      : 0;

  return (
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 14 &&
    offsetMinute <= 59 &&
    (offsetHour < 14 || offsetMinute === 0)
  );
}

function transactionResponse(transaction: typeof transactionsTable.$inferSelect, now = new Date()) {
  const amount = Number(transaction.amount);
  const invoiceAmount = transaction.invoiceAmount === null ? amount : Number(transaction.invoiceAmount);
  const feeAmount = Number(transaction.feeAmount);
  const commission = Number(transaction.commission);
  const refundAmount = Number(transaction.refundAmount);
  const expectedSettlement = invoiceAmount - feeAmount - commission - refundAmount;
  const settlementAmount = transaction.settlementAmount === null ? null : Number(transaction.settlementAmount);
  const settlementDifference =
    settlementAmount === null ? null : Number((settlementAmount - expectedSettlement).toFixed(2));
  const settlementDueAt =
    transaction.settlementDueAt ?? new Date(transaction.occurredAt.getTime() + SETTLEMENT_SLA_DAYS * 24 * 60 * 60 * 1000);
  const settledAt = transaction.settledAt;
  const slaBreached =
    (settledAt !== null && settledAt.getTime() > settlementDueAt.getTime()) ||
    (settledAt === null && now.getTime() > settlementDueAt.getTime());
  const amountMismatch =
    settlementAmount !== null && Math.abs(settlementAmount - expectedSettlement) > CENT_TOLERANCE;
  const flags: Array<"settlement_missing" | "amount_mismatch" | "settlement_sla_breached"> = [];
  if (settlementAmount === null) flags.push("settlement_missing");
  if (amountMismatch) flags.push("amount_mismatch");
  if (slaBreached) flags.push("settlement_sla_breached");
  const reconciliationStatus =
    transaction.reconciliationStatus === "resolved"
      ? "resolved"
      : amountMismatch
        ? "mismatch"
        : slaBreached
          ? "overdue"
          : settlementAmount === null
            ? "pending"
            : "matched";

  return {
    ...transaction,
    amount,
    invoiceNumber: transaction.invoiceNumber ?? `INV-${transaction.referenceId}`,
    invoiceAmount,
    feeAmount,
    commission,
    refundAmount,
    expectedSettlement,
    settlementAmount,
    netSettlement: settlementAmount,
    settlementDifference,
    settlementDueAt,
    settledAt,
    reconciliationStatus,
    reconciliationFlags: flags,
    reconciliationResolvedAt: transaction.reconciliationResolvedAt,
  };
}

async function recordAudit(
  executor: any,
  actor: ReturnType<typeof getAuthenticatedUser>,
  values: {
    action: string;
    entityType: string;
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
    ...values,
  });
}

async function getAuditLogs(includeLogs: boolean) {
  if (!includeLogs) return [];
  const logs = await db
    .select({ log: auditLogsTable, actorName: usersTable.name })
    .from(auditLogsTable)
    .leftJoin(usersTable, eq(auditLogsTable.actorUserId, usersTable.id))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(100);
  return logs.map(({ log, actorName }) => ({
    ...log,
    actorName: actorName ?? "Admin PBA",
    createdAt: log.createdAt,
  }));
}

router.get("/admin/matchings", requireUser, requireRole(...adminRoles), async (req, res): Promise<void> => {
  const query = ListAdminMatchingsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Filter matching tidak valid." });
    return;
  }
  const actor = getAuthenticatedUser(req);
  await expireCompanyTalentConsents();
  const page = await listTalentMatches({
    requirementId: query.data.requirementId,
    companyId: query.data.companyId,
    search: query.data.search,
    minScore: query.data.minScore,
    location: query.data.location,
    skkLevel: query.data.skkLevel,
    experienceMin: query.data.experienceMin,
    availability: query.data.availability,
    verificationStatus: query.data.verificationStatus,
    status: query.data.status,
    page: query.data.page,
    pageSize: query.data.pageSize,
  });
  const entityId = query.data.requirementId ?? query.data.companyId ?? "cross-requirement";
  const actions = ["matching.generated", "matching.viewed", ...(query.data.refresh ? ["matching.refreshed"] : [])];
  await Promise.all(
    actions.map((action) =>
      recordAudit(db, actor, {
        action,
        entityType: "matching_review",
        entityId,
        note: `Admin meninjau halaman ${query.data.page} hasil matching.`,
      }),
    ),
  );
  res.json(ListAdminMatchingsResponse.parse(page));
});

router.get("/admin/funnel", requireUser, requireRole(...adminRoles), async (_req, res): Promise<void> => {
  const [
    registrations,
    completedDiagnostics,
    paidParticipants,
    activeTalent,
    openCompanyRequirements,
    matchingRecords,
    shortlistPipeline,
    placements,
  ] = await Promise.all([
    db.select({ value: count(usersTable.id) }).from(usersTable).where(eq(usersTable.role, "member")),
    db.select({ value: count(readinessDiagnosticsTable.id) }).from(readinessDiagnosticsTable),
    db
      .select({ value: countDistinct(enrollmentsTable.memberUserId) })
      .from(transactionsTable)
      .innerJoin(enrollmentsTable, eq(transactionsTable.referenceId, enrollmentsTable.id))
      .where(and(eq(transactionsTable.kind, "program"), eq(transactionsTable.status, "paid"))),
    db
      .select({ value: count(professionalPassportsTable.id) })
      .from(professionalPassportsTable)
      .innerJoin(memberProfilesTable, eq(memberProfilesTable.userId, professionalPassportsTable.memberUserId))
      .where(and(eq(memberProfilesTable.dataConsent, true), inArray(professionalPassportsTable.availabilityStatus, ["available", "open_to_offer"]))),
    db.select({ value: count(companyRequirementsTable.id) }).from(companyRequirementsTable).where(eq(companyRequirementsTable.status, "open")),
    db.select({ value: count(matchingsTable.id) }).from(matchingsTable),
    db.select({ value: count(matchingsTable.id) }).from(matchingsTable).where(inArray(matchingsTable.status, ["shortlisted", "interview"])),
    db.select({ value: count(matchingsTable.id) }).from(matchingsTable).where(eq(matchingsTable.status, "placed")),
  ]);

  res.json(GetAdminFunnelResponse.parse({
    metrics: [
      { key: "registrations", label: "Registrasi anggota", value: registrations[0]?.value ?? 0, definition: "Jumlah seluruh akun dengan peran member yang terdaftar, tanpa mensyaratkan onboarding atau aktivitas lain." },
      { key: "completedDiagnostics", label: "Diagnostik selesai", value: completedDiagnostics[0]?.value ?? 0, definition: "Jumlah record readiness diagnostic; satu member hanya dapat memiliki satu record dan record dibuat saat diagnostik disimpan selesai." },
      { key: "paidParticipants", label: "Peserta berbayar", value: paidParticipants[0]?.value ?? 0, definition: "Jumlah anggota unik pada enrollment yang memiliki transaksi program berstatus paid; transaksi tanpa relasi enrollment tidak dihitung." },
      { key: "activeTalent", label: "Talenta aktif", value: activeTalent[0]?.value ?? 0, definition: "Jumlah passport profesional milik member dengan dataConsent aktif dan availabilityStatus available atau open_to_offer; tidak menyiratkan consent kepada perusahaan tertentu." },
      { key: "openCompanyRequirements", label: "Kebutuhan perusahaan terbuka", value: openCompanyRequirements[0]?.value ?? 0, definition: "Jumlah company requirement dengan status open, untuk semua jenis kebutuhan yang tercatat pada skema." },
      { key: "matchingRecords", label: "Record matching", value: matchingRecords[0]?.value ?? 0, definition: "Jumlah seluruh record matching yang tersimpan, termasuk status baru, ditinjau, shortlist, interview, placed, dan declined." },
      { key: "shortlistPipeline", label: "Pipeline shortlist", value: shortlistPipeline[0]?.value ?? 0, definition: "Jumlah record matching berstatus shortlisted atau interview; placed dihitung terpisah sebagai placement dan declined tidak termasuk." },
      { key: "placements", label: "Placement", value: placements[0]?.value ?? 0, definition: "Jumlah record matching dengan status placed." },
    ],
  }));
});

router.get("/admin/operations", requireUser, requireRole(...adminRoles), async (req, res): Promise<void> => {
  const user = getAuthenticatedUser(req);
  await syncVerificationSlaReminders();
  await expireCompanyTalentConsents();
  const [verifications, programs, enrollments, matchings, transactions, auditLogs] = await Promise.all([
    db.select().from(verificationsTable).orderBy(desc(verificationsTable.submittedAt)).limit(100),
    db.select().from(programsTable).orderBy(desc(programsTable.updatedAt)).limit(100),
    db.select().from(enrollmentsTable).orderBy(desc(enrollmentsTable.createdAt)).limit(100),
    db
      .select({ matching: matchingsTable })
      .from(matchingsTable)
      .innerJoin(
        companyTalentConsentsTable,
        and(
          eq(companyTalentConsentsTable.memberUserId, matchingsTable.candidateUserId),
          eq(companyTalentConsentsTable.companyUserId, matchingsTable.companyUserId),
          eq(companyTalentConsentsTable.status, "active"),
          gt(companyTalentConsentsTable.expiresAt, new Date()),
        ),
      )
      .innerJoin(
        memberProfilesTable,
        and(
          eq(memberProfilesTable.userId, matchingsTable.candidateUserId),
          eq(memberProfilesTable.dataConsent, true),
        ),
      )
      .orderBy(desc(matchingsTable.updatedAt))
      .limit(100)
      .then((rows) => rows.map(({ matching }) => matching)),
    db.select().from(transactionsTable).orderBy(desc(transactionsTable.occurredAt)).limit(100),
    getAuditLogs(user.role === "super_admin"),
  ]);

  const programNames = new Map(programs.map((program) => [program.id, program.name]));
  const enrollmentCounts = new Map<string, number>();
  const completionCounts = new Map<string, number>();
  for (const enrollment of enrollments) {
    if (enrollment.status !== "cancelled") {
      enrollmentCounts.set(enrollment.programId, (enrollmentCounts.get(enrollment.programId) ?? 0) + 1);
    }
    if (enrollment.status === "completed") {
      completionCounts.set(enrollment.programId, (completionCounts.get(enrollment.programId) ?? 0) + 1);
    }
  }

  const now = new Date();
  const verificationResponses = verifications.map((verification) => verificationResponse(verification, now));
  const pendingVerificationRows = verificationResponses.filter(
    (verification) => verification.slaStatus !== "resolved",
  );
  const pendingVerifications = pendingVerificationRows.length;
  const approachingVerifications = pendingVerificationRows.filter((verification) => verification.slaStatus === "approaching").length;
  const overdueVerifications = pendingVerificationRows.filter((verification) => verification.slaStatus === "overdue").length;
  const activeEnrollments = enrollments.filter(
    (enrollment) => enrollment.status === "pending" || enrollment.status === "enrolled",
  ).length;
  const revenue = transactions
    .filter((transaction) => transaction.status === "paid")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const pendingRevenue = transactions
    .filter((transaction) => transaction.status === "pending")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const transactionResponses = transactions.map((transaction) => transactionResponse(transaction));
  const reconciliationIssues = transactionResponses.filter(
    (transaction) => transaction.reconciliationStatus === "mismatch" || transaction.reconciliationStatus === "overdue",
  ).length;
  const overdueSettlements = transactionResponses.filter((transaction) =>
    transaction.reconciliationFlags.includes("settlement_sla_breached"),
  ).length;

  res.json(
    GetAdminOperationsResponse.parse({
      permissions: {
        canReviewVerifications: true,
        canManagePrograms: true,
        canManageEnrollments: true,
        canManagePlacements: true,
        canManageTransactions: user.role === "super_admin",
        canViewAudit: user.role === "super_admin",
      },
      summary: {
        pendingVerifications,
        approachingVerifications,
        overdueVerifications,
        activePrograms: programs.filter((program) => program.status === "published").length,
        activeEnrollments,
        completions: enrollments.filter((enrollment) => enrollment.status === "completed").length,
        placements: matchings.filter((matching) => matching.status === "placed").length,
        revenue,
        pendingRevenue,
        reconciliationIssues,
        overdueSettlements,
      },
      verifications: verificationResponses,
      programs: programs.map((program) =>
        programResponse(program, enrollmentCounts.get(program.id) ?? 0, completionCounts.get(program.id) ?? 0),
      ),
      enrollments: enrollments.map((enrollment) => ({
        ...enrollment,
        programName: programNames.get(enrollment.programId) ?? "Program tidak ditemukan",
        enrolledAt: iso(enrollment.enrolledAt),
        completedAt: iso(enrollment.completedAt),
        createdAt: enrollment.createdAt,
      })),
      matchings,
      transactions: transactionResponses,
      auditLogs,
    }),
  );
});

router.get("/admin/audit-logs", ...superAdminOnly, async (_req, res): Promise<void> => {
  res.json(ListAdminAuditLogsResponse.parse(await getAuditLogs(true)));
});

router.post(
  "/admin/transactions/settlement",
  requireUser,
  requireRole(...adminRoles),
  async (req, res): Promise<void> => {
    const rawSettledAt =
      typeof req.body === "object" && req.body !== null
        ? (req.body as Record<string, unknown>).settledAt
        : undefined;
    if (!isValidIsoDateTime(rawSettledAt)) {
      res.status(400).json({ error: "settledAt wajib berupa ISO date-time yang valid." });
      return;
    }

    const body = IngestAdminTransactionSettlementBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        error: "Settlement wajib memiliki referenceId atau invoiceNumber, nominal, dan waktu settlement yang valid.",
      });
      return;
    }

    const referenceId = body.data.referenceId?.trim();
    const invoiceNumber = body.data.invoiceNumber?.trim();
    if (!referenceId && !invoiceNumber) {
      res.status(400).json({ error: "referenceId atau invoiceNumber wajib diisi." });
      return;
    }

    const actor = getAuthenticatedUser(req);
    const settledAt = body.data.settledAt;
    const normalizedSettlementAmount = Number(body.data.settlementAmount.toFixed(2));
    const settlementAmount = normalizedSettlementAmount.toFixed(2);
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const invoiceCondition = invoiceNumber
        ? or(
            eq(transactionsTable.invoiceNumber, invoiceNumber),
            invoiceNumber.startsWith("INV-")
              ? and(
                  isNull(transactionsTable.invoiceNumber),
                  eq(transactionsTable.referenceId, invoiceNumber.slice(4)),
                )
              : undefined,
          )
        : undefined;
      const matches = await tx
        .select()
        .from(transactionsTable)
        .where(
          or(
            referenceId ? eq(transactionsTable.referenceId, referenceId) : undefined,
            invoiceCondition,
          ),
        )
        .orderBy(transactionsTable.id)
        .for("update");

      if (matches.length === 0) return { kind: "not_found" as const };
      if (matches.length > 1) return { kind: "ambiguous" as const };

      const existing = matches[0]!;
      const effectiveInvoiceNumber = existing.invoiceNumber ?? `INV-${existing.referenceId}`;
      if (
        (referenceId && existing.referenceId !== referenceId) ||
        (invoiceNumber && effectiveInvoiceNumber !== invoiceNumber)
      ) {
        return { kind: "conflicting_identifiers" as const };
      }

      const isIdempotentReplay =
        existing.settlementAmount !== null &&
        Number(existing.settlementAmount) === normalizedSettlementAmount &&
        existing.settledAt?.getTime() === settledAt.getTime();

      if (isIdempotentReplay) {
        return { kind: "ok" as const, transaction: existing };
      }

      const current = transactionResponse(existing, now);
      const [transaction] = await tx
        .update(transactionsTable)
        .set({
          settlementAmount,
          settledAt,
          reconciliationStatus: "pending",
          reconciliationResolvedAt: null,
          reconciliationResolvedByUserId: null,
          updatedAt: now,
        })
        .where(eq(transactionsTable.id, existing.id))
        .returning();
      const next = transactionResponse(transaction, now);

      await recordAudit(tx, actor, {
        action: "transaction.settlement_ingested",
        entityType: "transaction",
        entityId: existing.id,
        fromStatus: current.reconciliationStatus,
        toStatus: next.reconciliationStatus,
        note: `Settlement bank diterima melalui ${referenceId ? "referenceId" : "invoiceNumber"}.`,
      });
      return { kind: "ok" as const, transaction };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Transaksi dengan reference atau invoice tersebut tidak ditemukan." });
      return;
    }
    if (result.kind === "ambiguous") {
      res.status(409).json({ error: "Reference atau invoice tidak mengidentifikasi satu transaksi secara unik." });
      return;
    }
    if (result.kind === "conflicting_identifiers") {
      res.status(409).json({ error: "referenceId dan invoiceNumber tidak menunjuk ke transaksi yang sama." });
      return;
    }
    res.json(IngestAdminTransactionSettlementResponse.parse(transactionResponse(result.transaction, now)));
  },
);

router.post(
  "/admin/verifications/:id/decision",
  requireUser,
  requireRole(...adminRoles),
  async (req, res): Promise<void> => {
    const params = DecideVerificationParams.safeParse(req.params);
    const body = DecideVerificationBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Keputusan verifikasi atau catatan tidak valid." });
      return;
    }
    const actor = getAuthenticatedUser(req);
    const [existing] = await db
      .select()
      .from(verificationsTable)
      .where(eq(verificationsTable.id, params.data.id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Item verifikasi tidak ditemukan." });
      return;
    }
    if (existing.status !== "pending") {
      res.status(409).json({ error: "Item verifikasi ini tidak sedang menunggu keputusan Admin." });
      return;
    }
    if (existing.subjectType === "competency") {
      const [evidence] = await db
        .select()
        .from(memberEvidenceTable)
        .where(and(eq(memberEvidenceTable.id, existing.subjectId), eq(memberEvidenceTable.memberUserId, existing.submittedByUserId)))
        .limit(1);
      if (!evidence) {
        res.status(404).json({ error: "Bukti kompetensi terkait tidak ditemukan." });
        return;
      }
    }
    const updated = await db.transaction(async (tx) => {
      const now = new Date();
      const [next] = await tx
        .update(verificationsTable)
        .set({
          status: body.data.status,
          reviewedByUserId: actor.id,
           reviewedAt: now,
          reviewNote: body.data.note,
        })
        .where(and(eq(verificationsTable.id, existing.id), eq(verificationsTable.status, existing.status)))
        .returning();
      if (!next) return null;
      if (next.subjectType === "competency") {
        await tx
          .update(memberEvidenceTable)
          .set({
            status: body.data.status === "approved"
              ? "verified"
              : body.data.status,
            verifiedAt: body.data.status === "approved" ? now : null,
            updatedAt: now,
          })
          .where(and(
            eq(memberEvidenceTable.id, next.subjectId),
            eq(memberEvidenceTable.memberUserId, next.submittedByUserId),
          ));
      }
      await recordAudit(tx, actor, {
        action: "verification.decision",
        entityType: existing.subjectType,
        entityId: existing.subjectId,
        fromStatus: existing.status,
        toStatus: body.data.status,
        note: body.data.note,
      });
      return next;
    });
    if (!updated) {
      res.status(409).json({ error: "Item verifikasi ini tidak sedang menunggu keputusan Admin." });
      return;
    }
    res.json(DecideVerificationResponse.parse(verificationResponse(updated)));
  },
);

router.post(
  "/admin/programs",
  requireUser,
  requireRole(...adminRoles),
  async (req, res): Promise<void> => {
    const parsed = CreateAdminProgramBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Data program belum lengkap atau tidak valid." });
      return;
    }
    const actor = getAuthenticatedUser(req);
    const [created] = await db.transaction(async (tx) => {
      const [program] = await tx
        .insert(programsTable)
        .values({ id: `program-${randomUUID()}`, ...parsed.data, price: String(parsed.data.price) })
        .returning();
      await recordAudit(tx, actor, {
        action: "program.created",
        entityType: "program",
        entityId: program.id,
        toStatus: program.status,
      });
      return [program];
    });
    res.status(201).json(CreateAdminProgramResponse.parse(programResponse(created)));
  },
);

router.patch(
  "/admin/programs/:id",
  requireUser,
  requireRole(...adminRoles),
  async (req, res): Promise<void> => {
    const params = UpdateAdminProgramParams.safeParse(req.params);
    const body = UpdateAdminProgramBody.safeParse(req.body);
    if (!params.success || !body.success || Object.keys(body.data).length === 0) {
      res.status(400).json({ error: "Perubahan program tidak valid." });
      return;
    }
    const actor = getAuthenticatedUser(req);
    const [existing] = await db.select().from(programsTable).where(eq(programsTable.id, params.data.id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Program tidak ditemukan." });
      return;
    }
    const [updated] = await db.transaction(async (tx) => {
      const [program] = await tx
        .update(programsTable)
        .set({
          ...body.data,
          ...(body.data.price === undefined ? {} : { price: String(body.data.price) }),
          updatedAt: new Date(),
        } as any)
        .where(eq(programsTable.id, existing.id))
        .returning();
      await recordAudit(tx, actor, {
        action: "program.updated",
        entityType: "program",
        entityId: existing.id,
        fromStatus: existing.status,
        toStatus: program.status,
        note: "Detail program atau publikasi diperbarui.",
      });
      return [program];
    });
    res.json(UpdateAdminProgramResponse.parse(programResponse(updated)));
  },
);

router.patch(
  "/admin/enrollments/:id",
  requireUser,
  requireRole(...adminRoles),
  async (req, res): Promise<void> => {
    const params = UpdateAdminEnrollmentParams.safeParse(req.params);
    const body = UpdateAdminEnrollmentBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Status enrollment tidak valid." });
      return;
    }
    const actor = getAuthenticatedUser(req);
    const [existing] = await db.select().from(enrollmentsTable).where(eq(enrollmentsTable.id, params.data.id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Enrollment tidak ditemukan." });
      return;
    }
    const now = new Date();
    const [updated] = await db.transaction(async (tx) => {
      const [enrollment] = await tx
        .update(enrollmentsTable)
        .set({
          status: body.data.status,
          enrolledAt: body.data.status === "enrolled" ? existing.enrolledAt ?? now : existing.enrolledAt,
          completedAt: body.data.status === "completed" ? now : null,
          updatedAt: now,
        })
        .where(eq(enrollmentsTable.id, existing.id))
        .returning();
      await recordAudit(tx, actor, {
        action: "enrollment.status_changed",
        entityType: "enrollment",
        entityId: existing.id,
        fromStatus: existing.status,
        toStatus: body.data.status,
        note: body.data.note,
      });
      return [enrollment];
    });
    const [program] = await db.select().from(programsTable).where(eq(programsTable.id, updated.programId)).limit(1);
    res.json(
      UpdateAdminEnrollmentResponse.parse({
        ...updated,
        programName: program?.name ?? "Program tidak ditemukan",
        enrolledAt: iso(updated.enrolledAt),
        completedAt: iso(updated.completedAt),
        createdAt: updated.createdAt,
      }),
    );
  },
);

router.patch(
  "/admin/matchings/:id",
  requireUser,
  requireRole(...adminRoles),
  async (req, res): Promise<void> => {
    const params = UpdateAdminMatchingParams.safeParse(req.params);
    const body = UpdateAdminMatchingBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Status matching tidak valid." });
      return;
    }
    const actor = getAuthenticatedUser(req);
    await expireCompanyTalentConsents();
    const [row] = await db
      .select({ matching: matchingsTable })
      .from(matchingsTable)
      .innerJoin(
        companyTalentConsentsTable,
        and(
          eq(companyTalentConsentsTable.memberUserId, matchingsTable.candidateUserId),
          eq(companyTalentConsentsTable.companyUserId, matchingsTable.companyUserId),
          eq(companyTalentConsentsTable.status, "active"),
          gt(companyTalentConsentsTable.expiresAt, new Date()),
        ),
      )
      .innerJoin(
        memberProfilesTable,
        and(
          eq(memberProfilesTable.userId, matchingsTable.candidateUserId),
          eq(memberProfilesTable.dataConsent, true),
        ),
      )
      .where(eq(matchingsTable.id, params.data.id))
      .limit(1);
    const existing = row?.matching;
    if (!existing) {
      res.status(404).json({ error: "Matching tidak ditemukan." });
      return;
    }
    const [updated] = await db.transaction(async (tx) => {
      const [matching] = await tx
        .update(matchingsTable)
        .set({ status: body.data.status, updatedAt: new Date() })
        .where(eq(matchingsTable.id, existing.id))
        .returning();
      await recordAudit(tx, actor, {
        action: "matching.pipeline_changed",
        entityType: "matching",
        entityId: existing.id,
        fromStatus: existing.status,
        toStatus: body.data.status,
        note: body.data.note,
      });
      return [matching];
    });
    res.json(UpdateAdminMatchingResponse.parse(updated));
  },
);

router.patch(
  "/admin/transactions/:id",
  ...superAdminOnly,
  async (req, res): Promise<void> => {
    const params = UpdateAdminTransactionParams.safeParse(req.params);
    const body = UpdateAdminTransactionBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Status transaksi dan catatan wajib diisi." });
      return;
    }
    const actor = getAuthenticatedUser(req);
    const [existing] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, params.data.id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Transaksi tidak ditemukan." });
      return;
    }
    const [updated] = await db.transaction(async (tx) => {
      const [transaction] = await tx
        .update(transactionsTable)
        .set({ status: body.data.status, updatedAt: new Date() })
        .where(eq(transactionsTable.id, existing.id))
        .returning();
      await recordAudit(tx, actor, {
        action: "transaction.status_changed",
        entityType: "transaction",
        entityId: existing.id,
        fromStatus: existing.status,
        toStatus: body.data.status,
        note: body.data.note,
      });
      return [transaction];
    });
    res.json(
      UpdateAdminTransactionResponse.parse(transactionResponse(updated)),
    );
  },
);

router.patch(
  "/admin/transactions/:id/reconciliation",
  ...superAdminOnly,
  async (req, res): Promise<void> => {
    const params = ResolveAdminTransactionReconciliationParams.safeParse(req.params);
    const body = ResolveAdminTransactionReconciliationBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Catatan penyelesaian wajib diisi minimal 3 karakter." });
      return;
    }
    const actor = getAuthenticatedUser(req);
    const [existing] = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, params.data.id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Transaksi tidak ditemukan." });
      return;
    }
    const current = transactionResponse(existing);
    if (current.reconciliationStatus === "resolved") {
      res.status(400).json({ error: "Rekonsiliasi transaksi ini sudah diselesaikan." });
      return;
    }
    const now = new Date();
    const [updated] = await db.transaction(async (tx) => {
      const [transaction] = await tx
        .update(transactionsTable)
        .set({
          reconciliationStatus: "resolved",
          reconciliationResolvedAt: now,
          reconciliationResolvedByUserId: actor.id,
          updatedAt: now,
        })
        .where(eq(transactionsTable.id, existing.id))
        .returning();
      await recordAudit(tx, actor, {
        action: "transaction.reconciliation_resolved",
        entityType: "transaction_reconciliation",
        entityId: existing.id,
        fromStatus: current.reconciliationStatus,
        toStatus: "resolved",
        note: body.data.note,
      });
      return [transaction];
    });
    res.json(ResolveAdminTransactionReconciliationResponse.parse(transactionResponse(updated, now)));
  },
);

export default router;