import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { rm } from "node:fs/promises";

process.env.NODE_ENV = "test";
// Never send real on-call messages from regression suites. Individual delivery
// tests opt into a local receiver or stub the Slack connector.
process.env.ON_CALL_CHANNEL = "webhook";
delete process.env.ON_CALL_WEBHOOK_URL;
delete process.env.ON_CALL_SLACK_CHANNEL_ID;

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(artifactDir, ".test-dist");

const requestedTests = process.argv
  .slice(2)
  .filter((argument) => argument !== "--");
const testFiles = requestedTests.length
  ? requestedTests
  : [
      "rate-limit.integration",
      "rate-limit-multi-instance.integration",
      "member-journey.integration",
      "member-program-enrollment.integration",
      "production-readiness.integration",
      "admin-contract.integration",
      "company-security.integration",
      "pilot-evaluation.integration",
      "settlement-reconciliation.integration",
      "settlement-ingest-failures.integration",
      "verification-sla-reminder.integration",
      "consent-expiry-reminder.integration",
      "observability.integration",
    ];

try {
  await rm(outDir, { recursive: true, force: true });
  for (const testFile of testFiles) {
    await build({
      entryPoints: [path.resolve(artifactDir, `tests/${testFile}.ts`)],
      platform: "node",
      bundle: true,
      format: "esm",
      outfile: path.resolve(outDir, `${testFile}.mjs`),
      external: [
        "*.node",
        "pg-native",
        "pino",
        "pino-http",
        "pino-pretty",
        "thread-stream",
      ],
      logLevel: "warning",
      banner: {
        js: `import { createRequire as __createRequire } from "node:module";
import __path from "node:path";
import __url from "node:url";
globalThis.require = __createRequire(import.meta.url);
globalThis.__filename = __url.fileURLToPath(import.meta.url);
globalThis.__dirname = __path.dirname(globalThis.__filename);`,
      },
    });
    await import(path.resolve(outDir, `${testFile}.mjs`));
  }
} finally {
  await rm(outDir, { recursive: true, force: true });
}
