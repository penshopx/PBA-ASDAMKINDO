import app from "./app";
import { logger } from "./lib/logger";
import {
  expireCompanyTalentConsents,
  remindCompanyTalentConsentExpiries,
} from "./lib/talent-consent";
import { startVerificationSlaReminderWorker } from "./lib/verification-sla";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

const expiryTimer = setInterval(() => {
  void Promise.all([
    expireCompanyTalentConsents().catch((err) => {
      logger.error({ err }, "Failed to expire company talent consents");
    }),
    remindCompanyTalentConsentExpiries().catch((err) => {
      logger.error({ err }, "Failed to create company talent consent reminders");
    }),
  ]);
}, 60_000);
expiryTimer.unref();

startVerificationSlaReminderWorker();
