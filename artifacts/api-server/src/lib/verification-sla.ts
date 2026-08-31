import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import {
  db,
  notificationsTable,
  usersTable,
  verificationsTable,
} from "@workspace/db";
import { logger } from "./logger";

export const VERIFICATION_SLA_HOURS = 72;
export const VERIFICATION_SLA_WARNING_HOURS = VERIFICATION_SLA_HOURS * 0.75;
export const VERIFICATION_SLA_REMINDER_INTERVAL_MS = 15 * 60 * 1000;

export type VerificationSlaStatus = "on_track" | "approaching" | "overdue" | "resolved";
export type VerificationSlaPriority = "normal" | "high" | "urgent";
export type VerificationSlaReminderWorkerState = "idle" | "running" | "succeeded" | "failed";

export interface VerificationSlaReminderSyncResult {
  evaluatedAt: string;
  pendingVerifications: number;
  approachingReminders: number;
  overdueReminders: number;
  remindersCreated: number;
}

export interface VerificationSlaReminderWorkerStatus {
  state: VerificationSlaReminderWorkerState;
  intervalMs: number;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  skippedRuns: number;
  lastError: string | null;
  lastRun: VerificationSlaReminderSyncResult | null;
}

export function orderVerificationSlaItems<
  T extends Pick<ReturnType<typeof getVerificationSla>, "pendingAgeHours" | "slaPriority">,
>(items: T[]): T[] {
  const priorityRank: Record<VerificationSlaPriority, number> = {
    urgent: 0,
    high: 1,
    normal: 2,
  };
  return [...items].sort((a, b) => {
    const priorityDifference = priorityRank[a.slaPriority] - priorityRank[b.slaPriority];
    return priorityDifference || b.pendingAgeHours - a.pendingAgeHours;
  });
}

export function getVerificationSla(
  verification: typeof verificationsTable.$inferSelect,
  now = new Date(),
) {
  const isPending = verification.status === "pending";
  const slaDueAt = new Date(verification.submittedAt.getTime() + VERIFICATION_SLA_HOURS * 60 * 60 * 1000);
  const warningAt = new Date(
    verification.submittedAt.getTime() + VERIFICATION_SLA_WARNING_HOURS * 60 * 60 * 1000,
  );
  const pendingAgeHours = Math.max(
    0,
    Math.round(((now.getTime() - verification.submittedAt.getTime()) / (60 * 60 * 1000)) * 10) / 10,
  );
  const slaStatus: VerificationSlaStatus = !isPending
    ? "resolved"
    : now.getTime() >= slaDueAt.getTime()
      ? "overdue"
      : now.getTime() >= warningAt.getTime()
        ? "approaching"
        : "on_track";
  const slaPriority: VerificationSlaPriority =
    slaStatus === "overdue" ? "urgent" : slaStatus === "approaching" ? "high" : "normal";

  return { pendingAgeHours, slaDueAt, slaStatus, slaPriority };
}

