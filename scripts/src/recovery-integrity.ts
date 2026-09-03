import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { pool } from "@workspace/db";
import { recoveryChecks } from "./recovery-checks";

type CheckResult = {
  name: string;
  severity: "critical" | "warning";
  violations: number;
};

const args = process.argv.slice(2);

function valueAfter(flag: string) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function refuse(message: string): never {
  console.error(`Recovery integrity tool refused: ${message}`);
  process.exit(1);
}

function assertIsolatedRestore() {
  if (valueAfter("--target") !== "isolated-restore") {
    refuse("pass --target isolated-restore.");
  }
  if (!args.includes("--confirm-isolated-restore")) {
    refuse("pass --confirm-isolated-restore.");
  }
  if (process.env.RECOVERY_DRILL_ISOLATED !== "true") {
    refuse("RECOVERY_DRILL_ISOLATED must be exactly true.");
  }
  if (
    process.env.REPLIT_DEPLOYMENT ||
    process.env.REPLIT_DEPLOYMENT_ID ||
    process.env.REPLIT_DEPLOYMENT_URL ||
    process.env.NODE_ENV?.toLowerCase() === "production"
  ) {
    refuse("deployment and production environments are never permitted.");
  }
  if (!process.env.DATABASE_URL) refuse("DATABASE_URL is required.");

  const drillId = valueAfter("--drill-id");
  const backupId = valueAfter("--backup-id");
  if (!drillId || !/^[a-z0-9][a-z0-9_-]{5,80}$/i.test(drillId)) {
    refuse("provide a non-sensitive --drill-id (6-81 letters, digits, _ or -).");
  }
  if (!backupId || !/^[a-z0-9][a-z0-9_.:-]{5,120}$/i.test(backupId)) {
    refuse("provide the platform backup/PITR identifier with --backup-id.");
  }
}

type RestoreAttestation = {
  drillId: string;
  backupId: string;
  target: "isolated-restore";
  databaseUrlSha256: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
};

function attestationPayload(attestation: Omit<RestoreAttestation, "signature">) {
  return [
    attestation.drillId,
    attestation.backupId,
    attestation.target,
    attestation.databaseUrlSha256,
    attestation.issuedAt,
    attestation.expiresAt,
  ].join("\n");
}

async function verifyExternalAttestation(drillId: string, backupId: string) {
  const path = valueAfter("--attestation");
  const key = process.env.RECOVERY_ATTESTATION_HMAC_KEY;
  if (!path) refuse("provide a signed --attestation JSON file.");
  if (!key || key.length < 32) refuse("RECOVERY_ATTESTATION_HMAC_KEY must contain at least 32 characters.");

  const parsed = JSON.parse(await readFile(resolve(path), "utf8")) as RestoreAttestation;
  if (
    parsed.drillId !== drillId ||
    parsed.backupId !== backupId ||
    parsed.target !== "isolated-restore" ||
    !/^[a-f0-9]{64}$/.test(parsed.databaseUrlSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(parsed.signature ?? "")
  ) {
    refuse("restore attestation is malformed or does not match this drill and backup.");
  }
  const issuedAt = Date.parse(parsed.issuedAt);
  const expiresAt = Date.parse(parsed.expiresAt);
  const now = Date.now();
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    issuedAt > now + 5 * 60_000 ||
    expiresAt <= now ||
    expiresAt - issuedAt > 24 * 60 * 60_000
  ) {
    refuse("restore attestation is expired, future-dated, or valid for longer than 24 hours.");
  }

  const { signature, ...unsigned } = parsed;
  const expectedSignature = createHmac("sha256", key).update(attestationPayload(unsigned)).digest();
  const suppliedSignature = Buffer.from(signature, "hex");
  if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) {
    refuse("restore attestation signature is invalid.");
  }

  const actualUrlHash = createHash("sha256").update(process.env.DATABASE_URL!).digest("hex");
  if (actualUrlHash !== parsed.databaseUrlSha256) {
    refuse("DATABASE_URL is not the restore-only endpoint approved by the signed attestation.");
  }
}

const countTables = [
  "users",
  "member_profiles",
  "company_profiles",
  "professional_passports",
  "passport_consents",
  "company_talent_consents",
  "talent_consent_settings",
  "readiness_diagnostics",
  "member_evidence",
  "programs",
  "enrollments",
  "program_progress",
  "company_requirements",
  "verifications",
  "matchings",
  "transactions",
  "notifications",
  "audit_logs",
  "settlement_ingest_failures",
] as const;

type ForeignKey = {
  constraint_name: string;
  child_table: string;
  parent_table: string;
  child_columns: string[];
  parent_columns: string[];
};

