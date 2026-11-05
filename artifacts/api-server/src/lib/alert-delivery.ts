import { randomUUID } from "node:crypto";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "./logger";
import { registerAlertResponse } from "./alert-responses";

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
  if (error instanceof DeliveryError) return error.message;
  if (error instanceof Error) return error.name;
  return "UnknownError";
}

class DeliveryError extends Error {}

function channelConfiguration() {
  const channel = process.env.ON_CALL_CHANNEL ?? "webhook";
  const configured = channel === "slack"
    ? Boolean(process.env.ON_CALL_SLACK_CHANNEL_ID?.match(/^[CG][A-Z0-9]+$/))
    : channel === "webhook" && Boolean(process.env.ON_CALL_WEBHOOK_URL);
  return { channel, configured };
}

async function sendAlert(alert: OperationalAlert, timeoutMs: number): Promise<void> {
  if (channelConfiguration().channel === "slack") {
    // Resolve identity and refresh credentials through the connector on every attempt.
    const response = await new ReplitConnectors().proxy("slack", "/chat.postMessage", {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      body: {
        channel: process.env.ON_CALL_SLACK_CHANNEL_ID,
        text: webhookPayload(alert).text,
        mrkdwn: false,
        unfurl_links: false,
        unfurl_media: false,
        client_msg_id: alert.deduplicationKey,
      },
    });
    if (!response.ok) throw new DeliveryError(`slack_http_${response.status}`);
    const result = await response.json() as { ok?: boolean; error?: string; ts?: string };
    // Slack can reject a request with HTTP 200.
    if (result.ok !== true || !result.ts) {
      const code = result.error && /^[a-z_]{1,80}$/.test(result.error) ? result.error : "invalid_response";
      throw new DeliveryError(`slack_${code}`);
    }
    return;
  }
  const response = await fetch(process.env.ON_CALL_WEBHOOK_URL!, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-alert-deduplication-key": alert.deduplicationKey,
    },
    body: JSON.stringify(webhookPayload(alert)),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new DeliveryError(`webhook_http_${response.status}`);
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
      "Konfirmasi aktif: buka Operasional → Alarm piket → Konfirmasi petugas (ACK). Membalas Slack saja tidak mencatat ACK di aplikasi.",
      `Context: ${JSON.stringify(alert.correlationContext)}`,
      `Runbook: ${alert.runbook.join(" | ")}`,
    ].join("\n"),
  };
}

async function deliver(alert: OperationalAlert): Promise<void> {
  if (!channelConfiguration().configured) {
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
      await sendAlert(alert, timeoutMs);
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
        channel: channelConfiguration().channel,
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
  if (deliveries.get(alert.deduplicationKey)?.status === "delivered") return Promise.resolve();
  const promise = registerAlertResponse(alert).then(() => deliver(alert)).finally(() => {
    inFlight.delete(alert.deduplicationKey);
  });
  inFlight.set(alert.deduplicationKey, promise);
  return promise;
}

export function getAlertDeliveryStatus() {
  const records = [...deliveries.values()];
  return {
    ...channelConfiguration(),
    healthy: channelConfiguration().configured && records.every((record) => record.status !== "failed"),
    failedDeliveries: records.filter((record) => record.status === "failed").length,
    pendingDeliveries: records.filter((record) => record.status === "pending").length,
    recent: records.slice(-20).reverse(),
  };
}

let lastTestAt = 0;

export async function sendOnCallTestAlert() {
  if (!channelConfiguration().configured) return { error: "channel_not_configured" as const };
  // Reserve before awaiting delivery so concurrent admins cannot flood the channel.
  if (Date.now() - lastTestAt < 60_000) return { error: "test_cooldown" as const };
  lastTestAt = Date.now();
  const deduplicationKey = randomUUID();
  await dispatchOperationalAlert({
    deduplicationKey,
    name: "UJI ALARM — PBA ASDAMKINDO (bukan insiden)",
    value: 1,
    threshold: "Uji manual kanal piket",
    correlationContext: { testId: deduplicationKey, environment: process.env.NODE_ENV ?? "unknown" },
    runbook: [
      "Petugas piket: pastikan notifikasi diterima di perangkat, bukan hanya terlihat saat membuka Slack.",
      "Buka Operasional → Alarm piket dan tekan Saya menerima alarm (ACK).",
      "Tidak perlu melakukan rollback atau mengubah layanan untuk alarm uji ini.",
    ],
    triggeredAt: new Date().toISOString(),
  });
  return { delivery: deliveries.get(deduplicationKey)! };
}

export async function waitForAlertDeliveries(): Promise<void> {
  await Promise.allSettled([...inFlight.values()]);
}

export function resetAlertDeliveryForTests(): void {
  deliveries.clear();
  inFlight.clear();
  lastTestAt = 0;
}