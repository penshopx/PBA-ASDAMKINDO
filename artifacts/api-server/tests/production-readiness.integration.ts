import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { apiRateLimitBucketsTable, db } from "@workspace/db";
import apiRouter from "../src/routes";

function createTestApp() {
  const testApp = express();
  testApp.set("trust proxy", 1);
  testApp.use(express.json());
  testApp.use("/api", apiRouter);
  testApp.use((_req, res) => {
    res.status(404).json({ error: "Endpoint tidak ditemukan." });
  });
  return testApp;
}

const server = createTestApp().listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const port = (server.address() as AddressInfo).port;
const baseUrl = `http://127.0.0.1:${port}`;
const secondServer = createTestApp().listen(0);
await new Promise<void>((resolve) => secondServer.once("listening", resolve));
const secondPort = (secondServer.address() as AddressInfo).port;
const secondBaseUrl = `http://127.0.0.1:${secondPort}`;
const publicIp = "198.51.100.40";
const otherPublicIp = "198.51.100.41";
const testBucketKeys = [
  `public-programs:${publicIp}`,
  `public-programs:${otherPublicIp}`,
];

try {
  await db
    .delete(apiRateLimitBucketsTable)
    .where(inArray(apiRateLimitBucketsTable.key, testBucketKeys));

  const healthResponse = await fetch(`${baseUrl}/api/healthz`, {
    headers: { origin: "https://untrusted.example" },
  });
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { status: "ok" });
  assert.equal(healthResponse.headers.get("access-control-allow-origin"), null);
  assert.equal(healthResponse.headers.get("access-control-allow-credentials"), null);

  const missingResponse = await fetch(`${baseUrl}/api/does-not-exist`);
  assert.equal(missingResponse.status, 404);
  assert.deepEqual(await missingResponse.json(), {
    error: "Endpoint tidak ditemukan.",
  });

  const limitedResponses = await Promise.all(
    Array.from({ length: 61 }, (_, index) =>
      fetch(`${index % 2 === 0 ? baseUrl : secondBaseUrl}/api/programs`, {
        headers: { "x-forwarded-for": publicIp },
      }),
    ),
  );
  const rateLimited = limitedResponses.filter((response) => response.status === 429);
  assert.equal(rateLimited.length, 1);
  assert.equal(rateLimited[0]!.headers.get("ratelimit-limit"), "60");
  assert.equal(rateLimited[0]!.headers.get("ratelimit-remaining"), "0");
  assert.ok(Number(rateLimited[0]!.headers.get("retry-after")) >= 1);
  assert.deepEqual(await rateLimited[0]!.json(), {
    error: "Terlalu banyak permintaan. Coba lagi setelah beberapa saat.",
  });
  const [sharedBucket] = await db
    .select({ count: apiRateLimitBucketsTable.count })
    .from(apiRateLimitBucketsTable)
    .where(eq(apiRateLimitBucketsTable.key, `public-programs:${publicIp}`))
    .limit(1);
  assert.equal(sharedBucket?.count, 61);

  const expiredAt = new Date(Date.now() - 2 * 60_000);
  await db.insert(apiRateLimitBucketsTable).values({
    key: `public-programs:${otherPublicIp}`,
    windowStartedAt: expiredAt,
    count: 60,
    updatedAt: expiredAt,
  });
  const otherIpResponse = await fetch(`${baseUrl}/api/programs`, {
    headers: { "x-forwarded-for": otherPublicIp },
  });
  assert.notEqual(otherIpResponse.status, 429);
  assert.equal(otherIpResponse.headers.get("ratelimit-remaining"), "59");
  const [resetBucket] = await db
    .select({
      count: apiRateLimitBucketsTable.count,
      windowStartedAt: apiRateLimitBucketsTable.windowStartedAt,
    })
    .from(apiRateLimitBucketsTable)
    .where(eq(apiRateLimitBucketsTable.key, `public-programs:${otherPublicIp}`))
    .limit(1);
  assert.equal(resetBucket?.count, 1);
  assert.ok((resetBucket?.windowStartedAt.getTime() ?? 0) > expiredAt.getTime());

  const authenticatedRouteResponse = await fetch(`${baseUrl}/api/me`, {
    headers: { "x-forwarded-for": publicIp },
  });
  assert.notEqual(authenticatedRouteResponse.status, 429);
} finally {
  await db
    .delete(apiRateLimitBucketsTable)
    .where(inArray(apiRateLimitBucketsTable.key, testBucketKeys));
  await Promise.all(
    [server, secondServer].map(
      (runningServer) =>
        new Promise<void>((resolve, reject) =>
          runningServer.close((err) => (err ? reject(err) : resolve())),
        ),
    ),
  );
}