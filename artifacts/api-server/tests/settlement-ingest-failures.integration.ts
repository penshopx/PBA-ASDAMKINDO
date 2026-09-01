import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  GetAdminOperationsResponse,
  ResolveAdminSettlementIngestFailureResponse,
} from "@workspace/api-zod";
import {
  auditLogsTable,
  db,
  notificationsTable,
  settlementIngestFailuresTable,
  usersTable,
  type User,
} from "@workspace/db";
import type { AuthenticatedRequest } from "../src/lib/auth";
import adminRouter from "../src/routes/admin";

const suffix = randomUUID();
const adminId = `ingest-failure-admin-${suffix}`;
const superAdminId = `ingest-failure-super-${suffix}`;
const secondSuperAdminId = `ingest-failure-super-2-${suffix}`;
const memberId = `ingest-failure-member-${suffix}`;
const testUserIds = [adminId, superAdminId, secondSuperAdminId, memberId];
const failureIds = new Set<string>();
let actor: User;

const app = express();
app.use(express.json());
app.use(async (req: Request, _res: Response, next: NextFunction) => {
  const userId = req.header("x-test-user") ?? actor.id;
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
  return { response, body: await response.json() as any };
}

async function requestAs(userId: string, path: string, init?: RequestInit) {
  return request(path, {
    ...init,
    headers: { ...init?.headers, "x-test-user": userId },
  });
}

try {
  await db.insert(usersTable).values([
    {
      id: adminId,
      clerkUserId: adminId,
      name: "Admin Ingest Failure",
      email: `${adminId}@example.test`,
      role: "admin",
      onboardingComplete: true,
    },
    {
      id: superAdminId,
      clerkUserId: superAdminId,
      name: "Super Admin Ingest Failure",
      email: `${superAdminId}@example.test`,
      role: "super_admin",
      onboardingComplete: true,
    },
    {
      id: secondSuperAdminId,
      clerkUserId: secondSuperAdminId,
      name: "Super Admin Ingest Failure 2",
      email: `${secondSuperAdminId}@example.test`,
      role: "super_admin",
      onboardingComplete: true,
    },
    {
      id: memberId,
      clerkUserId: memberId,
      name: "Member Ingest Failure",
      email: `${memberId}@example.test`,
      role: "member",
      onboardingComplete: true,
    },
  ]);
  actor = (await db.select().from(usersTable).where(eq(usersTable.id, adminId)).limit(1))[0]!;

  const settledAt = new Date().toISOString();
  const missingReference = `bank-reference-not-found-${suffix}`;
  const missingPayload = {
    referenceId: missingReference,
    settlementAmount: 125000,
    settledAt,
  };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await request("/admin/transactions/settlement", {
      method: "POST",
      body: JSON.stringify(missingPayload),
    });
    assert.equal(result.response.status, 404);
  }

  const [notFoundFailure] = await db
    .select()
    .from(settlementIngestFailuresTable)
    .where(eq(settlementIngestFailuresTable.failureCode, "transaction_not_found"))
    .orderBy(desc(settlementIngestFailuresTable.lastSeenAt));
  assert.ok(notFoundFailure);
  failureIds.add(notFoundFailure.id);
  assert.equal(notFoundFailure.attemptCount, 4);
  assert.equal(notFoundFailure.status, "open");
  assert.equal(notFoundFailure.identifierHint.includes(missingReference), false);

  const rejectedAudits = await db
    .select()
    .from(auditLogsTable)
    .where(
      and(
        eq(auditLogsTable.entityId, notFoundFailure.id),
        eq(auditLogsTable.action, "transaction.settlement_ingest_rejected"),
      ),
    );
  assert.equal(rejectedAudits.length, 1);
  assert.equal(JSON.stringify(rejectedAudits[0]!.metadata).includes(missingReference), false);

  const notFoundNotifications = await db
    .select()
    .from(notificationsTable)
    .where(
      and(
        inArray(notificationsTable.userId, testUserIds),
        eq(notificationsTable.title, "Settlement bank tidak menemukan transaksi"),
      ),
    );
  assert.deepEqual(
    notFoundNotifications.map((notification) => notification.userId).sort(),
    [secondSuperAdminId, superAdminId].sort(),
  );
  assert.ok(notFoundNotifications.every((notification) => notification.type === "system"));

  const invalidPayload = {
    referenceId: `invalid-amount-${suffix}`,
    settlementAmount: 125000.001,
    settledAt,
  };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await request("/admin/transactions/settlement", {
      method: "POST",
      body: JSON.stringify(invalidPayload),
    });
    assert.equal(result.response.status, 400);
  }
  const [invalidFailure] = await db
    .select()
    .from(settlementIngestFailuresTable)
    .where(eq(settlementIngestFailuresTable.failureCode, "invalid_payload"))
    .orderBy(desc(settlementIngestFailuresTable.lastSeenAt));
  assert.ok(invalidFailure);
  failureIds.add(invalidFailure.id);
  assert.equal(invalidFailure.attemptCount, 4);

  const repeatedNotifications = await db
    .select()
    .from(notificationsTable)
    .where(
      and(
        inArray(notificationsTable.userId, testUserIds),
        eq(notificationsTable.title, "Kegagalan ingest settlement berulang"),
      ),
    );
  assert.deepEqual(
    repeatedNotifications.map((notification) => notification.userId).sort(),
    [secondSuperAdminId, superAdminId].sort(),
  );

  let result = await requestAs(adminId, "/admin/operations");
  assert.equal(result.response.status, 200);
  GetAdminOperationsResponse.parse(result.body);
  assert.ok(
    result.body.settlementIngestFailures.some(
      (failure: { id: string }) => failure.id === notFoundFailure.id,
    ),
  );

  result = await requestAs(
    adminId,
    `/admin/settlement-ingest-failures/${notFoundFailure.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ note: "Admin biasa tidak boleh menyelesaikan" }),
    },
  );
  assert.equal(result.response.status, 403);

  result = await requestAs(
    memberId,
    `/admin/settlement-ingest-failures/${notFoundFailure.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ note: "Member tidak boleh menyelesaikan" }),
    },
  );
  assert.equal(result.response.status, 403);

  result = await requestAs(
    superAdminId,
    `/admin/settlement-ingest-failures/${notFoundFailure.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ note: "Sudah dicocokkan dengan laporan bank sumber" }),
    },
  );
  assert.equal(result.response.status, 200);
  ResolveAdminSettlementIngestFailureResponse.parse(result.body);
  assert.equal(result.body.status, "resolved");

  result = await requestAs(
    secondSuperAdminId,
    `/admin/settlement-ingest-failures/${notFoundFailure.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ note: "Percobaan penyelesaian ulang" }),
    },
  );
  assert.equal(result.response.status, 409);

  const resolutionAudits = await db
    .select()
    .from(auditLogsTable)
    .where(
      and(
        eq(auditLogsTable.entityId, notFoundFailure.id),
        eq(auditLogsTable.action, "transaction.settlement_ingest_failure_resolved"),
      ),
    );
  assert.equal(resolutionAudits.length, 1);
  assert.equal(resolutionAudits[0]!.actorUserId, superAdminId);

  result = await request("/admin/transactions/settlement", {
    method: "POST",
    body: JSON.stringify(missingPayload),
  });
  assert.equal(result.response.status, 404);
  const [reopenedFailure] = await db
    .select()
    .from(settlementIngestFailuresTable)
    .where(eq(settlementIngestFailuresTable.id, notFoundFailure.id));
  assert.equal(reopenedFailure.status, "open");
  assert.equal(reopenedFailure.attemptCount, 5);
  assert.equal(reopenedFailure.resolvedAt, null);
  assert.equal(reopenedFailure.resolvedByUserId, null);

  const notificationsAfterReopen = await db
    .select()
    .from(notificationsTable)
    .where(
      and(
        inArray(notificationsTable.userId, testUserIds),
        eq(notificationsTable.title, "Settlement bank tidak menemukan transaksi"),
      ),
    );
  assert.equal(notificationsAfterReopen.length, 2);

  console.log("settlement ingest failure integration tests passed");
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.transaction(async (tx) => {
    await tx.delete(notificationsTable).where(inArray(notificationsTable.userId, testUserIds));
    await tx.delete(auditLogsTable).where(inArray(auditLogsTable.actorUserId, testUserIds));
    if (failureIds.size > 0) {
      await tx
        .delete(settlementIngestFailuresTable)
        .where(inArray(settlementIngestFailuresTable.id, [...failureIds]));
    }
    await tx.delete(usersTable).where(inArray(usersTable.id, testUserIds));
  });
}