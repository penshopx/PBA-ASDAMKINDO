import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import app from "../src/app";

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const port = (server.address() as AddressInfo).port;
const baseUrl = `http://127.0.0.1:${port}`;

try {
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

  const publicIp = "198.51.100.40";
  const limitedResponses = await Promise.all(
    Array.from({ length: 61 }, () =>
      fetch(`${baseUrl}/api/programs`, {
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

  const otherIpResponse = await fetch(`${baseUrl}/api/programs`, {
    headers: { "x-forwarded-for": "198.51.100.41" },
  });
  assert.notEqual(otherIpResponse.status, 429);

  const authenticatedRouteResponse = await fetch(`${baseUrl}/api/me`, {
    headers: { "x-forwarded-for": publicIp },
  });
  assert.notEqual(authenticatedRouteResponse.status, 429);
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
}