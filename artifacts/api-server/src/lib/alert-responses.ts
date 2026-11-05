import { db, alertResponsesTable, type AlertResponseRow } from "@workspace/db";
import { and, desc, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { logger } from "./logger";

function responseMinutes(): number {
  const minutes = Number(process.env.ON_CALL_ACK_TIMEOUT_MINUTES ?? 15);
  return Number.isFinite(minutes) && minutes >= 1 && minutes <= 1440 ? minutes : 15;
}

export async function registerAlertResponse(alert: {
  deduplicationKey: string; name: string; triggeredAt: string;
}): Promise<void> {
  const triggeredAt = new Date(alert.triggeredAt);
  if (!Number.isFinite(triggeredAt.getTime())) throw new Error("Invalid alert trigger time");
  await db.insert(alertResponsesTable).values({
    id: alert.deduplicationKey,
    alertName: alert.name,
    triggeredAt,
    responseDueAt: new Date(triggeredAt.getTime() + responseMinutes() * 60_000),
  }).onConflictDoNothing();
}

export function alertResponseView(row: AlertResponseRow, now = new Date()) {
  const late = row.overdueAt !== null
    || (row.acknowledgedAt ?? now).getTime() >= row.responseDueAt.getTime();
  return {
    id: row.id,
    alertName: row.alertName,
    triggeredAt: row.triggeredAt.toISOString(),
    responseDueAt: row.responseDueAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    overdueAt: row.overdueAt?.toISOString() ?? (late ? row.responseDueAt.toISOString() : null),
    responseStatus: row.acknowledgedAt
      ? (late ? "acknowledged_late" as const : "acknowledged" as const)
      : (late ? "overdue" as const : "awaiting_ack" as const),
  };
}

export async function detectOverdueAlertResponses(now = new Date()): Promise<void> {
  const rows = await db.update(alertResponsesTable).set({
    overdueAt: sql`${alertResponsesTable.responseDueAt}`,
  }).where(and(
    isNull(alertResponsesTable.acknowledgedAt),
    isNull(alertResponsesTable.overdueAt),
    lte(alertResponsesTable.responseDueAt, now),
  )).returning({ id: alertResponsesTable.id });
  // Atomic conditional update means only the winning instance logs the transition.
  for (const row of rows) logger.warn(
    { alertResponseId: row.id, responseEvent: "deadline_exceeded" },
    "On-call alert response deadline exceeded",
  );
}

export async function listAlertResponses() {
  await detectOverdueAlertResponses();
  const [outstanding, recent] = await Promise.all([
    db.select().from(alertResponsesTable).where(isNull(alertResponsesTable.acknowledgedAt))
      .orderBy(alertResponsesTable.responseDueAt),
    db.select().from(alertResponsesTable).where(isNotNull(alertResponsesTable.acknowledgedAt))
      .orderBy(desc(alertResponsesTable.acknowledgedAt)).limit(50),
  ]);
  return [...outstanding, ...recent].map((row) => alertResponseView(row));
}

export async function acknowledgeAlertResponse(id: string, actorUserId: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(alertResponsesTable)
      .where(eq(alertResponsesTable.id, id)).for("update");
    if (!row) return null;
    if (row.acknowledgedAt) return alertResponseView(row);
    // Take the timestamp after acquiring the row lock, not before waiting for it.
    const now = new Date();
    const [updated] = await tx.update(alertResponsesTable).set({
      acknowledgedAt: now,
      acknowledgedBy: actorUserId,
      overdueAt: row.overdueAt ?? (now >= row.responseDueAt ? row.responseDueAt : null),
    }).where(eq(alertResponsesTable.id, id)).returning();
    return alertResponseView(updated!);
  });
}

export function startAlertResponseWorker() {
  let active: Promise<void> | null = null;
  const run = () => {
    if (active) return;
    active = detectOverdueAlertResponses().catch(() => {
      logger.error({ responseEvent: "deadline_check_failed" }, "Alert response deadline check failed");
    }).finally(() => { active = null; });
  };
  run();
  const timer = setInterval(run, 30_000);
  timer.unref();
  return async () => {
    clearInterval(timer);
    if (active) await active;
  };
}
