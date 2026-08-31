import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express, { type NextFunction, type Request, type Response } from "express";
import { eq, inArray } from "drizzle-orm";
import {
  auditLogsTable,
  companyProfilesTable,
  companyRequirementsTable,
  companyTalentConsentsTable,
  db,
  enrollmentsTable,
  matchingsTable,
  memberEvidenceTable,
  memberProfilesTable,
  professionalPassportsTable,
  programsTable,
  readinessDiagnosticsTable,
  transactionsTable,
  usersTable,
  type User,
} from "@workspace/db";
import type { AuthenticatedRequest } from "../src/lib/auth";
import adminRouter from "../src/routes/admin";

const suffix = randomUUID();
const adminId = `pilot-eval-admin-${suffix}`;
const memberAId = `pilot-eval-member-a-${suffix}`;
const memberBId = `pilot-eval-member-b-${suffix}`;
const cancelledMemberId = `pilot-eval-member-cancelled-${suffix}`;
const companyId = `pilot-eval-company-${suffix}`;
const programId = `pilot-eval-program-${suffix}`;
const requirementId = `pilot-eval-requirement-${suffix}`;
const enrollmentAId = `pilot-eval-enrollment-a-${suffix}`;
const enrollmentBId = `pilot-eval-enrollment-b-${suffix}`;
const cancelledEnrollmentId = `pilot-eval-enrollment-cancelled-${suffix}`;
let actor: User;

const app = express();
app.use(express.json());
app.use(async (req: Request, _res: Response, next: NextFunction) => {
  const requestedActorId = req.header("x-test-user");
  const [requestActor] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, requestedActorId ?? actor.id))
    .limit(1);
  assert.ok(requestActor);
  const authenticated = req as AuthenticatedRequest;
  authenticated.userId = requestActor.id;
  authenticated.currentUser = requestActor;
  next();
});
app.use("/api", adminRouter);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const port = (server.address() as AddressInfo).port;
const baseUrl = `http://127.0.0.1:${port}/api`;

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  return { response, body: await response.json() };
}

