import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Request } from "express";
import app from "../src/app";
import {
  getRateLimitClientAddress,
  getRateLimitPolicy,
  rateLimitPolicies,
  resetRateLimitStoreForTests,
} from "../src/middlewares/rateLimit";

resetRateLimitStoreForTests();
process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS = "1";

assert.equal(rateLimitPolicies.health.max, 120);
assert.equal(rateLimitPolicies.ingress.max, 300);
assert.equal(rateLimitPolicies.publicRead.max, 60);
assert.equal(rateLimitPolicies.authSensitive.max, 30);
assert.equal(rateLimitPolicies.write.max, 20);

assert.equal(
  getRateLimitPolicy({
    method: "GET",
    baseUrl: "/api",
    path: "/programs",
  } as Request).name,
  "public-read",
);
assert.equal(
  getRateLimitPolicy({
    method: "POST",
    baseUrl: "/api",
    path: "/does-not-exist",
  } as Request).name,
  "write",
);

assert.equal(
  getRateLimitClientAddress({
    headers: {
      "x-forwarded-for":
        "attacker-controlled-1, attacker-controlled-2, 198.51.100.7",
    },
    socket: { remoteAddress: "127.0.0.1" },
  } as Request),
  "198.51.100.7",
);
process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS = "0";
assert.equal(
  getRateLimitClientAddress({
    headers: { "x-forwarded-for": "198.51.100.8" },
    socket: { remoteAddress: "127.0.0.1" },
  } as Request),
  "127.0.0.1",
);
process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS = "1";
assert.equal(
  getRateLimitClientAddress({
    headers: { "x-forwarded-for": "not-an-ip" },
    socket: { remoteAddress: "127.0.0.1" },
  } as Request),
  "127.0.0.1",
);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const port = (server.address() as AddressInfo).port;
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const normalResponse = await fetch(`${baseUrl}/api/does-not-exist`, {
    headers: { "x-forwarded-for": "198.51.100.20" },
  });
  assert.equal(normalResponse.status, 404);
  assert.equal(
    normalResponse.headers.get("ratelimit-limit"),
    String(rateLimitPolicies.authSensitive.max),
  );
  assert.equal(
    normalResponse.headers.get("ratelimit-remaining"),
    String(rateLimitPolicies.authSensitive.max - 1),
  );

  let burstResponse: Response | undefined;
  for (let index = 0; index <= rateLimitPolicies.authSensitive.max; index += 1) {
    burstResponse = await fetch(`${baseUrl}/api/does-not-exist`, {
      headers: {
        "x-forwarded-for": `spoof-${index}, 198.51.100.30`,
      },
    });
  }

  assert.equal(burstResponse?.status, 429);
  assert.equal(burstResponse?.headers.get("ratelimit-remaining"), "0");
  assert.ok(Number(burstResponse?.headers.get("retry-after")) >= 1);
  assert.deepEqual(await burstResponse?.json(), {
    error: "Terlalu banyak permintaan. Coba lagi nanti.",
    code: "RATE_LIMITED",
    retryAfterSeconds: Number(burstResponse?.headers.get("retry-after")),
  });

  let writeBurstResponse: Response | undefined;
  for (let index = 0; index <= rateLimitPolicies.write.max; index += 1) {
    writeBurstResponse = await fetch(`${baseUrl}/api/does-not-exist`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.40",
      },
      body: "{}",
    });
  }
  assert.equal(writeBurstResponse?.status, 429);
  assert.equal(
    writeBurstResponse?.headers.get("ratelimit-limit"),
    String(rateLimitPolicies.write.max),
  );
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  resetRateLimitStoreForTests();
}