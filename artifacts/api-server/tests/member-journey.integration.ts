import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express, { type NextFunction, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  auditLogsTable,
  companyProfilesTable,
  db,
  memberEvidenceTable,
  memberProfilesTable,
  readinessDiagnosticsTable,
  usersTable,
  verificationsTable,
  type User,
} from "@workspace/db";
import type { AuthenticatedRequest } from "../src/lib/auth";
import adminRouter from "../src/routes/admin";
import identityRouter from "../src/routes/identity";
import memberJourneyRouter from "../src/routes/member-journey";

const suffix = randomUUID();
const memberId = `test-member-${suffix}`;
const adminId = `test-admin-${suffix}`;
const raceId = `test-race-${suffix}`;
const evidenceKey = `evidence-${suffix}`;
let actor: User;

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  const authenticated = req as AuthenticatedRequest;
  authenticated.userId = actor.id;
  authenticated.currentUser = actor;
  next();
});
app.use("/api", identityRouter, memberJourneyRouter, adminRouter);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const port = (server.address() as AddressInfo).port;
const baseUrl = `http://127.0.0.1:${port}/api`;

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await response.json();
  return { response, body };
}

async function loadUser(id: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  assert.ok(user);
  return user;
}

const memberOnboarding = {
  fullName: "Member Integration",
  phone: "081234567890",
  domicile: "Jakarta",
  education: "S1 Teknik Sipil",
  expertise: "Manajemen proyek",
  experienceYears: 5,
  primaryGoal: "competency",
  dataConsent: true,
};
const companyOnboarding = {
  companyName: "PT Integration",
  companyType: "Kontraktor",
  phone: "02155555555",
  businessEmail: `company-${suffix}@example.test`,
  address: "Jakarta",
  picName: "PIC Integration",
  picTitle: "Manager",
  primaryNeed: "talent",
};

