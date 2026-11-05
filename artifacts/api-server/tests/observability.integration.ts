import assert from "node:assert/strict";
import { db, alertResponsesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { GetAdminObservabilityResponse } from "@workspace/api-zod";
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
import {
  dispatchOperationalAlert,
  getAlertDeliveryStatus,
  resetAlertDeliveryForTests,
  sendOnCallTestAlert,
  waitForAlertDeliveries,
} from "../src/lib/alert-delivery";

resetObservabilityForTests();
process.env.ON_CALL_CHANNEL = "webhook";
process.env.OBSERVABILITY_WORKER_FAILURE_THRESHOLD = "1";
process.env.OBSERVABILITY_ALERT_COOLDOWN_MS = "1000";
process.env.ON_CALL_WEBHOOK_MAX_ATTEMPTS = "3";
process.env.ON_CALL_WEBHOOK_RETRY_BASE_MS = "1";

const receivedPayloads: unknown[] = [];
let deliveryAttempts = 0;
const responseKeys = new Set<string>();
const webhookApp = express();
webhookApp.use(express.json());
webhookApp.post("/on-call", (req, res) => {
  deliveryAttempts += 1;
  if (typeof req.body?.deduplicationKey === "string") responseKeys.add(req.body.deduplicationKey);
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
  const parsedDashboard = GetAdminObservabilityResponse.parse({
    ...dashboard,
    synthetic: { status: "ok", checkedAt: new Date().toISOString(), durationMs: 0, checks: [] },
  });
  assert.equal(parsedDashboard.alertDelivery.recent[0]?.status, "delivered");

  resetAlertDeliveryForTests();
  process.env.ON_CALL_CHANNEL = "slack";
  process.env.ON_CALL_SLACK_CHANNEL_ID = "C012345";
  const originalProxy = ReplitConnectors.prototype.proxy;
  let slackAttempts = 0;
  const messageIds: unknown[] = [];
  try {
    ReplitConnectors.prototype.proxy = async function (connector, path, options) {
      assert.equal(connector, "slack");
      assert.equal(path, "/chat.postMessage");
      assert.ok(options?.signal);
      const body = options?.body as { channel: string; text: string; client_msg_id: string };
       responseKeys.add(body.client_msg_id);
      assert.equal(body.channel, "C012345");
      assert.match(body.text, /UJI ALARM/);
      messageIds.push(body.client_msg_id);
      slackAttempts++;
      return Response.json(slackAttempts < 3
        ? { ok: false, error: "ratelimited" }
        : { ok: true, ts: "123.456" });
    };
    const [testResult, concurrentResult] = await Promise.all([sendOnCallTestAlert(), sendOnCallTestAlert()]);
    assert.equal(concurrentResult.error, "test_cooldown");
    assert.equal(testResult.delivery?.status, "delivered");
    assert.equal(slackAttempts, 3);
    assert.equal(new Set(messageIds).size, 1, "Retries must use the same message ID");
    assert.equal(getAlertDeliveryStatus().channel, "slack");
    assert.equal(getAlertDeliveryStatus().recent[0]?.status, "delivered");
    await dispatchOperationalAlert({
      deduplicationKey: testResult.delivery!.deduplicationKey,
      name: "duplicate",
      value: 1,
      threshold: "test",
      correlationContext: {},
      runbook: [],
      triggeredAt: new Date().toISOString(),
    });
    assert.equal(slackAttempts, 3, "A delivered alert must not be sent again");

    resetAlertDeliveryForTests();
    ReplitConnectors.prototype.proxy = async (_connector, _path, options) => {
      responseKeys.add((options?.body as { client_msg_id: string }).client_msg_id);
      return Response.json({ ok: false, error: "missing_scope" });
    };
    const failedTest = await sendOnCallTestAlert();
    assert.equal(failedTest.delivery?.status, "failed", "HTTP 200 with ok:false is not delivered");
    assert.equal(failedTest.delivery?.error, "slack_missing_scope");
    assert.equal(getAlertDeliveryStatus().healthy, false);

    resetAlertDeliveryForTests();
    delete process.env.ON_CALL_SLACK_CHANNEL_ID;
    assert.equal((await sendOnCallTestAlert()).error, "channel_not_configured");
    assert.equal(getAlertDeliveryStatus().healthy, false);
  } finally {
    ReplitConnectors.prototype.proxy = originalProxy;
  }
} finally {
  if (responseKeys.size) await db.delete(alertResponsesTable).where(inArray(alertResponsesTable.id, [...responseKeys]));
  delete process.env.ON_CALL_CHANNEL;
  delete process.env.ON_CALL_SLACK_CHANNEL_ID;
  delete process.env.ON_CALL_WEBHOOK_URL;
  delete process.env.OBSERVABILITY_WORKER_FAILURE_THRESHOLD;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await new Promise<void>((resolve, reject) =>
    webhookServer.close((error) => (error ? reject(error) : resolve())),
  );
}