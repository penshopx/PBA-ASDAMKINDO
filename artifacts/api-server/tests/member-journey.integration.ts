import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express, { type NextFunction, type Request, type Response } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  auditLogsTable,
  companyProfilesTable,
  db,
  enrollmentsTable,
  memberEvidenceTable,
  memberProfilesTable,
  programsTable,
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
const enrollmentRaceMemberIds = [
  `test-enrollment-race-a-${suffix}`,
  `test-enrollment-race-b-${suffix}`,
];
const enrollmentRaceProgramId = `test-last-seat-${suffix}`;
const journeyEnrollmentProgramId = `test-journey-enrollment-${suffix}`;
const evidenceKey = `evidence-${suffix}`;
let actor: User;
const actors = new Map<string, User>();

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  const authenticated = req as AuthenticatedRequest;
  const requestActor = actors.get(String(req.headers["x-test-user-id"] ?? "")) ?? actor;
  authenticated.userId = requestActor.id;
  authenticated.currentUser = requestActor;
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
    ...enrollmentRaceMemberIds.map((id, index) => ({
      id,
      clerkUserId: id,
      name: `Enrollment Race ${index + 1}`,
      email: `${id}@example.test`,
      role: "member",
      onboardingComplete: true,
    })),
  ]);
  const enrollmentRaceMembers = await db
    .select()
    .from(usersTable)
    .where(inArray(usersTable.id, enrollmentRaceMemberIds));
  for (const member of enrollmentRaceMembers) actors.set(member.id, member);

  await db.insert(programsTable).values({
    id: enrollmentRaceProgramId,
    name: "Bimtek Satu Kursi",
    category: "Manajemen proyek",
    mode: "online",
    schedule: "September 2026",
    duration: "2 hari",
    price: "0",
    instructor: "PBA ASDAMKINDO",
    description: "Fixture terisolasi untuk regresi perebutan kursi terakhir.",
    status: "published",
    capacity: 1,
  });
  await db.insert(programsTable).values({
    id: journeyEnrollmentProgramId,
    name: "Bimtek Journey Integration",
    category: "Manajemen proyek",
    mode: "online",
    schedule: "September 2026",
    duration: "2 hari",
    price: "0",
    instructor: "PBA ASDAMKINDO",
    description: "Fixture terisolasi untuk memastikan hasil pendaftaran tampil di journey.",
    status: "published",
    capacity: 10,
  });

  const enrollmentAttempts = await Promise.all(
    enrollmentRaceMemberIds.map((id) =>
      request(`/member/programs/${enrollmentRaceProgramId}/enroll`, {
        method: "POST",
        headers: { "x-test-user-id": id },
      }),
    ),
  );
  assert.deepEqual(
    enrollmentAttempts.map(({ response }) => response.status).sort(),
    [201, 409],
  );
  assert.equal(
    enrollmentAttempts.find(({ response }) => response.status === 409)?.body.error,
    "Kapasitas program sudah penuh.",
  );

  const enrollmentRows = await db
    .select()
    .from(enrollmentsTable)
    .where(eq(enrollmentsTable.programId, enrollmentRaceProgramId));
  assert.equal(enrollmentRows.length, 1);
  const winningMemberId = enrollmentRows[0]!.memberUserId;
  assert.equal(enrollmentRaceMemberIds.includes(winningMemberId), true);

  const retryWinner = await request(`/member/programs/${enrollmentRaceProgramId}/enroll`, {
    method: "POST",
    headers: { "x-test-user-id": winningMemberId },
  });
  assert.equal(retryWinner.response.status, 200);
  assert.equal(retryWinner.body.id, enrollmentRows[0]!.id);
  const enrollmentRowsAfterRetry = await db
    .select()
    .from(enrollmentsTable)
    .where(eq(enrollmentsTable.programId, enrollmentRaceProgramId));
  assert.equal(enrollmentRowsAfterRetry.length, 1);

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
  const unavailableEnrollment = await request(`/member/programs/program-tidak-tersedia-${suffix}/enroll`, {
    method: "POST",
  });
  assert.equal(unavailableEnrollment.response.status, 404);
  assert.equal(unavailableEnrollment.body.error, "Program terbit tidak ditemukan.");

  const successfulEnrollment = await request(`/member/programs/${journeyEnrollmentProgramId}/enroll`, {
    method: "POST",
  });
  assert.equal(successfulEnrollment.response.status, 201);
  assert.equal(successfulEnrollment.body.programName, "Bimtek Journey Integration");

  const idempotentEnrollment = await request(`/member/programs/${journeyEnrollmentProgramId}/enroll`, {
    method: "POST",
  });
  assert.equal(idempotentEnrollment.response.status, 200);
  assert.equal(idempotentEnrollment.body.id, successfulEnrollment.body.id);

  const journeyAfterEnrollment = await request("/member/journey");
  assert.equal(journeyAfterEnrollment.response.status, 200);
  assert.equal(
    journeyAfterEnrollment.body.learningProgress.some(
      (item: { programId: string; programName: string }) =>
        item.programId === journeyEnrollmentProgramId &&
        item.programName === "Bimtek Journey Integration",
    ),
    true,
  );
  assert.equal(
    journeyAfterEnrollment.body.recommendedPrograms.some(
      (program: { id: string }) => program.id === journeyEnrollmentProgramId,
    ),
    false,
  );

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
    await tx.delete(enrollmentsTable).where(eq(enrollmentsTable.programId, enrollmentRaceProgramId));
    await tx.delete(enrollmentsTable).where(eq(enrollmentsTable.programId, journeyEnrollmentProgramId));
    await tx.delete(programsTable).where(eq(programsTable.id, enrollmentRaceProgramId));
    await tx.delete(programsTable).where(eq(programsTable.id, journeyEnrollmentProgramId));
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
    await tx.delete(usersTable).where(inArray(usersTable.id, enrollmentRaceMemberIds));
  });
}