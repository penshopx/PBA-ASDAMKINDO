import { randomUUID, createHash } from "node:crypto";
import {
  db, alertResponsesTable, operationalAlertDeliveriesTable, type AlertResponseRow,
} from "@workspace/db";
import type { AlertResponseDeliveryStatus } from "@workspace/api-zod";
import { and, desc, eq, inArray, isNotNull, isNull, lte, lt, or, sql } from "drizzle-orm";
import { logger } from "./logger";

const DEFAULT_REMINDER_MAX_ATTEMPTS = 3;
const MAX_REMINDER_ATTEMPTS = 5;
const DEFAULT_REMINDER_INTERVAL_MINUTES = 15;
const REMINDER_BATCH_SIZE = 100;

function responseMinutes(): number {
  const minutes = Number(process.env.ON_CALL_ACK_TIMEOUT_MINUTES ?? 15);
  return Number.isFinite(minutes) && minutes >= 1 && minutes <= 1440 ? minutes : 15;
}

function boundedEnvironmentNumber(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= min ? Math.min(parsed, max) : fallback;
}

export function alertAckReminderConfig() {
  return {
    maxAttempts: boundedEnvironmentNumber(
      "ON_CALL_ACK_REMINDER_MAX_ATTEMPTS", DEFAULT_REMINDER_MAX_ATTEMPTS, 1, MAX_REMINDER_ATTEMPTS,
    ),
    intervalMs: boundedEnvironmentNumber(
      "ON_CALL_ACK_REMINDER_INTERVAL_MINUTES", DEFAULT_REMINDER_INTERVAL_MINUTES, 1, 1440,
    ) * 60_000,
  };
}

