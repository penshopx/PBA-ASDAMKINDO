import assert from "node:assert/strict";
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { eq, inArray } from "drizzle-orm";
import { apiRateLimitBucketsTable, db } from "@workspace/db";
import app from "../src/app";

const workerMode = process.env.RATE_LIMIT_MULTI_INSTANCE_WORKER === "1";

async function runWorker(): Promise<void> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Rate limit test worker did not bind a TCP port.");
  }
  process.send?.({ port: address.port });
  process.on("message", (message) => {
    if (message !== "shutdown") return;
    server.close((err) => {
      process.exit(err ? 1 : 0);
    });
  });
}

function startWorker(): Promise<{ child: ChildProcess; port: number }> {
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(import.meta.url), [], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        RATE_LIMIT_MULTI_INSTANCE_WORKER: "1",
      },
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Timed out starting rate limit test worker."));
    }, 15_000);
    child.once("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.once("exit", (code) => {
      if (code === 0) return;
      clearTimeout(timeout);
      reject(new Error(`Rate limit test worker exited with code ${code}.`));
    });
    child.once("message", (message) => {
      if (
        !message ||
        typeof message !== "object" ||
        !("port" in message) ||
        typeof message.port !== "number"
      ) {
        return;
      }
      clearTimeout(timeout);
      resolve({ child, port: message.port });
    });
  });
}

async function stopWorker(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((resolve, reject) => {
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Rate limit test worker exited with code ${code}.`)),
    );
  });
  child.send("shutdown");
  await exited;
}

async function runMultiInstanceTest(): Promise<void> {
  const clientIp = "198.51.100.70";
  const testBucketKeys = [
    `ingress:ip:${clientIp}`,
    `public-read:ip:${clientIp}`,
  ];
  await db
    .delete(apiRateLimitBucketsTable)
    .where(inArray(apiRateLimitBucketsTable.key, testBucketKeys));

  const workers = await Promise.all([startWorker(), startWorker()]);
  try {
    const responses = await Promise.all(
      Array.from({ length: 61 }, (_, index) =>
        fetch(
          `http://127.0.0.1:${workers[index % workers.length]!.port}/api/programs`,
          { headers: { "x-forwarded-for": clientIp } },
        ),
      ),
    );
    assert.equal(
      responses.filter((response) => response.status === 429).length,
      1,
    );
    const [sharedBucket] = await db
      .select({ count: apiRateLimitBucketsTable.count })
      .from(apiRateLimitBucketsTable)
      .where(
        eq(apiRateLimitBucketsTable.key, `public-read:ip:${clientIp}`),
      )
      .limit(1);
    assert.equal(sharedBucket?.count, 61);
  } finally {
    await Promise.all(workers.map(({ child }) => stopWorker(child)));
    await db
      .delete(apiRateLimitBucketsTable)
      .where(inArray(apiRateLimitBucketsTable.key, testBucketKeys));
  }
}

if (workerMode) {
  await runWorker();
} else {
  await runMultiInstanceTest();
}