export async function syncVerificationSlaReminders(
  verifications?: typeof verificationsTable.$inferSelect[],
  now = new Date(),
): Promise<VerificationSlaReminderSyncResult> {
  const admins = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(or(eq(usersTable.role, "admin"), eq(usersTable.role, "super_admin")));

  return db.transaction(async (tx) => {
    const verificationRows = verifications
      ? verifications.length === 0
        ? []
        : await tx
            .select()
            .from(verificationsTable)
            .where(and(
              inArray(verificationsTable.id, verifications.map((verification) => verification.id)),
              eq(verificationsTable.status, "pending"),
            ))
            .orderBy(asc(verificationsTable.id))
            .for("update")
      : await tx
          .select()
          .from(verificationsTable)
          .where(eq(verificationsTable.status, "pending"))
          .orderBy(asc(verificationsTable.id))
          .for("update");

    const reminders = verificationRows
      .map((verification) => ({ verification, sla: getVerificationSla(verification, now) }))
      .filter(({ sla }) => sla.slaStatus === "approaching" || sla.slaStatus === "overdue");
    const result = {
      evaluatedAt: now.toISOString(),
      pendingVerifications: verificationRows.length,
      approachingReminders: reminders.filter(
        ({ sla }) => sla.slaStatus === "approaching",
      ).length,
      overdueReminders: reminders.filter(({ sla }) => sla.slaStatus === "overdue").length,
      remindersCreated: 0,
    };
    if (admins.length === 0 || reminders.length === 0) return result;

    const candidates = reminders.flatMap(({ verification, sla }) =>
      admins.map((admin) => ({
        verification,
        sla,
        adminId: admin.id,
        dedupeKey: `verification-sla:${verification.id}:${sla.slaStatus}:${admin.id}`,
      })),
    );
    const existing = await tx
      .select({ dedupeKey: notificationsTable.dedupeKey })
      .from(notificationsTable)
      .where(inArray(notificationsTable.dedupeKey, candidates.map((candidate) => candidate.dedupeKey)));
    const existingKeys = new Set(existing.map((notification) => notification.dedupeKey));
    const values = candidates
      .filter((candidate) => !existingKeys.has(candidate.dedupeKey))
      .map(({ verification, sla, adminId, dedupeKey }) => {
        const title = sla.slaStatus === "overdue"
          ? "Verifikasi melewati SLA"
          : "Verifikasi segera mencapai SLA";
        const age = `${sla.pendingAgeHours} jam tertunda`;
        return {
          id: `notification-${randomUUID()}`,
          userId: adminId,
          title,
          description: `${verification.subjectName} (${verification.evidenceType}) sudah ${age}. Prioritaskan keputusan sebelum antrean semakin tertunda.`,
          type: "system",
          dedupeKey,
        };
      });
    if (values.length > 0) {
      const inserted = await tx
        .insert(notificationsTable)
        .values(values)
        .onConflictDoNothing()
        .returning({ dedupeKey: notificationsTable.dedupeKey });
      result.remindersCreated = inserted.length;
    }
    return result;
  });
}

const workerStatus: VerificationSlaReminderWorkerStatus = {
  state: "idle",
  intervalMs: VERIFICATION_SLA_REMINDER_INTERVAL_MS,
  lastStartedAt: null,
  lastCompletedAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  consecutiveFailures: 0,
  skippedRuns: 0,
  lastError: null,
  lastRun: null,
};
let workerTimer: NodeJS.Timeout | null = null;
let workerRunning = false;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getVerificationSlaReminderWorkerStatus(): VerificationSlaReminderWorkerStatus {
  return {
    ...workerStatus,
    lastRun: workerStatus.lastRun ? { ...workerStatus.lastRun } : null,
  };
}

export async function runVerificationSlaReminderWorker(
  now = new Date(),
  synchronize = syncVerificationSlaReminders,
): Promise<VerificationSlaReminderSyncResult | null> {
  if (workerRunning) {
    workerStatus.skippedRuns += 1;
    logger.warn("Skipped overlapping verification SLA reminder worker run");
    return null;
  }

  workerRunning = true;
  workerStatus.state = "running";
  workerStatus.lastStartedAt = now.toISOString();
  try {
    const result = await synchronize(undefined, now);
    workerStatus.state = "succeeded";
    workerStatus.lastCompletedAt = new Date().toISOString();
    workerStatus.lastSuccessAt = workerStatus.lastCompletedAt;
    workerStatus.consecutiveFailures = 0;
    workerStatus.lastError = null;
    workerStatus.lastRun = result;
    logger.info(result, "Verification SLA reminder worker completed");
    return result;
  } catch (error) {
    workerStatus.state = "failed";
    workerStatus.lastCompletedAt = new Date().toISOString();
    workerStatus.lastFailureAt = workerStatus.lastCompletedAt;
    workerStatus.consecutiveFailures += 1;
    workerStatus.lastError = errorMessage(error);
    logger.error(
      { err: error, consecutiveFailures: workerStatus.consecutiveFailures },
      "Verification SLA reminder worker failed",
    );
    return null;
  } finally {
    workerRunning = false;
  }
}

export function startVerificationSlaReminderWorker(
  intervalMs = VERIFICATION_SLA_REMINDER_INTERVAL_MS,
): () => void {
  if (intervalMs <= 0 || !Number.isFinite(intervalMs)) {
    throw new Error(`Invalid verification SLA reminder interval: ${intervalMs}`);
  }
  if (workerTimer) return stopVerificationSlaReminderWorker;

  workerStatus.intervalMs = intervalMs;
  void runVerificationSlaReminderWorker();
  workerTimer = setInterval(() => {
    void runVerificationSlaReminderWorker();
  }, intervalMs);
  workerTimer.unref();
  return stopVerificationSlaReminderWorker;
}

export function stopVerificationSlaReminderWorker(): void {
  if (!workerTimer) return;
  clearInterval(workerTimer);
  workerTimer = null;
}