import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express, { type NextFunction, type Request, type Response } from "express";
import { and, eq, inArray, like, or } from "drizzle-orm";
import {
  auditLogsTable,
  db,
  notificationsTable,
  usersTable,
  verificationsTable,
  type User,
} from "@workspace/db";
import type { AuthenticatedRequest } from "../src/lib/auth";
import {
  getVerificationSla,
  getVerificationSlaReminderWorkerStatus,
  orderVerificationSlaItems,
  runVerificationSlaReminderWorker,
  stopVerificationSlaReminderWorker,
  syncVerificationSlaReminders,
} from "../src/lib/verification-sla";
import notificationsRouter from "../src/routes/notifications";

const suffix = randomUUID();
const adminId = `sla-worker-admin-${suffix}`;
const memberId = `sla-worker-member-${suffix}`;
const approachingId = `sla-worker-approaching-${suffix}`;
const overdueId = `sla-worker-overdue-${suffix}`;
const onTrackId = `sla-worker-on-track-${suffix}`;
const parallelId = `sla-worker-parallel-${suffix}`;
const decisionRaceId = `sla-worker-decision-race-${suffix}`;
const verificationIds = [
  approachingId,
  overdueId,
  onTrackId,
  parallelId,
  decisionRaceId,
];
const now = new Date("2026-08-31T08:00:00.000Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);
const secondsAgo = (seconds: number) => new Date(now.getTime() - seconds * 1000);
let actor: User;

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  const authenticated = req as AuthenticatedRequest;
  authenticated.userId = actor.id;
  authenticated.currentUser = actor;
  next();
});
app.use("/api", notificationsRouter);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const port = (server.address() as AddressInfo).port;

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await response.json();
  return { response, body };
}

function verificationAtAge(ageSeconds: number): typeof verificationsTable.$inferSelect {
  return {
    id: `boundary-${ageSeconds}`,
    subjectType: "document",
    subjectId: `boundary-${ageSeconds}`,
    subjectName: "Dokumen batas SLA",
    evidenceType: "Dokumen",
    status: "pending",
    submittedByUserId: memberId,
    submittedAt: secondsAgo(ageSeconds),
    reviewedByUserId: null,
    reviewedAt: null,
    reviewNote: null,
  };
}

