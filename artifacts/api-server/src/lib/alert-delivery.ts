import { logger } from "./logger";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = 250;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_DELIVERY_RECORDS = 100;

export interface OperationalAlert {
  deduplicationKey: string;
  name: string;
  value: number;
  threshold: string;
  correlationContext: Record<string, string>;
  runbook: string[];
  triggeredAt: string;
}

export interface AlertDeliveryRecord {
  deduplicationKey: string;
  alertName: string;
  status: "pending" | "delivered" | "failed" | "disabled";
  attempts: number;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  error: string | null;
}

const deliveries = new Map<string, AlertDeliveryRecord>();
const inFlight = new Map<string, Promise<void>>();

function numberFromEnv(name: string, fallback: number, minimum: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function recordDelivery(record: AlertDeliveryRecord): void {
  deliveries.delete(record.deduplicationKey);
  deliveries.set(record.deduplicationKey, record);
  while (deliveries.size > MAX_DELIVERY_RECORDS) {
    const oldest = deliveries.keys().next().value;
    if (!oldest) break;
    deliveries.delete(oldest);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.name;
  return "UnknownError";
}

function webhookPayload(alert: OperationalAlert) {
  return {
    event: "operational_alert",
    deduplicationKey: alert.deduplicationKey,
    alert: {
      name: alert.name,
      value: alert.value,
      threshold: alert.threshold,
      correlationContext: alert.correlationContext,
      runbook: alert.runbook,
      triggeredAt: alert.triggeredAt,
    },
    text: [
      `[ON-CALL] ${alert.name}`,
      `Value: ${alert.value}`,
      `Threshold: ${alert.threshold}`,
      `Context: ${JSON.stringify(alert.correlationContext)}`,
      `Runbook: ${alert.runbook.join(" | ")}`,
    ].join("\n"),
  };
}

async function deliver(alert: OperationalAlert): Promise<void> {
  const webhookUrl = process.env.ON_CALL_WEBHOOK_URL;
  if (!webhookUrl) {
    recordDelivery({
      deduplicationKey: alert.deduplicationKey,
      alertName: alert.name,
      status: "disabled",
      attempts: 0,
      lastAttemptAt: null,
      deliveredAt: null,
      error: "channel_not_configured",
    });
    logger.warn(
      { alertDelivery: { deduplicationKey: alert.deduplicationKey, status: "disabled" } },
      "On-call alert channel is not configured",
    );
    return;
  }

  const maxAttempts = numberFromEnv("ON_CALL_WEBHOOK_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS, 1);
  const retryBaseMs = numberFromEnv("ON_CALL_WEBHOOK_RETRY_BASE_MS", DEFAULT_RETRY_BASE_MS, 1);
  const timeoutMs = numberFromEnv("ON_CALL_WEBHOOK_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, 100);
  const record: AlertDeliveryRecord = {
    deduplicationKey: alert.deduplicationKey,
    alertName: alert.name,
    status: "pending",
    attempts: 0,
    lastAttemptAt: null,
    deliveredAt: null,
    error: null,
  };
  recordDelivery(record);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    record.attempts = attempt;
    record.lastAttemptAt = new Date().toISOString();
    recordDelivery(record);
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-alert-deduplication-key": alert.deduplicationKey,
        },
        body: JSON.stringify(webhookPayload(alert)),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`WebhookHttp${response.status}`);
      record.status = "delivered";
      record.deliveredAt = new Date().toISOString();
      record.error = null;
      recordDelivery(record);
      logger.info(
        { alertDelivery: { deduplicationKey: alert.deduplicationKey, status: "delivered", attempt } },
        "On-call alert delivered",
      );
      return;
    } catch (error) {
      record.error = safeErrorMessage(error);
      recordDelivery(record);
      if (attempt < maxAttempts) await delay(retryBaseMs * 2 ** (attempt - 1));
    }
  }

  record.status = "failed";
  recordDelivery(record);
  logger.error(
    {
      alertChannelFailure: {
        channel: "webhook",
        deduplicationKey: alert.deduplicationKey,
        attempts: record.attempts,
        error: record.error,
      },
    },
    "On-call alert delivery channel failed",
  );
}

export function dispatchOperationalAlert(alert: OperationalAlert): Promise<void> {
  const existing = inFlight.get(alert.deduplicationKey);
  if (existing) return existing;
  const promise = deliver(alert).finally(() => {
    inFlight.delete(alert.deduplicationKey);
  });
  inFlight.set(alert.deduplicationKey, promise);
  return promise;
}

export function getAlertDeliveryStatus() {
  const records = [...deliveries.values()];
  return {
    channel: "webhook",
    configured: Boolean(process.env.ON_CALL_WEBHOOK_URL),
    healthy: records.every((record) => record.status !== "failed"),
    failedDeliveries: records.filter((record) => record.status === "failed").length,
    pendingDeliveries: records.filter((record) => record.status === "pending").length,
    recent: records.slice(-20).reverse(),
  };
}

export async function waitForAlertDeliveries(): Promise<void> {
  await Promise.allSettled([...inFlight.values()]);
}

export function resetAlertDeliveryForTests(): void {
  deliveries.clear();
  inFlight.clear();
}