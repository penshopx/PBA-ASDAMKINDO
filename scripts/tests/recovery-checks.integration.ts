import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { auditLogsTable, db, pool, usersTable, verificationsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { recoveryChecks } from "../src/recovery-checks";

const rollback = new Error("ROLLBACK_RECOVERY_CHECK_TEST");
const suffix = randomUUID();
const userId = `recovery-check-${suffix}`;
const subjectId = `document-${suffix}`;

const verificationCheck = recoveryChecks.find((check) => check.name === "verification subjects missing or unsupported");
const auditCheck = recoveryChecks.find((check) => check.name === "mapped audit entities without source records");
assert.ok(verificationCheck);
assert.ok(auditCheck);

try {
  await db.transaction(async (tx) => {
    const baselineVerification = await tx.execute(sql.raw(verificationCheck.sql));
    const baselineAudit = await tx.execute(sql.raw(auditCheck.sql));
    const verificationViolations = Number(baselineVerification.rows[0]?.violations);
    const auditViolations = Number(baselineAudit.rows[0]?.violations);

    await tx.insert(usersTable).values({
      id: userId,
      clerkUserId: userId,
      name: "Recovery Check",
      email: `recovery-${suffix}@example.test`,
      role: "member",
    });
    await tx.insert(verificationsTable).values({
      id: `verification-${suffix}`,
      subjectType: "document",
      subjectId,
      subjectName: "Dokumen eksternal legacy",
      evidenceType: "document",
      status: "pending",
      submittedByUserId: userId,
    });
    await tx.insert(auditLogsTable).values({
      id: `audit-${suffix}`,
      actorUserId: userId,
      actorRole: "member",
      action: "verification.submitted",
      entityType: "document",
      entityId: subjectId,
    });

    const validVerification = await tx.execute(sql.raw(verificationCheck.sql));
    const validAudit = await tx.execute(sql.raw(auditCheck.sql));
    assert.equal(Number(validVerification.rows[0]?.violations), verificationViolations);
    assert.equal(Number(validAudit.rows[0]?.violations), auditViolations);

    await tx.delete(auditLogsTable).where(sql`${auditLogsTable.id} = ${`audit-${suffix}`}`);
    const brokenAudit = await tx.execute(sql.raw(auditCheck.sql));
    assert.equal(Number(brokenAudit.rows[0]?.violations), auditViolations);

    await tx.insert(auditLogsTable).values({
      id: `audit-broken-${suffix}`,
      actorUserId: userId,
      actorRole: "member",
      action: "verification.submitted",
      entityType: "document",
      entityId: `missing-${suffix}`,
    });
    const orphanAudit = await tx.execute(sql.raw(auditCheck.sql));
    assert.equal(Number(orphanAudit.rows[0]?.violations), auditViolations + 1);
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await pool.end();
}

console.log("Recovery checks integration test passed.");