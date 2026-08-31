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
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
}