import app from "./app";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";
import { startAlertResponseWorker } from "./lib/alert-responses";
import {
  expireCompanyTalentConsents,
  remindCompanyTalentConsentExpiries,
} from "./lib/talent-consent";
import { startVerificationSlaReminderWorker } from "./lib/verification-sla";
import {
  recordWorkerRun,
  startSyntheticHealthCheckWorker,
} from "./lib/observability";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

let expiryRun: Promise<void> | null = null;
function runExpiryJobs(): void {
  if (expiryRun) {
    recordWorkerRun("talent-consent-maintenance", "skipped", 0);
    return;
  }
  const started = performance.now();
  let failed = false;
  expiryRun = Promise.all([
    expireCompanyTalentConsents().catch((err) => {
      failed = true;
      logger.error({ err }, "Failed to expire company talent consents");
    }),
    remindCompanyTalentConsentExpiries().catch((err) => {
      failed = true;
      logger.error({ err }, "Failed to create company talent consent reminders");
    }),
  ]).then(() => {
    recordWorkerRun(
      "talent-consent-maintenance",
      failed ? "failure" : "success",
      performance.now() - started,
    );
  }).finally(() => {
    expiryRun = null;
  });
}

const expiryTimer = setInterval(() => {
  runExpiryJobs();
}, 60_000);
expiryTimer.unref();

const stopVerificationSlaReminderWorker = startVerificationSlaReminderWorker();
const stopSyntheticHealthCheckWorker = startSyntheticHealthCheckWorker();
const stopAlertResponseWorker = startAlertResponseWorker();
let shuttingDown = false;
const shutdownTimeoutMs = 15_000;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    logger.warn({ signal }, "Second shutdown signal received; forcing exit");
    server.closeAllConnections?.();
    process.exit(1);
  }
  shuttingDown = true;
  logger.info({ signal, timeoutMs: shutdownTimeoutMs }, "Graceful shutdown started");
  clearInterval(expiryTimer);
  stopVerificationSlaReminderWorker();
  stopSyntheticHealthCheckWorker();
  const responseWorkerDrained = stopAlertResponseWorker();

  const timeout = setTimeout(() => {
    logger.error({ signal, timeoutMs: shutdownTimeoutMs }, "Graceful shutdown timed out");
    server.closeAllConnections?.();
    process.exit(1);
  }, shutdownTimeoutMs);
  timeout.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    if (expiryRun) await expiryRun;
    await responseWorkerDrained;
    await pool.end();
    clearTimeout(timeout);
    logger.info({ signal }, "Graceful shutdown completed");
    process.exit(0);
  } catch (err) {
    clearTimeout(timeout);
    logger.error({ err, signal }, "Graceful shutdown failed");
    server.closeAllConnections?.();
    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
