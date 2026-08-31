import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, like, or } from "drizzle-orm";
import {
  db,
  notificationsTable,
  usersTable,
  verificationsTable,
} from "@workspace/db";
import {
  getVerificationSlaReminderWorkerStatus,
  runVerificationSlaReminderWorker,
  stopVerificationSlaReminderWorker,
  syncVerificationSlaReminders,
} from "../src/lib/verification-sla";

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
  await db.transaction(async (tx) => {
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