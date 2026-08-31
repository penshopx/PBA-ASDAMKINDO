import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { eq, like } from "drizzle-orm";
import { auditLogsTable, db, memberProfilesTable, notificationsTable, talentConsentSettingsTable, usersTable } from "@workspace/db";

const cwd = new URL("..", import.meta.url).pathname;
const firstRun = "pilot-20260901-abcd1234";
const adjacentRun = "pilot-20260901-abcd1235";
const interactiveUserId = "user_pilotcleanupabcd1234";
const interactiveProfileId = "pilot-cleanup-profile-abcd1234";
const consentSettingsId = "pilot-cleanup-consent-settings-abcd1234";
const safetyFlags = ["--target", "development", "--allow-pilot-data", "--confirm-pilot"];

function invoke(
  command: "seed" | "reset",
  runId: string,
  options: { env?: NodeJS.ProcessEnv; expectSuccess?: boolean } = {},
) {
  const result = spawnSync(
    "pnpm",
    ["exec", "tsx", "./src/pilot-data.ts", command, "--run-id", runId, ...safetyFlags],
    {
      cwd,
      env: { ...process.env, ...options.env },
      encoding: "utf8",
    },
  );
  if (options.expectSuccess === false) {
    assert.notEqual(result.status, 0, `expected refusal but command succeeded: ${result.stdout}`);
  } else {
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  return `${result.stdout}\n${result.stderr}`;
}

function invokeCleanup(userId: string) {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "tsx",
      "./src/pilot-data.ts",
      "cleanup-user",
      "--user-id",
      userId,
      ...safetyFlags,
      "--confirm-delete-test-user",
    ],
    { cwd, env: process.env, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

try {
  const nestedRunOutput = invoke("seed", `${firstRun}-nested`, { expectSuccess: false });
  assert.match(nestedRunOutput, /fixed-length run ID/);

  const mismatchedDatabaseOutput = invoke("seed", firstRun, {
    expectSuccess: false,
    env: { DATABASE_URL: "postgresql://pilot:pilot@production.invalid:5432/prod" },
  });
  assert.match(mismatchedDatabaseOutput, /does not match the platform development database identity/);

  invoke("seed", firstRun);
  invoke("seed", adjacentRun);
  invoke("reset", firstRun);

  const adjacentUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(like(usersTable.id, `${adjacentRun}-%`));
  assert.equal(adjacentUsers.length, 4, "reset of one run must not remove an adjacent run");

  await db.insert(usersTable).values({
    id: interactiveUserId,
    clerkUserId: interactiveUserId,
    name: "Interactive Pilot Cleanup",
    email: "interactive-cleanup@example.test",
    role: "member",
    onboardingComplete: true,
  });
  await db.insert(memberProfilesTable).values({
    id: interactiveProfileId,
    userId: interactiveUserId,
    dataConsent: true,
  });
  await db.insert(notificationsTable).values({
    id: "pilot-cleanup-notification-abcd1234",
    userId: interactiveUserId,
    title: "Cleanup test",
    description: "Fictional integration fixture.",
    type: "system",
  });
  await db.insert(auditLogsTable).values({
    id: "pilot-cleanup-audit-abcd1234",
    actorRole: "system",
    action: "pilot.cleanup.test",
    entityType: "member_profile",
    entityId: interactiveProfileId,
  });
  await db.insert(talentConsentSettingsTable).values({
    id: consentSettingsId,
    defaultDurationDays: 30,
    updatedBy: interactiveUserId,
  });
  invokeCleanup(interactiveUserId);
  const [remainingInteractiveUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, interactiveUserId))
    .limit(1);
  const [remainingInteractiveAudit] = await db
    .select({ id: auditLogsTable.id })
    .from(auditLogsTable)
    .where(eq(auditLogsTable.entityId, interactiveProfileId))
    .limit(1);
  assert.equal(remainingInteractiveUser, undefined);
  assert.equal(remainingInteractiveAudit, undefined);
  const [preservedConsentSettings] = await db
    .select()
    .from(talentConsentSettingsTable)
    .where(eq(talentConsentSettingsTable.id, consentSettingsId))
    .limit(1);
  assert.equal(preservedConsentSettings.updatedBy, null);
  await db.delete(talentConsentSettingsTable).where(eq(talentConsentSettingsTable.id, consentSettingsId));

  invoke("reset", adjacentRun);
  const remainingUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(like(usersTable.id, "pilot-20260901-abcd123%"));
  assert.equal(remainingUsers.length, 0);

  console.log("pilot data safety integration tests passed");
} finally {
  await db.delete(talentConsentSettingsTable).where(eq(talentConsentSettingsTable.id, consentSettingsId));
  const [interactiveUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, interactiveUserId))
    .limit(1);
  if (interactiveUser) invokeCleanup(interactiveUserId);
  invoke("reset", firstRun);
  invoke("reset", adjacentRun);
}