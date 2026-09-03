import { randomUUID } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { pool } from "@workspace/db";
import { logger } from "./logger";

const STARTED_AT = Date.now();
const MAX_CORRELATION_ID_LENGTH = 128;
const MAX_SAMPLES_PER_ROUTE = 500;
const DEFAULT_ALERT_COOLDOWN_MS = 15 * 60_000;
const DEFAULT_ERROR_RATE_THRESHOLD = 0.05;
const DEFAULT_LATENCY_THRESHOLD_MS = 1_500;
const DEFAULT_WORKER_FAILURE_THRESHOLD = 3;
const DEFAULT_SYNTHETIC_INTERVAL_MS = 60_000;

export type WorkerOutcome = "success" | "failure" | "skipped";

interface RouteMetric {
  requests: number;
  errors: number;
  rateLimited: number;
  durationsMs: number[];
}

interface WorkerMetric {
  runs: number;
  successes: number;
  failures: number;
  skipped: number;
  consecutiveFailures: number;
  lastDurationMs: number | null;
  lastOutcome: WorkerOutcome | null;
  lastRunAt: string | null;
}

interface AlertDefinition {
  name: string;
  threshold: string;
  cooldownMs: number;
  runbook: string[];
}

const routeMetrics = new Map<string, RouteMetric>();
const workerMetrics = new Map<string, WorkerMetric>();
const lastAlertAt = new Map<string, number>();
let syntheticTimer: NodeJS.Timeout | null = null;
let syntheticRunning = false;