try {
  await db.insert(usersTable).values([
    {
      id: memberId,
      clerkUserId: memberId,
      name: "Member Integration",
      email: `${memberId}@example.test`,
    },
    {
      id: adminId,
      clerkUserId: adminId,
      name: "Admin Integration",
      email: `${adminId}@example.test`,
      role: "admin",
      onboardingComplete: true,
    },
    {
      id: raceId,
      clerkUserId: raceId,
      name: "Race Integration",
      email: `${raceId}@example.test`,
    },
  ]);

  actor = await loadUser(memberId);
  let result = await request("/onboarding/member", {
    method: "POST",
    body: JSON.stringify(memberOnboarding),
  });
  assert.equal(result.response.status, 200);
  actor = await loadUser(memberId);
  result = await request("/onboarding/company", {
    method: "POST",
    body: JSON.stringify(companyOnboarding),
  });
  assert.equal(result.response.status, 403);
  const memberCompanyProfiles = await db
    .select()
    .from(companyProfilesTable)
    .where(eq(companyProfilesTable.userId, memberId));
  assert.equal(memberCompanyProfiles.length, 0);
  assert.equal((await loadUser(memberId)).role, "member");

  result = await request("/member/diagnostics", {
    method: "POST",
    body: JSON.stringify({ answers: {} }),
  });
  assert.equal(result.response.status, 400);
  result = await request("/member/diagnostics", {
    method: "POST",
    body: JSON.stringify({ answers: { technical: 5, safety: 4 } }),
  });
  assert.equal(result.response.status, 400);
  const answers = { technical: 5, safety: 4, communication: 3, problemSolving: 2, evidence: 1 };
  result = await request("/member/diagnostics", {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.score, 60);

  const evidencePayload = {
    clientRequestId: evidenceKey,
    evidenceType: "project",
    title: `Evidence ${suffix}`,
    description: "Deskripsi bukti awal",
    referenceUrl: null,
    status: "submitted",
  };
  const firstCreate = await request("/member/evidence", {
    method: "POST",
    body: JSON.stringify(evidencePayload),
  });
  assert.equal(firstCreate.response.status, 201);
  const evidenceId = firstCreate.body.id as string;
  const retryCreate = await request("/member/evidence", {
    method: "POST",
    body: JSON.stringify(evidencePayload),
  });
  assert.equal(retryCreate.response.status, 201);
  assert.equal(retryCreate.body.id, evidenceId);
  const conflictingRetry = await request("/member/evidence", {
    method: "POST",
    body: JSON.stringify({ ...evidencePayload, title: "Payload berbeda" }),
  });
  assert.equal(conflictingRetry.response.status, 409);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    result = await request(`/member/evidence/${evidenceId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "submitted" }),
    });
    assert.equal(result.response.status, 200);
  }
  result = await request(`/member/evidence/${evidenceId}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "Tidak boleh berubah" }),
  });
  assert.equal(result.response.status, 409);
  result = await request(`/member/evidence/${evidenceId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "draft" }),
  });
  assert.equal(result.response.status, 409);

  const evidenceRows = await db
    .select()
    .from(memberEvidenceTable)
    .where(and(
      eq(memberEvidenceTable.memberUserId, memberId),
      eq(memberEvidenceTable.clientRequestId, evidenceKey),
    ));
  assert.equal(evidenceRows.length, 1);
  const verificationRows = await db
    .select()
    .from(verificationsTable)
    .where(and(
      eq(verificationsTable.subjectType, "competency"),
      eq(verificationsTable.subjectId, evidenceId),
    ));
  assert.equal(verificationRows.length, 1);
  const verificationId = verificationRows[0]!.id;

  result = await request(`/admin/verifications/${verificationId}/decision`, {
    method: "POST",
    body: JSON.stringify({ status: "approved", note: "Tidak diizinkan" }),
  });
  assert.equal(result.response.status, 403);

  actor = await loadUser(adminId);
  result = await request(`/admin/verifications/${verificationId}/decision`, {
    method: "POST",
    body: JSON.stringify({ status: "changes_requested", note: "Perjelas hasil proyek" }),
  });
  assert.equal(result.response.status, 200);
  result = await request(`/admin/verifications/${verificationId}/decision`, {
    method: "POST",
    body: JSON.stringify({ status: "approved", note: "Belum diajukan ulang" }),
  });
  assert.equal(result.response.status, 409);

  actor = await loadUser(memberId);
  result = await request(`/member/evidence/${evidenceId}`, {
    method: "PATCH",
    body: JSON.stringify({ description: "Deskripsi bukti yang sudah diperbaiki" }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.status, "changes_requested");
  result = await request(`/member/evidence/${evidenceId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "submitted" }),
  });
  assert.equal(result.response.status, 200);
  const [resubmittedVerification] = await db
    .select()
    .from(verificationsTable)
    .where(eq(verificationsTable.id, verificationId));
  assert.equal(resubmittedVerification?.status, "pending");
  assert.equal(resubmittedVerification?.reviewedAt, null);
  assert.equal(resubmittedVerification?.reviewNote, null);

  actor = await loadUser(adminId);
  result = await request(`/admin/verifications/${verificationId}/decision`, {
    method: "POST",
    body: JSON.stringify({ status: "approved", note: "Bukti memenuhi syarat" }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.status, "approved");
  assert.equal(result.body.slaStatus, "resolved");
  const approvalAudits = await db
    .select()
    .from(auditLogsTable)
    .where(and(
      eq(auditLogsTable.action, "verification.decision"),
      eq(auditLogsTable.entityId, evidenceId),
      eq(auditLogsTable.toStatus, "approved"),
    ));
  assert.equal(approvalAudits.length, 1);
  assert.equal(approvalAudits[0]?.fromStatus, "pending");
  assert.equal(approvalAudits[0]?.note, "Bukti memenuhi syarat");

  actor = await loadUser(memberId);
  result = await request(`/member/evidence/${evidenceId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "draft" }),
  });
  assert.equal(result.response.status, 409);
  const journeyFirst = await request("/member/journey");
  const journeyAfterRefresh = await request("/member/journey");
  assert.equal(journeyFirst.response.status, 200);
  assert.deepEqual(journeyFirst.body.diagnostic.answers, answers);
  assert.equal(journeyFirst.body.evidences.find((item: { id: string }) => item.id === evidenceId)?.status, "verified");
  assert.deepEqual(journeyAfterRefresh.body.diagnostic, journeyFirst.body.diagnostic);
  assert.equal(
    journeyAfterRefresh.body.evidences.find((item: { id: string }) => item.id === evidenceId)?.description,
    "Deskripsi bukti yang sudah diperbaiki",
  );

  actor = await loadUser(adminId);
  result = await request("/member/journey");
  assert.equal(result.response.status, 403);

  actor = await loadUser(raceId);
  const [memberRace, companyRace] = await Promise.all([
    request("/onboarding/member", { method: "POST", body: JSON.stringify({ ...memberOnboarding, fullName: "Race Member" }) }),
    request("/onboarding/company", { method: "POST", body: JSON.stringify({ ...companyOnboarding, picName: "Race Company" }) }),
  ]);
  assert.deepEqual(
    [memberRace.response.status, companyRace.response.status].sort(),
    [200, 403],
  );
  const [raceMemberProfiles, raceCompanyProfiles, raceUser] = await Promise.all([
    db.select().from(memberProfilesTable).where(eq(memberProfilesTable.userId, raceId)),
    db.select().from(companyProfilesTable).where(eq(companyProfilesTable.userId, raceId)),
    loadUser(raceId),
  ]);
  assert.equal(raceMemberProfiles.length + raceCompanyProfiles.length, 1);
  assert.equal(raceUser.role, raceCompanyProfiles.length === 1 ? "company" : "member");

  console.log("member journey integration tests passed");
} finally {
  server.close();
  await db.transaction(async (tx) => {
    await tx.delete(auditLogsTable).where(eq(auditLogsTable.actorUserId, adminId));
    await tx.delete(verificationsTable).where(eq(verificationsTable.submittedByUserId, memberId));
    await tx.delete(memberEvidenceTable).where(eq(memberEvidenceTable.memberUserId, memberId));
    await tx.delete(readinessDiagnosticsTable).where(eq(readinessDiagnosticsTable.memberUserId, memberId));
    await tx.delete(memberProfilesTable).where(eq(memberProfilesTable.userId, memberId));
    await tx.delete(memberProfilesTable).where(eq(memberProfilesTable.userId, raceId));
    await tx.delete(companyProfilesTable).where(eq(companyProfilesTable.userId, raceId));
    await tx.delete(usersTable).where(eq(usersTable.id, memberId));
    await tx.delete(usersTable).where(eq(usersTable.id, adminId));
    await tx.delete(usersTable).where(eq(usersTable.id, raceId));
  });
}