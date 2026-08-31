import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  GetAdminOperationsResponse,
  IngestAdminTransactionSettlementResponse,
  ResolveAdminTransactionReconciliationResponse,
} from "@workspace/api-zod";
import {
  auditLogsTable,
  db,
  transactionsTable,
  usersTable,
  type User,
} from "@workspace/db";
import type { AuthenticatedRequest } from "../src/lib/auth";
import adminRouter from "../src/routes/admin";

const suffix = randomUUID();
const adminId = `settlement-admin-${suffix}`;
const superAdminId = `settlement-super-admin-${suffix}`;
const memberId = `settlement-member-${suffix}`;
const transactionIds = {
  matched: `settlement-matched-${suffix}`,
  withinTolerance: `settlement-within-tolerance-${suffix}`,
  mismatch: `settlement-mismatch-${suffix}`,
  missing: `settlement-missing-${suffix}`,
  overdue: `settlement-overdue-${suffix}`,
  resolved: `settlement-resolved-${suffix}`,
};

let actor: User;

const app = express();
app.use(express.json());
app.use(async (req: Request, _res: Response, next: NextFunction) => {
  const requestedActorId = req.header("x-test-user");
  const userId = requestedActorId ?? actor.id;
  const [requestActor] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  assert.ok(requestActor);
  const authenticated = req as AuthenticatedRequest;
  authenticated.userId = requestActor.id;
  authenticated.currentUser = requestActor;
  next();
});
app.use("/api", adminRouter);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const port = (server.address() as AddressInfo).port;
const baseUrl = `http://127.0.0.1:${port}/api`;

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await response.json();
  return { response, body };
}

async function requestAs(userId: string, path: string, init?: RequestInit) {
  return request(path, {
    ...init,
    headers: { ...init?.headers, "x-test-user": userId },
  });
}

function transaction(
  id: string,
  overrides: Partial<typeof transactionsTable.$inferInsert> = {},
) {
  return {
    id,
    kind: "program",
    referenceId: `reference-${id}`,
    customerName: "Pelanggan Settlement",
    amount: "1000.00",
    invoiceNumber: null,
    invoiceAmount: "1000.00",
    feeAmount: "50.00",
    commission: "50.00",
    refundAmount: "0.00",
    settlementAmount: "900.00",
    settlementDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    settledAt: new Date(),
    reconciliationStatus: "pending",
    status: "paid",
    ...overrides,
  };
}

const responseTransactionFields = [
  "id",
  "kind",
  "referenceId",
  "customerName",
  "amount",
  "invoiceNumber",
  "invoiceAmount",
  "feeAmount",
  "commission",
  "refundAmount",
  "expectedSettlement",
  "settlementAmount",
  "netSettlement",
  "settlementDifference",
  "settlementDueAt",
  "settledAt",
  "reconciliationStatus",
  "reconciliationFlags",
  "reconciliationResolvedAt",
  "status",
  "occurredAt",
  "updatedAt",
];