function reminderDeliveryKey(incidentId: string, attempt: number): string {
  const bytes = createHash("sha256").update(`ack-reminder:${incidentId}:${attempt}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function registerAlertResponse(alert: {
  deduplicationKey: string; name: string; triggeredAt: string;
}, reminderEnabled = true): Promise<void> {
  const triggeredAt = new Date(alert.triggeredAt);
  if (!Number.isFinite(triggeredAt.getTime())) throw new Error("Invalid alert trigger time");
  await db.insert(alertResponsesTable).values({
    id: alert.deduplicationKey,
    alertName: alert.name,
    triggeredAt,
    responseDueAt: new Date(triggeredAt.getTime() + responseMinutes() * 60_000),
    ackReminderEnabled: reminderEnabled,
  }).onConflictDoNothing();
}

export function alertResponseView(
  row: AlertResponseRow,
  now = new Date(),
  deliveryStatus: AlertResponseDeliveryStatus = "unknown",
) {
  const late = row.overdueAt !== null
    || (row.acknowledgedAt ?? now).getTime() >= row.responseDueAt.getTime();
  return {
    id: row.id,
    alertName: row.alertName,
    triggeredAt: row.triggeredAt.toISOString(),
    responseDueAt: row.responseDueAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    overdueAt: row.overdueAt?.toISOString() ?? (late ? row.responseDueAt.toISOString() : null),
    reminderStatus: row.ackReminderStatus,
    deliveryStatus,
    incidentStatus: row.incidentStatus,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedBy: row.resolvedBy,
    reminderAttempts: row.ackReminderAttempts,
    reminderLastAttemptAt: row.ackReminderLastAttemptAt?.toISOString() ?? null,
    reminderExhausted: row.ackReminderAttempts >= alertAckReminderConfig().maxAttempts,
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

export interface AlertAckReminder {
  incidentId: string;
  alertName: string;
  responseDueAt: string;
  deliveryKey: string;
  attempt: number;
}

interface ReminderProcessingOptions {
  now?: Date;
  maxAttempts?: number;
  intervalMs?: number;
  leaseMs?: number;
  send: (reminder: AlertAckReminder) => Promise<void>;
}

async function interruptExpiredReminders(now: Date): Promise<void> {
  const expired = await db.select({
    incidentId: alertResponsesTable.id,
    deliveryKey: alertResponsesTable.ackReminderDeliveryKey,
  }).from(alertResponsesTable)
    .innerJoin(
      operationalAlertDeliveriesTable,
      eq(operationalAlertDeliveriesTable.deduplicationKey, alertResponsesTable.ackReminderDeliveryKey!),
    )
    .where(and(
      eq(alertResponsesTable.ackReminderStatus, "pending"),
      eq(operationalAlertDeliveriesTable.status, "pending"),
      lte(operationalAlertDeliveriesTable.leaseUntil, now),
    ))
    .orderBy(alertResponsesTable.ackReminderLastAttemptAt)
    .limit(REMINDER_BATCH_SIZE);

  for (const candidate of expired) {
    if (!candidate.deliveryKey) continue;
    await db.transaction(async (tx) => {
      const [response] = await tx.select().from(alertResponsesTable)
        .where(eq(alertResponsesTable.id, candidate.incidentId)).for("update");
      const [delivery] = await tx.select().from(operationalAlertDeliveriesTable)
        .where(eq(operationalAlertDeliveriesTable.deduplicationKey, candidate.deliveryKey!)).for("update");
      if (!response || response.ackReminderStatus !== "pending"
        || !delivery || delivery.status !== "pending" || delivery.leaseUntil > now) return;
      await tx.update(operationalAlertDeliveriesTable).set({
        status: "failed",
        error: "delivery_interrupted",
      }).where(eq(operationalAlertDeliveriesTable.deduplicationKey, candidate.deliveryKey!));
      await tx.update(alertResponsesTable).set({
        ackReminderStatus: "interrupted",
        ackReminderNextAttemptAt: null,
        ackReminderError: "delivery_interrupted",
      }).where(eq(alertResponsesTable.id, candidate.incidentId));
      logger.warn(
        { alertResponseId: candidate.incidentId, responseEvent: "ack_reminder_interrupted" },
        "On-call ACK reminder delivery interrupted; automatic replay stopped",
      );
    });
  }
}

async function reserveAckReminder(
  incidentId: string,
  now: Date,
  maxAttempts: number,
  intervalMs: number,
  leaseMs: number,
): Promise<AlertAckReminder | null> {
  return db.transaction(async (tx) => {
    const [response] = await tx.select().from(alertResponsesTable)
      .where(eq(alertResponsesTable.id, incidentId)).for("update");
    if (!response || !response.ackReminderEnabled || response.acknowledgedAt
      || !response.overdueAt || response.responseDueAt > now
      || response.ackReminderAttempts >= maxAttempts
      || response.ackReminderStatus === "interrupted" || response.ackReminderStatus === "stopped"
      || (response.ackReminderNextAttemptAt && response.ackReminderNextAttemptAt > now)) return null;

    const [initialDelivery] = await tx.select({
      status: operationalAlertDeliveriesTable.status,
    }).from(operationalAlertDeliveriesTable)
      .where(eq(operationalAlertDeliveriesTable.deduplicationKey, incidentId));
    if (!initialDelivery || initialDelivery.status !== "delivered") return null;

    if (response.ackReminderStatus === "pending" && response.ackReminderDeliveryKey) {
      const [pending] = await tx.select().from(operationalAlertDeliveriesTable)
        .where(eq(operationalAlertDeliveriesTable.deduplicationKey, response.ackReminderDeliveryKey))
        .for("update");
      if (pending?.status === "pending") {
        if (pending.leaseUntil > now) return null;
        await tx.update(operationalAlertDeliveriesTable).set({
          status: "failed",
          error: "delivery_interrupted",
        }).where(eq(operationalAlertDeliveriesTable.deduplicationKey, pending.deduplicationKey));
        await tx.update(alertResponsesTable).set({
          ackReminderStatus: "interrupted",
          ackReminderNextAttemptAt: null,
          ackReminderError: "delivery_interrupted",
        }).where(eq(alertResponsesTable.id, incidentId));
        logger.warn(
          { alertResponseId: incidentId, responseEvent: "ack_reminder_interrupted" },
          "On-call ACK reminder delivery interrupted; automatic replay stopped",
        );
        return null;
      }
    }

    const attempt = response.ackReminderAttempts + 1;
    const deliveryKey = reminderDeliveryKey(incidentId, attempt);
    const owner = randomUUID();
    const [delivery] = await tx.insert(operationalAlertDeliveriesTable).values({
      deduplicationKey: deliveryKey,
      alertName: `ACK reminder ${attempt} for ${incidentId}`,
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      deliveredAt: null,
      error: null,
      owner,
      leaseUntil: new Date(now.getTime() + leaseMs),
    }).onConflictDoNothing().returning({ deduplicationKey: operationalAlertDeliveriesTable.deduplicationKey });
    if (!delivery) return null;

    await tx.update(alertResponsesTable).set({
      ackReminderStatus: "pending",
      ackReminderAttempts: attempt,
      ackReminderLastAttemptAt: now,
      ackReminderNextAttemptAt: attempt < maxAttempts ? new Date(now.getTime() + intervalMs) : null,
      ackReminderDeliveryKey: deliveryKey,
      ackReminderError: null,
    }).where(eq(alertResponsesTable.id, incidentId));
    return {
      incidentId,
      alertName: response.alertName,
      responseDueAt: response.responseDueAt.toISOString(),
      deliveryKey,
      attempt,
    };
  });
}

async function deliverReservedAckReminder(
  reminder: AlertAckReminder,
  now: Date,
  leaseMs: number,
  send: (reminder: AlertAckReminder) => Promise<void>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [response] = await tx.select().from(alertResponsesTable)
      .where(eq(alertResponsesTable.id, reminder.incidentId)).for("update");
    const [delivery] = await tx.select().from(operationalAlertDeliveriesTable)
      .where(eq(operationalAlertDeliveriesTable.deduplicationKey, reminder.deliveryKey)).for("update");
    if (!response || !delivery || delivery.status !== "pending" || response.ackReminderStatus !== "pending") return;

    if (response.acknowledgedAt) {
      await tx.update(operationalAlertDeliveriesTable).set({
        status: "disabled",
        error: "acknowledged_before_send",
      }).where(eq(operationalAlertDeliveriesTable.deduplicationKey, reminder.deliveryKey));
      await tx.update(alertResponsesTable).set({
        ackReminderStatus: "stopped",
        ackReminderNextAttemptAt: null,
        ackReminderError: null,
      }).where(eq(alertResponsesTable.id, reminder.incidentId));
      return;
    }

    let status: "delivered" | "failed" = "delivered";
    let error: string | null = null;
    try {
      await send(reminder);
    } catch (caught) {
      status = "failed";
      error = caught instanceof Error && /^[a-z0-9_]{1,80}$/.test(caught.message)
        ? caught.message
        : caught instanceof Error ? caught.name : "UnknownError";
    }
    const deliveredAt = status === "delivered" ? new Date() : null;
    await tx.update(operationalAlertDeliveriesTable).set({
      status,
      attempts: 1,
      lastAttemptAt: now,
      deliveredAt,
      error,
      leaseUntil: new Date(now.getTime() + leaseMs),
    }).where(and(
      eq(operationalAlertDeliveriesTable.deduplicationKey, reminder.deliveryKey),
      eq(operationalAlertDeliveriesTable.owner, delivery.owner),
      eq(operationalAlertDeliveriesTable.status, "pending"),
    ));
    await tx.update(alertResponsesTable).set({
      ackReminderStatus: status,
      ackReminderLastDeliveredAt: deliveredAt,
      ackReminderError: error,
    }).where(eq(alertResponsesTable.id, reminder.incidentId));
    if (status === "delivered") {
      logger.info(
        { alertResponseId: reminder.incidentId, attempt: reminder.attempt },
        "On-call ACK reminder delivered",
      );
    } else {
      logger.warn(
        { alertResponseId: reminder.incidentId, attempt: reminder.attempt, error },
        "On-call ACK reminder delivery failed",
      );
    }
  });
}

export async function processDueAlertResponseReminders(options: ReminderProcessingOptions): Promise<void> {
  const now = options.now ?? new Date();
  const config = alertAckReminderConfig();
  const maxAttempts = Math.min(MAX_REMINDER_ATTEMPTS, Math.max(1, options.maxAttempts ?? config.maxAttempts));
  const intervalMs = Math.max(60_000, options.intervalMs ?? config.intervalMs);
  const leaseMs = Math.max(1_000, options.leaseMs ?? 35_000);

  await interruptExpiredReminders(now);
  const candidates = await db.select({ id: alertResponsesTable.id })
    .from(alertResponsesTable)
    .innerJoin(
      operationalAlertDeliveriesTable,
      eq(operationalAlertDeliveriesTable.deduplicationKey, alertResponsesTable.id),
    )
    .where(and(
      eq(alertResponsesTable.ackReminderEnabled, true),
      isNull(alertResponsesTable.acknowledgedAt),
      isNotNull(alertResponsesTable.overdueAt),
      inArray(alertResponsesTable.ackReminderStatus, ["not_sent", "delivered", "failed"]),
      lte(alertResponsesTable.responseDueAt, now),
      lt(alertResponsesTable.ackReminderAttempts, maxAttempts),
      eq(operationalAlertDeliveriesTable.status, "delivered"),
      or(isNull(alertResponsesTable.ackReminderNextAttemptAt), lte(alertResponsesTable.ackReminderNextAttemptAt, now)),
    ))
    .orderBy(alertResponsesTable.responseDueAt)
    .limit(REMINDER_BATCH_SIZE);

  for (const candidate of candidates) {
    const reminder = await reserveAckReminder(candidate.id, now, maxAttempts, intervalMs, leaseMs);
    if (reminder) await deliverReservedAckReminder(reminder, now, leaseMs, options.send);
  }
}

export async function listAlertResponses() {
  await detectOverdueAlertResponses();
  const [outstanding, recent] = await Promise.all([
    db.select().from(alertResponsesTable).where(isNull(alertResponsesTable.acknowledgedAt))
      .orderBy(alertResponsesTable.responseDueAt),
    db.select().from(alertResponsesTable).where(isNotNull(alertResponsesTable.acknowledgedAt))
      .orderBy(desc(alertResponsesTable.acknowledgedAt)).limit(50),
  ]);
  const rows = [...outstanding, ...recent];
  const deliveries = rows.length
    ? await db.select({
      id: operationalAlertDeliveriesTable.deduplicationKey,
      status: operationalAlertDeliveriesTable.status,
    }).from(operationalAlertDeliveriesTable)
      .where(inArray(operationalAlertDeliveriesTable.deduplicationKey, rows.map((row) => row.id)))
    : [];
  const deliveryStatuses = new Map(deliveries.map((delivery) => [delivery.id, delivery.status]));
  return rows.map((row) => alertResponseView(row, new Date(), deliveryStatuses.get(row.id) ?? "unknown"));
}

export async function acknowledgeAlertResponse(id: string, actorUserId: string) {
  const row = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(alertResponsesTable)
      .where(eq(alertResponsesTable.id, id)).for("update");
    if (!row) return null;
    if (row.acknowledgedAt) return row;
    // Take the timestamp after acquiring the row lock, not before waiting for it.
    const now = new Date();
    const [updated] = await tx.update(alertResponsesTable).set({
      acknowledgedAt: now,
      acknowledgedBy: actorUserId,
      overdueAt: row.overdueAt ?? (now >= row.responseDueAt ? row.responseDueAt : null),
      ackReminderStatus: row.ackReminderStatus === "pending" ? "stopped" : row.ackReminderStatus,
      ackReminderNextAttemptAt: null,
    }).where(eq(alertResponsesTable.id, id)).returning();
    if (row.ackReminderStatus === "pending" && row.ackReminderDeliveryKey) {
      await tx.update(operationalAlertDeliveriesTable).set({
        status: "disabled",
        error: "acknowledged_before_send",
      }).where(and(
        eq(operationalAlertDeliveriesTable.deduplicationKey, row.ackReminderDeliveryKey),
        eq(operationalAlertDeliveriesTable.status, "pending"),
      ));
    }
    return updated!;
  });
  if (!row) return null;
  const [delivery] = await db.select({ status: operationalAlertDeliveriesTable.status })
    .from(operationalAlertDeliveriesTable)
    .where(eq(operationalAlertDeliveriesTable.deduplicationKey, id));
  return alertResponseView(row, new Date(), delivery?.status ?? "unknown");
}

export async function resolveAlertResponse(id: string, actorUserId: string) {
  const outcome = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(alertResponsesTable)
      .where(eq(alertResponsesTable.id, id)).for("update");
    if (!row) return { kind: "not_found" as const };
    if (row.incidentStatus === "resolved") return { kind: "already_resolved" as const };

    const [updated] = await tx.update(alertResponsesTable).set({
      incidentStatus: "resolved",
      resolvedAt: new Date(),
      resolvedBy: actorUserId,
    }).where(eq(alertResponsesTable.id, id)).returning();
    return { kind: "resolved" as const, row: updated! };
  });
  if (outcome.kind !== "resolved") return outcome;
  const [delivery] = await db.select({ status: operationalAlertDeliveriesTable.status })
    .from(operationalAlertDeliveriesTable)
    .where(eq(operationalAlertDeliveriesTable.deduplicationKey, id));
  return { kind: "resolved" as const, response: alertResponseView(outcome.row, new Date(), delivery?.status ?? "unknown") };
}

export function startAlertResponseWorker(
  isSlackReminderEnabled: () => boolean,
  sendReminder: (reminder: AlertAckReminder) => Promise<void>,
) {
  let active: Promise<void> | null = null;
  const run = () => {
    if (active) return;
    active = detectOverdueAlertResponses().then(async () => {
      if (isSlackReminderEnabled()) {
        await processDueAlertResponseReminders({ send: sendReminder });
      }
    }).catch(() => {
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
