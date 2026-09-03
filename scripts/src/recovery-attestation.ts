import { createHash, createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

const args = process.argv.slice(2);

function valueAfter(flag: string) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function fail(message: string): never {
  console.error(`Recovery attestation tool refused: ${message}`);
  process.exit(1);
}

const drillId = valueAfter("--drill-id");
const backupId = valueAfter("--backup-id");
const output = valueAfter("--output");
const restoreUrl = process.env.RECOVERY_RESTORE_DATABASE_URL;
const key = process.env.RECOVERY_ATTESTATION_HMAC_KEY;

if (!drillId || !/^[a-z0-9][a-z0-9_-]{5,80}$/i.test(drillId)) fail("provide a valid --drill-id.");
if (!backupId || !/^[a-z0-9][a-z0-9_.:-]{5,120}$/i.test(backupId)) fail("provide a valid --backup-id.");
if (!output) fail("provide --output.");
if (!restoreUrl) fail("RECOVERY_RESTORE_DATABASE_URL is required.");
if (!key || key.length < 32) fail("RECOVERY_ATTESTATION_HMAC_KEY must contain at least 32 characters.");
if (!args.includes("--security-owner-approved")) fail("pass --security-owner-approved after independently checking the restore target.");

try {
  new URL(restoreUrl);
} catch {
  fail("RECOVERY_RESTORE_DATABASE_URL is invalid.");
}

const issuedAt = new Date();
const expiresAt = new Date(issuedAt.getTime() + 24 * 60 * 60_000);
const unsigned = {
  drillId,
  backupId,
  target: "isolated-restore" as const,
  databaseUrlSha256: createHash("sha256").update(restoreUrl).digest("hex"),
  issuedAt: issuedAt.toISOString(),
  expiresAt: expiresAt.toISOString(),
};
const payload = [
  unsigned.drillId,
  unsigned.backupId,
  unsigned.target,
  unsigned.databaseUrlSha256,
  unsigned.issuedAt,
  unsigned.expiresAt,
].join("\n");
const attestation = {
  ...unsigned,
  signature: createHmac("sha256", key).update(payload).digest("hex"),
};

const outputPath = resolve(output);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(attestation, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ outputPath, drillId, backupId, expiresAt: unsigned.expiresAt }, null, 2));