try {
  await db.insert(usersTable).values([
    {
      id: adminId,
      clerkUserId: adminId,
      name: "Admin Settlement",
      email: `${adminId}@example.test`,
      role: "admin",
      onboardingComplete: true,
    },
    {
      id: superAdminId,
      clerkUserId: superAdminId,
      name: "Super Admin Settlement",
      email: `${superAdminId}@example.test`,
      role: "super_admin",
      onboardingComplete: true,
    },
    {
      id: memberId,
      clerkUserId: memberId,
      name: "Member Settlement",
      email: `${memberId}@example.test`,
      role: "member",
      onboardingComplete: true,
    },
  ]);

  const now = Date.now();
  await db.insert(transactionsTable).values([
    transaction(transactionIds.matched),
    transaction(transactionIds.withinTolerance, {
      settlementAmount: "900.01",
    }),
    transaction(transactionIds.mismatch, {
      settlementAmount: "899.98",
    }),
    transaction(transactionIds.missing, {
      invoiceNumber: `INV-MISSING-${suffix}`,
      settlementAmount: null,
      settledAt: null,
    }),
    transaction(transactionIds.overdue, {
      invoiceNumber: `INV-OVERDUE-${suffix}`,
      settlementAmount: null,
      settledAt: null,
      settlementDueAt: new Date(now - 60 * 60 * 1000),
    }),
    transaction(transactionIds.resolved, {
      settlementAmount: "850.00",
      settledAt: new Date(now - 6 * 24 * 60 * 60 * 1000),
      settlementDueAt: new Date(now - 7 * 24 * 60 * 60 * 1000),
      reconciliationStatus: "resolved",
      reconciliationResolvedAt: new Date(now - 60 * 60 * 1000),
      reconciliationResolvedByUserId: superAdminId,
    }),
  ]);

  actor = await loadUser(adminId);
  let result = await request("/admin/operations");
  assert.equal(result.response.status, 200);
  GetAdminOperationsResponse.parse(result.body);
  assert.deepEqual(Object.keys(result.body).sort(), [
    "auditLogs",
    "enrollments",
    "matchings",
    "permissions",
    "programs",
    "summary",
    "transactions",
    "verificationSlaWorker",
    "verifications",
  ]);
  assert.deepEqual(Object.keys(result.body.permissions).sort(), [
    "canManageEnrollments",
    "canManagePlacements",
    "canManagePrograms",
    "canManageTransactions",
    "canReviewVerifications",
    "canViewAudit",
  ]);
  assert.equal(result.body.permissions.canManageTransactions, false);
  assert.equal(result.body.permissions.canViewAudit, false);
  assert.deepEqual(result.body.auditLogs, []);

  const responseById = new Map(
    result.body.transactions
      .filter((item: { id: string }) =>
        Object.values(transactionIds).includes(item.id),
      )
      .map((item: { id: string }) => [item.id, item]),
  );
  assert.equal(responseById.size, Object.keys(transactionIds).length);
  for (const item of responseById.values()) {
    assert.deepEqual(
      Object.keys(item).sort(),
      [...responseTransactionFields].sort(),
    );
  }

  const matched = responseById.get(transactionIds.matched);
  assert.equal(matched.expectedSettlement, 900);
  assert.equal(matched.settlementAmount, 900);
  assert.equal(matched.netSettlement, 900);
  assert.equal(matched.settlementDifference, 0);
  assert.equal(matched.reconciliationStatus, "matched");
  assert.deepEqual(matched.reconciliationFlags, []);

  const withinTolerance = responseById.get(transactionIds.withinTolerance);
  assert.equal(withinTolerance.expectedSettlement, 900);
  assert.equal(withinTolerance.settlementDifference, 0.01);
  assert.equal(withinTolerance.reconciliationStatus, "matched");
  assert.deepEqual(withinTolerance.reconciliationFlags, []);

  const mismatch = responseById.get(transactionIds.mismatch);
  assert.equal(mismatch.expectedSettlement, 900);
  assert.equal(mismatch.settlementDifference, -0.02);
  assert.equal(mismatch.reconciliationStatus, "mismatch");
  assert.deepEqual(mismatch.reconciliationFlags, ["amount_mismatch"]);

  const missing = responseById.get(transactionIds.missing);
  assert.equal(missing.settlementAmount, null);
  assert.equal(missing.settlementDifference, null);
  assert.equal(missing.reconciliationStatus, "pending");
  assert.deepEqual(missing.reconciliationFlags, ["settlement_missing"]);

  const overdue = responseById.get(transactionIds.overdue);
  assert.equal(overdue.reconciliationStatus, "overdue");
  assert.deepEqual(overdue.reconciliationFlags, [
    "settlement_missing",
    "settlement_sla_breached",
  ]);

  const resolved = responseById.get(transactionIds.resolved);
  assert.equal(resolved.reconciliationStatus, "resolved");
  assert.ok(resolved.reconciliationFlags.includes("amount_mismatch"));
  assert.ok(resolved.reconciliationFlags.includes("settlement_sla_breached"));
  assert.ok(resolved.reconciliationResolvedAt);
  assert.equal(result.body.summary.reconciliationIssues >= 2, true);
  assert.equal(result.body.summary.overdueSettlements >= 2, true);

  const missingSettlementAt = new Date(now - 30 * 60 * 1000).toISOString();
  result = await requestAs(
    memberId,
    "/admin/transactions/settlement",
    {
      method: "POST",
      body: JSON.stringify({
        referenceId: `reference-${transactionIds.missing}`,
        settlementAmount: 900,
        settledAt: missingSettlementAt,
      }),
    },
  );
  assert.equal(result.response.status, 403);

  result = await request("/admin/transactions/settlement", {
    method: "POST",
    body: JSON.stringify({
      settlementAmount: 900,
      settledAt: missingSettlementAt,
    }),
  });
  assert.equal(result.response.status, 400);

  result = await request("/admin/transactions/settlement", {
    method: "POST",
    body: JSON.stringify({
      referenceId: "reference-tidak-ada",
      settlementAmount: 900,
      settledAt: missingSettlementAt,
    }),
  });
  assert.equal(result.response.status, 404);

  result = await request("/admin/transactions/settlement", {
    method: "POST",
    body: JSON.stringify({
      referenceId: `reference-${transactionIds.missing}`,
      settlementAmount: 900.004,
      settledAt: missingSettlementAt,
    }),
  });
  assert.equal(result.response.status, 400);

  for (const settledAt of [null, 0, "bukan-tanggal", "2026-02-30T12:00:00Z"]) {
    result = await request("/admin/transactions/settlement", {
      method: "POST",
      body: JSON.stringify({
        referenceId: `reference-${transactionIds.missing}`,
        settlementAmount: 900,
        settledAt,
      }),
    });
    assert.equal(result.response.status, 400);
  }

  const concurrentIngests = await Promise.all(
    Array.from({ length: 8 }, () =>
      request("/admin/transactions/settlement", {
        method: "POST",
        body: JSON.stringify({
          referenceId: `reference-${transactionIds.missing}`,
          settlementAmount: 900,
          settledAt: missingSettlementAt,
        }),
      }),
    ),
  );
  for (const ingest of concurrentIngests) {
    assert.equal(ingest.response.status, 200);
    IngestAdminTransactionSettlementResponse.parse(ingest.body);
    assert.equal(ingest.body.reconciliationStatus, "matched");
    assert.deepEqual(ingest.body.reconciliationFlags, []);
    assert.equal(ingest.body.settlementAmount, 900);
    assert.equal(ingest.body.settledAt, missingSettlementAt);
  }
  assert.equal(new Set(concurrentIngests.map((ingest) => ingest.body.updatedAt)).size, 1);
  assert.equal(
    (
      await db
        .select()
        .from(auditLogsTable)
        .where(
          and(
            eq(auditLogsTable.entityId, transactionIds.missing),
            eq(auditLogsTable.action, "transaction.settlement_ingested"),
          ),
        )
    ).length,
    1,
  );

  const fallbackInvoiceSettlementAt = new Date(now - 20 * 60 * 1000).toISOString();
  result = await request("/admin/transactions/settlement", {
    method: "POST",
    body: JSON.stringify({
      invoiceNumber: `INV-reference-${transactionIds.matched}`,
      settlementAmount: 900,
      settledAt: fallbackInvoiceSettlementAt,
    }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.id, transactionIds.matched);
  assert.equal(result.body.reconciliationStatus, "matched");

  const overdueSettlementAt = new Date(now).toISOString();
  result = await request("/admin/transactions/settlement", {
    method: "POST",
    body: JSON.stringify({
      invoiceNumber: `INV-OVERDUE-${suffix}`,
      settlementAmount: 900,
      settledAt: overdueSettlementAt,
    }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.reconciliationStatus, "overdue");
  assert.deepEqual(result.body.reconciliationFlags, ["settlement_sla_breached"]);

  result = await request("/admin/transactions/settlement", {
    method: "POST",
    body: JSON.stringify({
      referenceId: `reference-${transactionIds.missing}`,
      invoiceNumber: `INV-OVERDUE-${suffix}`,
      settlementAmount: 900,
      settledAt: overdueSettlementAt,
    }),
  });
  assert.equal(result.response.status, 409);

  result = await request("/admin/operations");
  assert.equal(result.response.status, 200);
  GetAdminOperationsResponse.parse(result.body);
  const refreshedMissing = result.body.transactions.find(
    (item: { id: string }) => item.id === transactionIds.missing,
  );
  const refreshedOverdue = result.body.transactions.find(
    (item: { id: string }) => item.id === transactionIds.overdue,
  );
  assert.equal(refreshedMissing.reconciliationStatus, "matched");
  assert.equal(refreshedOverdue.reconciliationStatus, "overdue");
  assert.deepEqual(refreshedOverdue.reconciliationFlags, ["settlement_sla_breached"]);

  result = await requestAs(
    memberId,
    `/admin/transactions/${transactionIds.mismatch}/reconciliation`,
    {
      method: "PATCH",
      body: JSON.stringify({ note: "Member tidak boleh resolve" }),
    },
  );
  assert.equal(result.response.status, 403);

  result = await requestAs(
    adminId,
    `/admin/transactions/${transactionIds.mismatch}/reconciliation`,
    {
      method: "PATCH",
      body: JSON.stringify({ note: "Admin tidak boleh resolve" }),
    },
  );
  assert.equal(result.response.status, 403);
  assert.equal(
    (
      await db
        .select()
        .from(auditLogsTable)
        .where(eq(auditLogsTable.entityId, transactionIds.mismatch))
    ).length,
    0,
  );

  result = await requestAs(
    superAdminId,
    `/admin/transactions/${transactionIds.mismatch}/reconciliation`,
    {
      method: "PATCH",
      body: JSON.stringify({ note: "Selisih diverifikasi dengan bukti bank" }),
    },
  );
  assert.equal(result.response.status, 200);
  ResolveAdminTransactionReconciliationResponse.parse(result.body);
  assert.equal(result.body.reconciliationStatus, "resolved");
  assert.equal(result.body.settlementDifference, -0.02);
  assert.deepEqual(result.body.reconciliationFlags, ["amount_mismatch"]);
  assert.ok(result.body.reconciliationResolvedAt);

  const resolutionAudits = await db
    .select()
    .from(auditLogsTable)
    .where(
      and(
        eq(auditLogsTable.entityId, transactionIds.mismatch),
        eq(auditLogsTable.action, "transaction.reconciliation_resolved"),
      ),
    );
  assert.equal(resolutionAudits.length, 1);
  assert.equal(resolutionAudits[0]!.actorUserId, superAdminId);
  assert.equal(resolutionAudits[0]!.actorRole, "super_admin");
  assert.equal(resolutionAudits[0]!.fromStatus, "mismatch");
  assert.equal(resolutionAudits[0]!.toStatus, "resolved");
  assert.equal(
    resolutionAudits[0]!.note,
    "Selisih diverifikasi dengan bukti bank",
  );

  result = await requestAs(
    superAdminId,
    `/admin/transactions/${transactionIds.mismatch}/reconciliation`,
    {
      method: "PATCH",
      body: JSON.stringify({ note: "Percobaan resolve ulang" }),
    },
  );
  assert.equal(result.response.status, 400);
  assert.equal(
    (
      await db
        .select()
        .from(auditLogsTable)
        .where(eq(auditLogsTable.entityId, transactionIds.mismatch))
    ).length,
    1,
  );

  result = await requestAs(superAdminId, "/admin/operations");
  assert.equal(result.response.status, 200);
  GetAdminOperationsResponse.parse(result.body);
  assert.equal(result.body.permissions.canManageTransactions, true);
  assert.equal(result.body.permissions.canViewAudit, true);
  const operationsAudit = result.body.auditLogs.find(
    (log: { entityId: string; action: string }) =>
      log.entityId === transactionIds.mismatch &&
      log.action === "transaction.reconciliation_resolved",
  );
  assert.ok(operationsAudit);
  assert.equal(operationsAudit.actorRole, "super_admin");
  assert.equal(operationsAudit.note, "Selisih diverifikasi dengan bukti bank");

  console.log("settlement reconciliation integration tests passed");
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.transaction(async (tx) => {
    await tx
      .delete(auditLogsTable)
      .where(inArray(auditLogsTable.entityId, Object.values(transactionIds)));
    await tx
      .delete(transactionsTable)
      .where(inArray(transactionsTable.id, Object.values(transactionIds)));
    await tx
      .delete(usersTable)
      .where(inArray(usersTable.id, [adminId, superAdminId, memberId]));
  });
}

async function loadUser(id: string) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  assert.ok(user);
  return user;
}