try {
  const now = new Date();
  const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await db.transaction(async (tx) => {
    await tx.insert(usersTable).values([
      { id: adminId, clerkUserId: adminId, name: "Admin Pilot", email: `${adminId}@example.test`, role: "admin", onboardingComplete: true },
      { id: memberAId, clerkUserId: memberAId, name: "Member A Pilot", email: `${memberAId}@example.test`, role: "member", onboardingComplete: true },
      { id: memberBId, clerkUserId: memberBId, name: "Member B Pilot", email: `${memberBId}@example.test`, role: "member", onboardingComplete: true },
      { id: cancelledMemberId, clerkUserId: cancelledMemberId, name: "Member Cancelled Pilot", email: `${cancelledMemberId}@example.test`, role: "member", onboardingComplete: true },
      { id: companyId, clerkUserId: companyId, name: "Company Pilot", email: `${companyId}@example.test`, role: "company", onboardingComplete: true, organization: "PT Mitra Pilot" },
    ]);
    await tx.insert(companyProfilesTable).values({
      id: `pilot-eval-company-profile-${suffix}`,
      userId: companyId,
      companyName: "PT Mitra Pilot",
      companyType: "Kontraktor",
      phone: "0210000000",
      businessEmail: `${companyId}@business.test`,
      address: "Jakarta",
      picName: "PIC Pilot",
      picTitle: "Manajer SDM",
      primaryNeed: "talent",
    });
    await tx.insert(programsTable).values({
      id: programId,
      name: "Bimtek Pilot Terbatas",
      category: "Bimtek",
      mode: "Hybrid",
      schedule: "Sabtu",
      duration: "4 minggu",
      price: "100000.00",
      instructor: "Fasilitator Pilot",
      description: "Program fiktif untuk test evaluasi pilot.",
      status: "published",
      capacity: 20,
    });
    await tx.insert(companyRequirementsTable).values({
      id: requirementId,
      companyUserId: companyId,
      kind: "talent",
      title: "BIM Modeler Pilot",
      description: "Kebutuhan fiktif untuk test evaluasi pilot.",
      location: "Jakarta",
      competencies: ["BIM"],
      minimumSkkLevel: 1,
      minimumExperience: 1,
      headcount: 1,
      deadline: "2026-12-31",
      status: "open",
    });
    await tx.insert(memberProfilesTable).values([
      { id: `pilot-eval-profile-a-${suffix}`, userId: memberAId, phone: "0800000001", domicile: "Jakarta", education: "S1", jobTitle: "BIM Modeler", expertise: "BIM", skkLevel: 3, experienceYears: 3, primaryGoal: "competency", dataConsent: true },
      { id: `pilot-eval-profile-b-${suffix}`, userId: memberBId, phone: "0800000002", domicile: "Jakarta", education: "S1", jobTitle: "BIM Modeler", expertise: "BIM", skkLevel: 3, experienceYears: 3, primaryGoal: "competency", dataConsent: false },
      { id: `pilot-eval-profile-c-${suffix}`, userId: cancelledMemberId, phone: "0800000003", domicile: "Jakarta", education: "S1", jobTitle: "BIM Modeler", expertise: "BIM", skkLevel: 3, experienceYears: 3, primaryGoal: "competency", dataConsent: true },
    ]);
    await tx.insert(enrollmentsTable).values([
      { id: enrollmentAId, programId, memberUserId: memberAId, memberName: "Member A Pilot", status: "completed", enrolledAt: now, completedAt: now },
      { id: enrollmentBId, programId, memberUserId: memberBId, memberName: "Member B Pilot", status: "enrolled", enrolledAt: now },
      { id: cancelledEnrollmentId, programId, memberUserId: cancelledMemberId, memberName: "Member Cancelled Pilot", status: "cancelled" },
    ]);
    await tx.insert(readinessDiagnosticsTable).values([
      { id: `pilot-eval-diagnostic-a-${suffix}`, memberUserId: memberAId, score: 80, answers: {}, focusAreas: [] },
      { id: `pilot-eval-diagnostic-b-${suffix}`, memberUserId: memberBId, score: 70, answers: {}, focusAreas: [] },
      { id: `pilot-eval-diagnostic-c-${suffix}`, memberUserId: cancelledMemberId, score: 90, answers: {}, focusAreas: [] },
    ]);
    await tx.insert(professionalPassportsTable).values([
      { id: `pilot-eval-passport-a-${suffix}`, memberUserId: memberAId, slug: `pilot-eval-a-${suffix}`, headline: "BIM Modeler", availabilityStatus: "available" },
      { id: `pilot-eval-passport-b-${suffix}`, memberUserId: memberBId, slug: `pilot-eval-b-${suffix}`, headline: "BIM Modeler", availabilityStatus: "available" },
    ]);
    await tx.insert(memberEvidenceTable).values([
      { id: `pilot-eval-evidence-a-${suffix}`, memberUserId: memberAId, evidenceType: "certificate", title: "SKK BIM", status: "verified" },
      { id: `pilot-eval-evidence-b-${suffix}`, memberUserId: memberBId, evidenceType: "certificate", title: "Bukti BIM", status: "submitted" },
    ]);
    await tx.insert(companyTalentConsentsTable).values([
      { id: `pilot-eval-consent-a-${suffix}`, memberUserId: memberAId, companyUserId: companyId, status: "active", grantedAt: now, expiresAt: future, grantedBy: memberAId },
      { id: `pilot-eval-consent-b-${suffix}`, memberUserId: memberBId, companyUserId: companyId, status: "active", grantedAt: now, expiresAt: future, grantedBy: memberBId },
    ]);
    await tx.insert(transactionsTable).values({
      id: `pilot-eval-transaction-${suffix}`,
      kind: "program",
      referenceId: enrollmentAId,
      customerName: "Member A Pilot",
      amount: "100000.00",
      status: "paid",
    });
    await tx.insert(matchingsTable).values([
      { id: `pilot-eval-matching-a-${suffix}`, requirementId, companyUserId: companyId, requirement: "BIM Modeler Pilot", companyName: "PT Mitra Pilot", candidateUserId: memberAId, candidateName: "Member A Pilot", score: 90, status: "shortlisted" },
      { id: `pilot-eval-matching-b-${suffix}`, requirementId, companyUserId: companyId, requirement: "BIM Modeler Pilot", companyName: "PT Mitra Pilot", candidateUserId: memberBId, candidateName: "Member B Pilot", score: 80, status: "placed" },
      { id: `pilot-eval-matching-c-${suffix}`, requirementId, companyUserId: companyId, requirement: "BIM Modeler Pilot", companyName: "PT Mitra Pilot", candidateUserId: cancelledMemberId, candidateName: "Member Cancelled Pilot", score: 95, status: "placed" },
    ]);
  });

  const [admin] = await db.select().from(usersTable).where(eq(usersTable.id, adminId)).limit(1);
  assert.ok(admin);
  actor = admin;

  let result = await request("/admin/pilot-evaluation/options", { headers: { "x-test-user": memberAId } });
  assert.equal(result.response.status, 403);

  result = await request("/admin/pilot-evaluation/options");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.programs.some((program: { id: string }) => program.id === programId), true);
  assert.equal(result.body.requirements.some((requirement: { id: string }) => requirement.id === requirementId), true);

  const reportPath = `/admin/pilot-evaluation?programId=${programId}&requirementId=${requirementId}`;
  result = await request(reportPath);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.targetParticipants, 20);
  assert.deepEqual(result.body.cohort, {
    programName: "Bimtek Pilot Terbatas",
    requirementTitle: "BIM Modeler Pilot",
    companyName: "PT Mitra Pilot",
    participantCount: 2,
  });
  const metrics = new Map(
    result.body.metrics.map((metric: { key: string; value: number | null; denominator: number | null }) => [metric.key, metric]),
  );
  assert.equal(metrics.get("registrations")?.value, 2);
  assert.equal(metrics.get("completedDiagnostics")?.value, 2);
  assert.equal(metrics.get("paidParticipants")?.value, 1);
  assert.equal(metrics.get("completionRate")?.value, 50);
  assert.equal(metrics.get("activeConsent")?.value, 1);
  assert.equal(metrics.get("verifiedTalent")?.value, 1);
  assert.equal(metrics.get("matchedCandidates")?.value, 2);
  assert.equal(metrics.get("shortlistPipeline")?.value, 2);
  assert.equal(metrics.get("placementSimulation")?.value, 1);
  assert.equal(metrics.get("complaints")?.value, 0);
  assert.equal(metrics.get("adminResponseTimeHours")?.value, null);
  assert.equal(metrics.get("adminResponseTimeHours")?.denominator, 0);
  const reportJson = JSON.stringify(result.body);
  for (const internalId of [programId, requirementId, memberAId, memberBId, companyId]) {
    assert.equal(reportJson.includes(internalId), false);
  }
  assert.equal(["id", "memberUserId", "candidateUserId", "companyUserId", "clerkUserId"].some((key) => key in result.body.cohort), false);

  result = await request("/admin/pilot-feedback", {
    method: "POST",
    body: JSON.stringify({ programId, requirementId, note: "   " }),
  });
  assert.equal(result.response.status, 400);
  result = await request("/admin/pilot-feedback", {
    method: "POST",
    body: JSON.stringify({ programId, requirementId, note: "Hubungi peserta@example.test untuk password" }),
  });
  assert.equal(result.response.status, 400);
  result = await request("/admin/pilot-feedback", {
    method: "POST",
    body: JSON.stringify({ programId, requirementId, note: "Kendala akses materi sandbox" }),
  });
  assert.equal(result.response.status, 201);
  assert.deepEqual(result.body, { status: "recorded" });

  result = await request(`/admin/pilot-feedback?programId=${programId}&requirementId=${requirementId}`);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0].status, "open");
  assert.equal(result.body[0].note, "Kendala akses materi sandbox");
  const feedbackId = result.body[0].id as string;

  const concurrentResolutions = await Promise.all([
    request(`/admin/pilot-feedback/${feedbackId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "resolved", note: "Materi sandbox dibuka kembali" }),
    }),
    request(`/admin/pilot-feedback/${feedbackId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "resolved", note: "Materi sandbox dibuka kembali" }),
    }),
  ]);
  assert.deepEqual(concurrentResolutions.map(({ response }) => response.status).sort(), [200, 400]);

  result = await request(reportPath);
  assert.equal(result.response.status, 200);
  const updatedMetrics = new Map(
    result.body.metrics.map((metric: { key: string; value: number | null; denominator: number | null }) => [metric.key, metric]),
  );
  assert.equal(updatedMetrics.get("complaints")?.value, 1);
  assert.equal(typeof updatedMetrics.get("adminResponseTimeHours")?.value, "number");
  assert.equal(updatedMetrics.get("adminResponseTimeHours")?.denominator, 1);

  console.log("pilot evaluation integration tests passed");
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.transaction(async (tx) => {
    await tx.delete(auditLogsTable).where(eq(auditLogsTable.actorUserId, adminId));
    await tx.delete(matchingsTable).where(eq(matchingsTable.requirementId, requirementId));
    await tx.delete(transactionsTable).where(eq(transactionsTable.referenceId, enrollmentAId));
    await tx.delete(companyTalentConsentsTable).where(eq(companyTalentConsentsTable.companyUserId, companyId));
    await tx.delete(memberEvidenceTable).where(inArray(memberEvidenceTable.memberUserId, [memberAId, memberBId, cancelledMemberId]));
    await tx.delete(readinessDiagnosticsTable).where(inArray(readinessDiagnosticsTable.memberUserId, [memberAId, memberBId, cancelledMemberId]));
    await tx.delete(professionalPassportsTable).where(inArray(professionalPassportsTable.memberUserId, [memberAId, memberBId, cancelledMemberId]));
    await tx.delete(enrollmentsTable).where(eq(enrollmentsTable.programId, programId));
    await tx.delete(memberProfilesTable).where(inArray(memberProfilesTable.userId, [memberAId, memberBId, cancelledMemberId]));
    await tx.delete(companyRequirementsTable).where(eq(companyRequirementsTable.id, requirementId));
    await tx.delete(companyProfilesTable).where(eq(companyProfilesTable.userId, companyId));
    await tx.delete(programsTable).where(eq(programsTable.id, programId));
    await tx.delete(usersTable).where(inArray(usersTable.id, [adminId, memberAId, memberBId, cancelledMemberId, companyId]));
  });
}