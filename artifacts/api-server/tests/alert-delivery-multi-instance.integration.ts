import assert from "node:assert/strict";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import express from "express";
import { pool } from "@workspace/db";
import { GetAdminObservabilityResponse } from "@workspace/api-zod";
import {
  dispatchOperationalAlert,
  getAlertDeliveryStatus,
  sendOnCallTestAlert,
  waitForAlertDeliveries,
} from "../src/lib/alert-delivery";
import { getObservabilityDashboard, recordWorkerRun } from "../src/lib/observability";
import { createAlertTestSchema } from "./helpers/alert-test-schema";

type Worker = { child: ChildProcess; port: number };

async function runWorker() {
  const schema = process.env.ALERT_TEST_SCHEMA;
  assert.match(schema ?? "", /^alert_test_[a-f0-9]+$/);
  pool.options.options = `${pool.options.options ?? ""} -c search_path=${schema},public`.trim();
  const app = express();
  app.use(express.json());
  app.post("/dispatch", async (req, res) => {
    await dispatchOperationalAlert({
      deduplicationKey: req.body.key,
      name: req.body.name ?? "local-concurrency-test",
      value: 1, threshold: "test", correlationContext: {}, runbook: [],
      triggeredAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  });
  app.post("/test", async (_req, res) => { res.json(await sendOnCallTestAlert()); });
  app.post("/worker", async (_req, res) => {
    recordWorkerRun("local-shared-cooldown-test", "failure", 1);
    await waitForAlertDeliveries();
    res.json({ ok: true });
  });
  app.get("/dashboard", async (_req, res) => {
    res.json(GetAdminObservabilityResponse.parse({
      ...await getObservabilityDashboard(),
      synthetic: { status: "ok", checkedAt: new Date().toISOString(), durationMs: 0, checks: [] },
    }));
  });
  app.get("/status", async (_req, res) => { res.json(await getAlertDeliveryStatus()); });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  process.send?.({ port: (server.address() as AddressInfo).port });
  process.on("message", (message) => {
    if (message !== "shutdown") return;
    server.close(() => { void pool.end().then(() => process.exit(0)); });
  });
}

async function startWorker(schema: string, receiverUrl: string): Promise<Worker> {
  const child = fork(fileURLToPath(import.meta.url), [], {
    env: {
      ...process.env, NODE_ENV: "test", ALERT_DELIVERY_TEST_WORKER: "1",
      ALERT_TEST_SCHEMA: schema, ON_CALL_CHANNEL: "webhook",
      ON_CALL_WEBHOOK_URL: receiverUrl, ON_CALL_SLACK_CHANNEL_ID: "",
      ON_CALL_WEBHOOK_MAX_ATTEMPTS: "3", ON_CALL_WEBHOOK_RETRY_BASE_MS: "1",
      ON_CALL_WEBHOOK_TIMEOUT_MS: "1000", OBSERVABILITY_WORKER_FAILURE_THRESHOLD: "1",
      OBSERVABILITY_ALERT_COOLDOWN_MS: "60000",
    },
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Alert worker startup timed out"));
    }, 15_000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Alert worker exited before ready: ${code}`));
    });
    child.once("message", (message) => {
      clearTimeout(timer);
      assert.ok(message && typeof message === "object" && "port" in message);
      resolve({ child, port: Number(message.port) });
    });
  });
}

async function stopWorker(worker: Worker, kill = false) {
  if (worker.child.exitCode !== null || worker.child.signalCode !== null) return;
  const stopped = once(worker.child, "exit");
  if (kill) worker.child.kill("SIGKILL");
  else worker.child.send("shutdown");
  const timer = setTimeout(() => worker.child.kill("SIGKILL"), 5_000);
  try { await stopped; } finally { clearTimeout(timer); }
}

async function request(worker: Worker, path: string, body?: object) {
  const response = await fetch(`http://127.0.0.1:${worker.port}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function runTests() {
  const database = await createAlertTestSchema();
  const received = new Map<string, number>();
  let crashReceived!: () => void;
  const crashArrived = new Promise<void>((resolve) => { crashReceived = resolve; });
  const receiver = express();
  receiver.use(express.json());
  receiver.post("/on-call", (req, res) => {
    const key = req.body.deduplicationKey as string;
    assert.equal(req.header("x-alert-deduplication-key"), key);
    received.set(key, (received.get(key) ?? 0) + 1);
    if (req.body.alert.name === "crash") {
      crashReceived();
      return; // Kill the sender after reception but before acknowledgement.
    }
    setTimeout(() => res.sendStatus(req.body.alert.name === "fail" ? 503 : 204), 20);
  });
  const server = receiver.listen(0, "127.0.0.1");
  await once(server, "listening");
  const receiverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/on-call`;
  const workers: Worker[] = [];
  try {
    workers.push(await startWorker(database.schema, receiverUrl));
    workers.push(await startWorker(database.schema, receiverUrl));
    const key = randomUUID();
    await Promise.all(Array.from({ length: 24 }, (_, i) =>
      request(workers[i % 2]!, "/dispatch", { key })));
    assert.equal(received.get(key), 1, "Only the winning instance sends a shared key");
    const before = await request(workers[0]!, "/dashboard");
    assert.deepEqual(before.alertDelivery, (await request(workers[1]!, "/dashboard")).alertDelivery);
    assert.equal(before.alertDelivery.recent[0].status, "delivered");

    const tests = await Promise.all(Array.from({ length: 16 }, (_, i) =>
      request(workers[i % 2]!, "/test", {})));
    const successfulTests = tests.filter((result) => result.delivery?.status === "delivered");
    assert.equal(successfulTests.length, 1);
    assert.equal(tests.filter((result) => result.error === "test_cooldown").length, 15);
    assert.equal(received.get(successfulTests[0].delivery.deduplicationKey), 1);
    const registeredTests = await pool.query(`SELECT id FROM alert_responses WHERE alert_name LIKE 'UJI ALARM%'`);
    assert.equal(registeredTests.rowCount, 1, "Cooldown losers must not register phantom ACK deadlines");
    assert.equal(registeredTests.rows[0].id, successfulTests[0].delivery.deduplicationKey);

    await Promise.all(workers.map((worker) => request(worker, "/worker", {})));
    const operational = await pool.query(`
      SELECT deduplication_key FROM operational_alert_deliveries
      WHERE alert_name = 'Background worker consecutive failures'`);
    assert.equal(operational.rowCount, 1, "Automatic cooldown is shared too");
    assert.equal(received.get(operational.rows[0].deduplication_key), 1);

    const failedKey = randomUUID();
    await request(workers[0]!, "/dispatch", { key: failedKey, name: "fail" });
    assert.equal(received.get(failedKey), 3);
    const failed = (await request(workers[1]!, "/status")).recent.find(
      (record: { deduplicationKey: string }) => record.deduplicationKey === failedKey);
    assert.equal(failed.status, "failed");
    assert.equal(failed.attempts, 3);
    assert.equal(failed.error, "webhook_http_503");
    assert.ok(failed.lastAttemptAt);

    // Both original processes stop. A completely new process must read the
    // same statuses, dedupe keys and cooldowns, without any shared JS memory.
    const historyBeforeRestart = await request(workers[0]!, "/status");
    await Promise.all(workers.map((worker) => stopWorker(worker)));
    workers.push(await startWorker(database.schema, receiverUrl));
    const restarted = workers.at(-1)!;
    assert.deepEqual(await request(restarted, "/status"), historyBeforeRestart);
    await request(restarted, "/dispatch", { key });
    await request(restarted, "/dispatch", { key: failedKey, name: "fail" });
    assert.equal(received.get(key), 1);
    assert.equal(received.get(failedKey), 3, "Terminal failures also cannot restart a retry storm");
    assert.equal((await request(restarted, "/test", {})).error, "test_cooldown");
    await request(restarted, "/worker", {});
    assert.equal(received.get(operational.rows[0].deduplication_key), 1);

    // The 60-second gate can open again using DB time, without sleeping.
    await pool.query(`UPDATE operational_alert_cooldowns
      SET reserved_at = clock_timestamp() - interval '61 seconds' WHERE key = 'manual-test'`);
    assert.equal((await request(restarted, "/test", {})).delivery.status, "delivered");

    const crashKey = randomUUID();
    const pendingRequest = request(restarted, "/dispatch", { key: crashKey, name: "crash" }).catch(() => null);
    await Promise.race([crashArrived, new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Crash receiver timed out")), 5_000).unref())]);
    assert.equal((await request(restarted, "/status")).pendingDeliveries, 1);
    await stopWorker(restarted, true);
    await pendingRequest;
    workers.push(await startWorker(database.schema, receiverUrl));
    const afterCrash = workers.at(-1)!;
    // Simulate elapsed lease time; no minute-long wall-clock wait in CI.
    await pool.query(`UPDATE operational_alert_deliveries
      SET lease_until = clock_timestamp() - interval '1 second' WHERE deduplication_key = $1`, [crashKey]);
    const interrupted = (await request(afterCrash, "/dashboard")).alertDelivery;
    assert.equal(interrupted.pendingDeliveries, 0);
    const crashed = interrupted.recent.find((record: { deduplicationKey: string }) =>
      record.deduplicationKey === crashKey);
    assert.equal(crashed.status, "failed");
    assert.equal(crashed.error, "delivery_interrupted");
    await request(afterCrash, "/dispatch", { key: crashKey, name: "crash" });
    assert.equal(received.get(crashKey), 1, "An ambiguous interrupted send is not replayed");

    // Old deduplication entries survive beyond the dashboard's 100-row window.
    await pool.query(`UPDATE operational_alert_deliveries
      SET created_at = clock_timestamp() - interval '1 day' WHERE deduplication_key = $1`, [key]);
    await pool.query(`INSERT INTO operational_alert_deliveries
      (deduplication_key, alert_name, status, owner, lease_until)
      SELECT 'history-' || n, 'local history', 'disabled', 'test', clock_timestamp()
      FROM generate_series(1, 101) n`);
    assert.equal((await request(afterCrash, "/status")).recent.length, 20);
    await request(afterCrash, "/dispatch", { key });
    assert.equal(received.get(key), 1, "Truncating dashboard history must not discard dedupe keys");
  } finally {
    await Promise.all(workers.map((worker) => stopWorker(worker)));
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await database.cleanup();
  }
}

if (process.env.ALERT_DELIVERY_TEST_WORKER === "1") await runWorker();
else await runTests();