function numberFromEnv(name: string, fallback: number, minimum: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function alertCooldownMs(): number {
  return numberFromEnv("OBSERVABILITY_ALERT_COOLDOWN_MS", DEFAULT_ALERT_COOLDOWN_MS, 1_000);
}

function errorRateThreshold(): number {
  return numberFromEnv("OBSERVABILITY_ERROR_RATE_THRESHOLD", DEFAULT_ERROR_RATE_THRESHOLD, 0.001);
}

function latencyThresholdMs(): number {
  return numberFromEnv("OBSERVABILITY_LATENCY_P95_THRESHOLD_MS", DEFAULT_LATENCY_THRESHOLD_MS, 1);
}

function workerFailureThreshold(): number {
  return numberFromEnv("OBSERVABILITY_WORKER_FAILURE_THRESHOLD", DEFAULT_WORKER_FAILURE_THRESHOLD, 1);
}

export function correlationIdFromRequest(req: Request): string {
  if (
    typeof req.id === "string" &&
    req.id.length <= MAX_CORRELATION_ID_LENGTH &&
    /^[A-Za-z0-9._:-]+$/.test(req.id)
  ) {
    return req.id;
  }
  const candidate = req.header("x-correlation-id");
  if (
    candidate &&
    candidate.length <= MAX_CORRELATION_ID_LENGTH &&
    /^[A-Za-z0-9._:-]+$/.test(candidate)
  ) {
    return candidate;
  }
  return randomUUID();
}

export function routeGroupForRequest(req: Request): string {
  const path = `${req.baseUrl || ""}${req.route?.path || req.path || "/"}`;
  const apiPath = path.replace(/^\/api/, "") || "/";
  const firstSegment = apiPath.split("/").filter(Boolean)[0] ?? "root";
  if (firstSegment === "healthz" || firstSegment === "readyz" || firstSegment === "observability") {
    return "system";
  }
  if (firstSegment === "passport") return "passport";
  if (firstSegment === "admin") return "admin";
  if (firstSegment === "company") return "company";
  if (firstSegment === "programs") return "programs";
  if (firstSegment === "notifications") return "notifications";
  if (firstSegment === "member") return "member";
  return "identity";
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

function emitAlert(name: string, value: number, definition: AlertDefinition): void {
  const now = Date.now();
  const previous = lastAlertAt.get(name) ?? 0;
  if (now - previous < definition.cooldownMs) return;
  lastAlertAt.set(name, now);
  logger.error(
    {
      alert: {
        name,
        value,
        threshold: definition.threshold,
        cooldownMs: definition.cooldownMs,
        runbook: definition.runbook,
      },
    },
    "Operational alert triggered",
  );
}

function evaluateRouteAlerts(routeGroup: string, metric: RouteMetric): void {
  if (metric.requests >= 20) {
    const rate = metric.errors / metric.requests;
    if (rate >= errorRateThreshold()) {
      emitAlert(`api-error-rate:${routeGroup}`, rate, {
        name: "API error rate",
        threshold: `>= ${errorRateThreshold()}`,
        cooldownMs: alertCooldownMs(),
        runbook: [
          "Filter logs by routeGroup and correlationId.",
          "Check database health and recent deployments.",
          "Rollback the latest deployment if failures began immediately after release.",
        ],
      });
    }
  }
  const p95 = percentile(metric.durationsMs, 0.95);
  if (metric.requests >= 20 && p95 >= latencyThresholdMs()) {
    emitAlert(`api-latency:${routeGroup}`, p95, {
      name: "API p95 latency",
      threshold: `>= ${latencyThresholdMs()} ms`,
      cooldownMs: alertCooldownMs(),
      runbook: [
        "Filter slow request logs by routeGroup and correlationId.",
        "Check database latency and connection saturation.",
        "Reduce load or rollback a recent expensive query.",
      ],
    });
  }
}

export const observabilityMiddleware: RequestHandler = (req, res, next) => {
  const correlationId = correlationIdFromRequest(req);
  req.id = correlationId;
  res.setHeader("X-Correlation-ID", correlationId);
  const started = performance.now();

  res.once("finish", () => {
    const durationMs = Math.max(0, performance.now() - started);
    const routeGroup = routeGroupForRequest(req);
    const key = `${req.method}:${routeGroup}`;
    const metric = routeMetrics.get(key) ?? {
      requests: 0,
      errors: 0,
      rateLimited: 0,
      durationsMs: [],
    };
    metric.requests += 1;
    if (res.statusCode >= 500) metric.errors += 1;
    if (res.statusCode === 429) metric.rateLimited += 1;
    metric.durationsMs.push(durationMs);
    if (metric.durationsMs.length > MAX_SAMPLES_PER_ROUTE) metric.durationsMs.shift();
    routeMetrics.set(key, metric);
    req.log.info(
      { correlationId, routeGroup, durationMs: Math.round(durationMs), statusCode: res.statusCode },
      "Request observed",
    );
    evaluateRouteAlerts(routeGroup, metric);
  });
  next();
};

export function recordRateLimitEvent(policy: string, event: "near-capacity" | "blocked" | "store-failure"): void {
  if (event === "blocked" || event === "store-failure") {
    emitAlert(`rate-limit:${policy}:${event}`, 1, {
      name: `Rate limiter ${event}`,
      threshold: ">= 1 event",
      cooldownMs: alertCooldownMs(),
      runbook: [
        "Check the rateLimitPolicy and correlationId in structured logs.",
        event === "store-failure"
          ? "Check PostgreSQL health and rate limiter failure mode."
          : "Confirm whether traffic is legitimate before changing limits.",
      ],
    });
  }
}

export function recordWorkerRun(name: string, outcome: WorkerOutcome, durationMs: number): void {
  const metric = workerMetrics.get(name) ?? {
    runs: 0,
    successes: 0,
    failures: 0,
    skipped: 0,
    consecutiveFailures: 0,
    lastDurationMs: null,
    lastOutcome: null,
    lastRunAt: null,
  };
  metric.runs += 1;
  metric.lastDurationMs = Math.round(durationMs);
  metric.lastOutcome = outcome;
  metric.lastRunAt = new Date().toISOString();
  if (outcome === "success") {
    metric.successes += 1;
    metric.consecutiveFailures = 0;
  } else if (outcome === "failure") {
    metric.failures += 1;
    metric.consecutiveFailures += 1;
  } else {
    metric.skipped += 1;
  }
  workerMetrics.set(name, metric);
  if (metric.consecutiveFailures >= workerFailureThreshold()) {
    emitAlert(`worker-failure:${name}`, metric.consecutiveFailures, {
      name: "Background worker consecutive failures",
      threshold: `>= ${workerFailureThreshold()} consecutive failures`,
      cooldownMs: alertCooldownMs(),
      runbook: [
        `Filter logs for workerName=${name}.`,
        "Check database connectivity and the worker's latest error.",
        "Pause dependent operations and restart the service after correcting the cause.",
      ],
    });
  }
}

export async function runSyntheticChecks() {
  const started = performance.now();
  try {
    await pool.query("SELECT 1");
    return {
      status: "ok" as const,
      checkedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - started),
      checks: [{ name: "database-connectivity", status: "ok" as const }],
    };
  } catch (error) {
    logger.error({ err: error }, "Synthetic database check failed");
    emitAlert("synthetic:database-connectivity", 1, {
      name: "Critical synthetic check failed",
      threshold: ">= 1 failure",
      cooldownMs: alertCooldownMs(),
      runbook: [
        "Check PostgreSQL status and connection saturation.",
        "Confirm DATABASE_URL is available to the production service.",
        "Restore database connectivity before investigating downstream API failures.",
      ],
    });
    return {
      status: "failed" as const,
      checkedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - started),
      checks: [{ name: "database-connectivity", status: "failed" as const }],
    };
  }
}