function quoteIdentifier(identifier: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe database identifier in restored schema: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function validateForeignKeys(): Promise<CheckResult[]> {
  const metadata = await pool.query<ForeignKey>(
    `SELECT c.conname AS constraint_name,
            child.relname AS child_table,
            parent.relname AS parent_table,
            array_agg(child_column.attname ORDER BY key_position.ordinality) AS child_columns,
            array_agg(parent_column.attname ORDER BY key_position.ordinality) AS parent_columns
       FROM pg_constraint c
       JOIN pg_class child ON child.oid = c.conrelid
       JOIN pg_namespace namespace ON namespace.oid = child.relnamespace
       JOIN pg_class parent ON parent.oid = c.confrelid
       JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY
         AS key_position(child_number, parent_number, ordinality) ON true
       JOIN pg_attribute child_column
         ON child_column.attrelid = child.oid AND child_column.attnum = key_position.child_number
       JOIN pg_attribute parent_column
         ON parent_column.attrelid = parent.oid AND parent_column.attnum = key_position.parent_number
      WHERE c.contype = 'f' AND namespace.nspname = 'public'
      GROUP BY c.conname, child.relname, parent.relname
      ORDER BY child.relname, c.conname`,
  );

  return Promise.all(
    metadata.rows.map(async (foreignKey) => {
      const childTable = quoteIdentifier(foreignKey.child_table);
      const parentTable = quoteIdentifier(foreignKey.parent_table);
      const joins = foreignKey.child_columns.map(
        (column, index) =>
          `p.${quoteIdentifier(foreignKey.parent_columns[index]!)} = c.${quoteIdentifier(column)}`,
      );
      const populated = foreignKey.child_columns.map((column) => `c.${quoteIdentifier(column)} IS NOT NULL`);
      const missingParent = `p.${quoteIdentifier(foreignKey.parent_columns[0]!)} IS NULL`;
      const result = await pool.query<{ violations: number }>(
        `SELECT count(*)::int AS violations FROM ${childTable} c LEFT JOIN ${parentTable} p ON ${joins.join(" AND ")} WHERE ${populated.join(" AND ")} AND ${missingParent}`,
      );
      return {
        name: `foreign key ${foreignKey.constraint_name} (${foreignKey.child_table} -> ${foreignKey.parent_table})`,
        severity: "critical" as const,
        violations: result.rows[0]?.violations ?? 0,
      };
    }),
  );
}

async function validateErasureLedger() {
  const ledgerPath = valueAfter("--erasure-ledger");
  const key = process.env.RECOVERY_ERASURE_HMAC_KEY;
  if (!ledgerPath) refuse("provide the authoritative --erasure-ledger JSON file.");
  if (!key || key.length < 32) refuse("RECOVERY_ERASURE_HMAC_KEY must contain at least 32 characters.");

  const parsed = JSON.parse(await readFile(resolve(ledgerPath), "utf8")) as unknown;
  if (
    !Array.isArray(parsed) ||
    parsed.some(
      (entry) =>
        typeof entry !== "object" ||
        entry === null ||
        !("subjectHash" in entry) ||
        typeof entry.subjectHash !== "string" ||
        !/^[a-f0-9]{64}$/.test(entry.subjectHash),
    )
  ) {
    refuse("erasure ledger must be an array of objects with a 64-character lowercase subjectHash.");
  }

  const erased = new Set(parsed.map((entry) => (entry as { subjectHash: string }).subjectHash));
  const users = await pool.query<{ clerk_user_id: string }>(`SELECT clerk_user_id FROM users`);
  const violations = users.rows.filter((user) =>
    erased.has(createHmac("sha256", key).update(user.clerk_user_id).digest("hex")),
  ).length;
  return { name: "erased identities reintroduced by restore", severity: "critical" as const, violations };
}

async function main() {
  assertIsolatedRestore();
  const drillId = valueAfter("--drill-id")!;
  const backupId = valueAfter("--backup-id")!;
  await verifyExternalAttestation(drillId, backupId);
  const outputArgument = valueAfter("--output");
  const outputPath = resolve(outputArgument ?? `recovery-evidence/${drillId}.json`);

  const identityResult = await pool.query<{ database: string; server: string }>(
    `SELECT current_database() AS database, inet_server_addr()::text AS server`,
  );
  const identity = identityResult.rows[0];
  const databaseFingerprint = createHash("sha256")
    .update(`${identity.database}@${identity.server}`)
    .digest("hex")
    .slice(0, 16);

  const counts = Object.fromEntries(
    await Promise.all(
      countTables.map(async (table) => {
        const result = await pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`);
        return [table, result.rows[0]?.count ?? 0] as const;
      }),
    ),
  );

  const domainResults = await Promise.all(
    recoveryChecks.map(async (check): Promise<CheckResult> => {
      const result = await pool.query<{ violations: number }>(check.sql);
      return { name: check.name, severity: check.severity, violations: result.rows[0]?.violations ?? 0 };
    }),
  );
  const results = [...(await validateForeignKeys()), ...domainResults, await validateErasureLedger()];

  const report = {
    schemaVersion: 1,
    drillId,
    backupId,
    generatedAt: new Date().toISOString(),
    target: "isolated-restore",
    databaseFingerprint,
    counts,
    checks: results,
    passed: results.every((result) => result.severity !== "critical" || result.violations === 0),
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ outputPath, passed: report.passed, counts, checks: results }, null, 2));
  if (!report.passed) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });