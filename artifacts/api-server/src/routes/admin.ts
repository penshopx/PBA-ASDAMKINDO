import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateAdminProgramBody,
  CreateAdminProgramResponse,
  DecideVerificationBody,
  DecideVerificationParams,
  DecideVerificationResponse,
  GetAdminOperationsResponse,
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
  db,
  enrollmentsTable,
  matchingsTable,
  programsTable,
  transactionsTable,
  usersTable,
  verificationsTable,
} from "@workspace/db";
import { getAuthenticatedUser, requireRole, requireUser } from "../lib/auth";
import { getVerificationSla, syncVerificationSlaReminders } from "../lib/verification-sla";

const router: IRouter = Router();
const adminRoles = ["admin", "super_admin"] as const;
const superAdminOnly = [requireUser, requireRole("super_admin")];

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function programResponse(program: typeof programsTable.$inferSelect, enrollmentCount = 0, completionCount = 0) {
  return {
    ...program,
    price: Number(program.price),
    capacity: program.capacity,
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

router.get("/admin/operations", requireUser, requireRole(...adminRoles), async (req, res): Promise<void> => {
  const user = getAuthenticatedUser(req);
  await syncVerificationSlaReminders();
  const [verifications, programs, enrollments, matchings, transactions, auditLogs] = await Promise.all([
    db.select().from(verificationsTable).orderBy(desc(verificationsTable.submittedAt)).limit(100),
    db.select().from(programsTable).orderBy(desc(programsTable.updatedAt)).limit(100),
    db.select().from(enrollmentsTable).orderBy(desc(enrollmentsTable.createdAt)).limit(100),
    db.select().from(matchingsTable).orderBy(desc(matchingsTable.updatedAt)).limit(100),
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
    const [updated] = await db.transaction(async (tx) => {
      const [next] = await tx
        .update(verificationsTable)
        .set({
          status: body.data.status,
          reviewedByUserId: actor.id,
          reviewedAt: new Date(),
          reviewNote: body.data.note,
        })
        .where(eq(verificationsTable.id, existing.id))
        .returning();
      await recordAudit(tx, actor, {
        action: "verification.decision",
        entityType: existing.subjectType,
        entityId: existing.subjectId,
        fromStatus: existing.status,
        toStatus: body.data.status,
        note: body.data.note,
      });
      return [next];
    });
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
    const [existing] = await db.select().from(matchingsTable).where(eq(matchingsTable.id, params.data.id)).limit(1);
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