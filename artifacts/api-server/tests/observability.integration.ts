import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import express from "express";
import pinoHttp from "pino-http";
import { logger } from "../src/lib/logger";
import {
  getObservabilityDashboard,
  observabilityMiddleware,
  recordWorkerRun,
  resetObservabilityForTests,
  routeGroupForRequest,
} from "../src/lib/observability";
import { waitForAlertDeliveries } from "../src/lib/alert-delivery";

resetObservabilityForTests();
process.env.OBSERVABILITY_WORKER_FAILURE_THRESHOLD = "1";
process.env.OBSERVABILITY_ALERT_COOLDOWN_MS = "1000";
process.env.ON_CALL_WEBHOOK_MAX_ATTEMPTS = "3";
process.env.ON_CALL_WEBHOOK_RETRY_BASE_MS = "1";

const receivedPayloads: unknown[] = [];
let deliveryAttempts = 0;
const webhookApp = express();
webhookApp.use(express.json());
webhookApp.post("/on-call", (req, res) => {
  deliveryAttempts += 1;
  receivedPayloads.push(req.body);
  res.sendStatus(deliveryAttempts < 3 ? 503 : 204);
});
const webhookServer = webhookApp.listen(0);
await once(webhookServer, "listening");
const webhookPort = (webhookServer.address() as AddressInfo).port;
process.env.ON_CALL_WEBHOOK_URL = `http://127.0.0.1:${webhookPort}/on-call`;
assert.equal(
  routeGroupForRequest({
    baseUrl: "/api",
    path: "/passport/member-sensitive-id",
  } as express.Request),
  "passport",
);

const testApp = express();
testApp.use(pinoHttp({ logger }));
testApp.use(observabilityMiddleware);
testApp.get("/api/programs/:id", (_req, res) => res.json({ ok: true }));
testApp.get("/api/failure", (_req, res) => res.status(500).json({ error: "failed" }));
const server = testApp.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const port = (server.address() as AddressInfo).port;

try {
  const supplied = await fetch(`http://127.0.0.1:${port}/api/programs/private-id`, {
    headers: { "x-correlation-id": "incident-test-123" },
  });
  assert.equal(supplied.headers.get("x-correlation-id"), "incident-test-123");

  const generated = await fetch(`http://127.0.0.1:${port}/api/failure`, {
    headers: { "x-correlation-id": "invalid id with spaces" },
  });
  assert.match(generated.headers.get("x-correlation-id") ?? "", /^[0-9a-f-]{36}$/);

  recordWorkerRun("test-worker", "failure", 25);
  await waitForAlertDeliveries();
  recordWorkerRun("test-worker", "success", 10);
  const dashboard = getObservabilityDashboard();
  assert.ok(dashboard.routes.some((route) => route.route === "GET:programs"));
  assert.ok(dashboard.routes.some((route) => route.errors === 1));
  assert.equal(dashboard.workers[0]?.name, "test-worker");
  assert.equal(dashboard.workers[0]?.successes, 1);
  assert.equal(dashboard.workers[0]?.failures, 1);
  assert.ok(dashboard.routes.every((route) => !JSON.stringify(route).includes("private-id")));
  assert.equal(deliveryAttempts, 3);
  assert.equal(dashboard.alertDelivery.healthy, true);
  assert.equal(dashboard.alertDelivery.recent[0]?.status, "delivered");
  const payload = JSON.stringify(receivedPayloads.at(-1));
  assert.match(payload, /Background worker consecutive failures/);
  assert.match(payload, /test-worker/);
  assert.match(payload, /Runbook/);
  assert.doesNotMatch(payload, /private-id/);
} finally {
  delete process.env.ON_CALL_WEBHOOK_URL;
  delete process.env.OBSERVABILITY_WORKER_FAILURE_THRESHOLD;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await new Promise<void>((resolve, reject) =>
    webhookServer.close((error) => (error ? reject(error) : resolve())),
  );
}