export async function runSyntheticHealthCheckWorker(): Promise<void> {
  if (syntheticRunning) {
    recordWorkerRun("synthetic-health-checks", "skipped", 0);
    return;
  }
  syntheticRunning = true;
  const started = performance.now();
  try {
    const result = await runSyntheticChecks();
    recordWorkerRun(
      "synthetic-health-checks",
      result.status === "ok" ? "success" : "failure",
      performance.now() - started,
    );
  } finally {
    syntheticRunning = false;
  }
}

export function startSyntheticHealthCheckWorker(
  intervalMs = numberFromEnv(
    "OBSERVABILITY_SYNTHETIC_INTERVAL_MS",
    DEFAULT_SYNTHETIC_INTERVAL_MS,
    5_000,
  ),
): () => void {
  if (syntheticTimer) return stopSyntheticHealthCheckWorker;
  void runSyntheticHealthCheckWorker();
  syntheticTimer = setInterval(() => {
    void runSyntheticHealthCheckWorker();
  }, intervalMs);
  syntheticTimer.unref();
  return stopSyntheticHealthCheckWorker;
}

export function stopSyntheticHealthCheckWorker(): void {
  if (!syntheticTimer) return;
  clearInterval(syntheticTimer);
  syntheticTimer = null;
}

export function getObservabilityDashboard() {
  return {
    generatedAt: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1_000),
    routes: [...routeMetrics.entries()].map(([key, metric]) => ({
      route: key,
      requests: metric.requests,
      errors: metric.errors,
      errorRate: metric.requests ? metric.errors / metric.requests : 0,
      rateLimited: metric.rateLimited,
      latencyMs: {
        p50: Math.round(percentile(metric.durationsMs, 0.5)),
        p95: Math.round(percentile(metric.durationsMs, 0.95)),
        max: Math.round(Math.max(0, ...metric.durationsMs)),
      },
    })),
    workers: [...workerMetrics.entries()].map(([name, metric]) => ({ name, ...metric })),
    alerts: {
      errorRateThreshold: errorRateThreshold(),
      latencyP95ThresholdMs: latencyThresholdMs(),
      workerConsecutiveFailureThreshold: workerFailureThreshold(),
      cooldownMs: alertCooldownMs(),
    },
  };
}

export function resetObservabilityForTests(): void {
  stopSyntheticHealthCheckWorker();
  routeMetrics.clear();
  workerMetrics.clear();
  lastAlertAt.clear();
}