try {
  await db.transaction(async (tx) => {
    await tx.insert(usersTable).values([
      {
        id: adminId,
        clerkUserId: adminId,
        name: "Admin SLA Worker",
        email: `${adminId}@example.test`,
        role: "admin",
        onboardingComplete: true,
      },
      {
        id: memberId,
        clerkUserId: memberId,
        name: "Member SLA Worker",
        email: `${memberId}@example.test`,
        role: "member",
        onboardingComplete: true,
      },
    ]);
    await tx.insert(verificationsTable).values([
      {
        id: approachingId,
        subjectType: "document",
        subjectId: approachingId,
        subjectName: "Dokumen mendekati SLA",
        evidenceType: "Dokumen",
        submittedByUserId: memberId,
        submittedAt: hoursAgo(60),
      },
      {
        id: overdueId,
        subjectType: "document",
        subjectId: overdueId,
        subjectName: "Dokumen melewati SLA",
        evidenceType: "Dokumen",
        submittedByUserId: memberId,
        submittedAt: hoursAgo(80),
      },
      {
        id: onTrackId,
        subjectType: "document",
        subjectId: onTrackId,
        subjectName: "Dokumen sesuai SLA",
        evidenceType: "Dokumen",
        submittedByUserId: memberId,
        submittedAt: hoursAgo(12),
      },
    ]);
  });
  const second = 1;
  const warningSeconds = 54 * 60 * 60;
  const slaSeconds = 72 * 60 * 60;
  const beforeWarning = getVerificationSla(verificationAtAge(warningSeconds - second), now);
  const atWarning = getVerificationSla(verificationAtAge(warningSeconds), now);
  const afterWarning = getVerificationSla(verificationAtAge(warningSeconds + second), now);
  const beforeSla = getVerificationSla(verificationAtAge(slaSeconds - second), now);
  const atSla = getVerificationSla(verificationAtAge(slaSeconds), now);
  const afterSlaBoundary = getVerificationSla(verificationAtAge(slaSeconds + second), now);

  assert.deepEqual(
    [
      beforeWarning.slaStatus,
      atWarning.slaStatus,
      afterWarning.slaStatus,
      beforeSla.slaStatus,
      atSla.slaStatus,
      afterSlaBoundary.slaStatus,
    ],
    ["on_track", "approaching", "approaching", "approaching", "overdue", "overdue"],
  );
  assert.deepEqual(
    orderVerificationSlaItems([beforeWarning, atWarning, atSla]).map((item) => item.slaPriority),
    ["urgent", "high", "normal"],
  );

  actor = (
    await db.select().from(usersTable).where(eq(usersTable.id, adminId)).limit(1)
  )[0]!;

  let result = await runVerificationSlaReminderWorker(now);
  assert.ok(result);
  assert.equal(result.pendingVerifications >= 3, true);
  assert.equal(result.approachingReminders >= 1, true);
  assert.equal(result.overdueReminders >= 1, true);
  assert.equal(result.remindersCreated >= 2, true);

  let reminders = await db
    .select()
    .from(notificationsTable)
    .where(and(
      eq(notificationsTable.userId, adminId),
      inArray(notificationsTable.dedupeKey, [
        `verification-sla:${approachingId}:approaching:${adminId}`,
        `verification-sla:${overdueId}:overdue:${adminId}`,
      ]),
    ));
  assert.equal(reminders.length, 2);

  const reminderToComplete = reminders.find(
    (reminder) => reminder.dedupeKey === `verification-sla:${overdueId}:overdue:${adminId}`,
  );
  assert.ok(reminderToComplete);
  let completed = await request(`/notifications/${reminderToComplete.id}/read`, {
    method: "PATCH",
  });
  assert.equal(completed.response.status, 200);
  assert.equal(completed.body.read, true);
  completed = await request(`/notifications/${reminderToComplete.id}/read`, {
    method: "PATCH",
  });
  assert.equal(completed.response.status, 200);
  const completionAudits = await db
    .select()
    .from(auditLogsTable)
    .where(and(
      eq(auditLogsTable.action, "notification.read"),
      eq(auditLogsTable.entityId, reminderToComplete.id),
    ));
  assert.equal(completionAudits.length, 1);
  assert.equal(completionAudits[0]?.fromStatus, "unread");
  assert.equal(completionAudits[0]?.toStatus, "read");

  result = await runVerificationSlaReminderWorker(now);
  assert.ok(result);
  assert.equal(result.remindersCreated, 0);
  reminders = await db
    .select()
    .from(notificationsTable)
    .where(and(
      eq(notificationsTable.userId, adminId),
      inArray(notificationsTable.dedupeKey, [
        `verification-sla:${approachingId}:approaching:${adminId}`,
        `verification-sla:${overdueId}:overdue:${adminId}`,
      ]),
    ));
  assert.equal(reminders.length, 2);

  const afterSla = new Date(now.getTime() + 20 * 60 * 60 * 1000);
  result = await runVerificationSlaReminderWorker(afterSla);
  assert.ok(result);
  assert.equal(result.remindersCreated >= 1, true);
  const [overdueTransition] = await db
    .select()
    .from(notificationsTable)
    .where(eq(
      notificationsTable.dedupeKey,
      `verification-sla:${approachingId}:overdue:${adminId}`,
    ))
    .limit(1);
  assert.ok(overdueTransition);

  const status = getVerificationSlaReminderWorkerStatus();
  assert.equal(status.state, "succeeded");
  assert.equal(status.consecutiveFailures, 0);
  assert.equal(status.lastRun?.evaluatedAt, afterSla.toISOString());

  const [parallelVerification] = await db
    .insert(verificationsTable)
    .values({
      id: parallelId,
      subjectType: "document",
      subjectId: parallelId,
      subjectName: "Dokumen sinkronisasi paralel",
      evidenceType: "Dokumen",
      submittedByUserId: memberId,
      submittedAt: hoursAgo(80),
    })
    .returning();
  const parallelResults = await Promise.all([
    syncVerificationSlaReminders([parallelVerification], now),
    syncVerificationSlaReminders([parallelVerification], now),
  ]);
  assert.equal(
    parallelResults.reduce((total, current) => total + current.remindersCreated, 0) >= 1,
    true,
  );
  const parallelReminders = await db
    .select()
    .from(notificationsTable)
    .where(eq(
      notificationsTable.dedupeKey,
      `verification-sla:${parallelId}:overdue:${adminId}`,
    ));
  assert.equal(parallelReminders.length, 1);

  const [decisionRaceVerification] = await db
    .insert(verificationsTable)
    .values({
      id: decisionRaceId,
      subjectType: "document",
      subjectId: decisionRaceId,
      subjectName: "Dokumen selesai bersamaan",
      evidenceType: "Dokumen",
      submittedByUserId: memberId,
      submittedAt: hoursAgo(80),
    })
    .returning();
  let decisionRaceSync: Promise<Awaited<ReturnType<typeof syncVerificationSlaReminders>>> | null = null;
  await db.transaction(async (tx) => {
    await tx
      .update(verificationsTable)
      .set({ status: "approved", reviewedAt: now })
      .where(eq(verificationsTable.id, decisionRaceId));
    decisionRaceSync = syncVerificationSlaReminders([decisionRaceVerification], now);
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  assert.ok(decisionRaceSync);
  await decisionRaceSync;
  const [staleReminder] = await db
    .select()
    .from(notificationsTable)
    .where(eq(
      notificationsTable.dedupeKey,
      `verification-sla:${decisionRaceId}:overdue:${adminId}`,
    ))
    .limit(1);
  assert.equal(staleReminder, undefined);

  const failureResult = await runVerificationSlaReminderWorker(
    now,
    async () => {
      throw new Error("controlled reminder delivery failure");
    },
  );
  assert.equal(failureResult, null);
  const failedStatus = getVerificationSlaReminderWorkerStatus();
  assert.equal(failedStatus.state, "failed");
  assert.equal(failedStatus.consecutiveFailures, 1);
  assert.ok(failedStatus.lastFailureAt);
  assert.equal(failedStatus.lastError, "controlled reminder delivery failure");

  await runVerificationSlaReminderWorker(now);
  const recoveredStatus = getVerificationSlaReminderWorkerStatus();
  assert.equal(recoveredStatus.state, "succeeded");
  assert.equal(recoveredStatus.consecutiveFailures, 0);
  assert.equal(recoveredStatus.lastError, null);
  assert.equal(recoveredStatus.lastFailureAt, failedStatus.lastFailureAt);

  console.log("verification SLA reminder worker integration tests passed");
} finally {
  stopVerificationSlaReminderWorker();
  server.close();
  await db.transaction(async (tx) => {
    await tx.delete(auditLogsTable).where(eq(auditLogsTable.actorUserId, adminId));
    await tx
      .delete(notificationsTable)
      .where(or(
        eq(notificationsTable.userId, adminId),
        like(notificationsTable.dedupeKey, `verification-sla:${approachingId}:%`),
        like(notificationsTable.dedupeKey, `verification-sla:${overdueId}:%`),
        like(notificationsTable.dedupeKey, `verification-sla:${onTrackId}:%`),
        like(notificationsTable.dedupeKey, `verification-sla:${parallelId}:%`),
        like(notificationsTable.dedupeKey, `verification-sla:${decisionRaceId}:%`),
      ));
    await tx
      .delete(verificationsTable)
      .where(inArray(verificationsTable.id, verificationIds));
    await tx
      .delete(usersTable)
      .where(inArray(usersTable.id, [adminId, memberId]));
  });
}