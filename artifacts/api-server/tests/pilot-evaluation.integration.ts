import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express, { type NextFunction, type Request, type Response } from "express";
import { count, eq, inArray, or } from "drizzle-orm";
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
  notificationsTable,
  professionalPassportsTable,
  programsTable,
  readinessDiagnosticsTable,
  transactionsTable,
  usersTable,
  verificationsTable,
  type User,
} from "@workspace/db";
import type { AuthenticatedRequest } from "../src/lib/auth";
import apiRouter from "../src/routes";

const suffix = randomUUID();
const adminId = `pilot-admin-${suffix}`;
const superAdminId = `pilot-super-admin-${suffix}`;
const companyId = `pilot-company-${suffix}`;
const memberIds = Array.from({ length: 20 }, (_, index) => `pilot-member-${index + 1}-${suffix}`);
const actorIds = [adminId, superAdminId, companyId, ...memberIds];
let programId: string | undefined;
let requirementId: string | undefined;
const enrollmentIds: string[] = [];
const transactionIds: string[] = [];
const matchingIds: string[] = [];
let actor: User;

const app = express();
app.use(express.json());
app.use(async (req: Request, _res: Response, next: NextFunction) => {
  const requestedActorId = req.header("x-test-user") ?? actor.id;
  const [requestActor] = await db.select().from(usersTable).where(eq(usersTable.id, requestedActorId)).limit(1);
  assert.ok(requestActor);
  const authenticated = req as AuthenticatedRequest;
  authenticated.userId = requestActor.id;
  authenticated.currentUser = requestActor;
  next();
});
app.use("/api", apiRouter);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const port = (server.address() as AddressInfo).port;
const baseUrl = `http://127.0.0.1:${port}/api`;

async function requestAs(userId: string, path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers, "x-test-user": userId },
  });
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}

function postAs(userId: string, path: string, body: unknown) {
  return requestAs(userId, path, { method: "POST", body: JSON.stringify(body) });
}

function patchAs(userId: string, path: string, body: unknown) {
  return requestAs(userId, path, { method: "PATCH", body: JSON.stringify(body) });
}

try {
  // Authentication identities are the only direct setup fixture. Every pilot-domain row is created via API.
  await db.insert(usersTable).values([
    { id: adminId, clerkUserId: adminId, name: "Admin Pilot Sintetis", email: `${adminId}@example.test`, role: "admin", onboardingComplete: true },
    { id: superAdminId, clerkUserId: superAdminId, name: "Super Admin Pilot Sintetis", email: `${superAdminId}@example.test`, role: "super_admin", onboardingComplete: true },
    { id: companyId, clerkUserId: companyId, name: "PIC Pilot Sintetis", email: `${companyId}@example.test` },
    ...memberIds.map((id, index) => ({
      id,
      clerkUserId: id,
      name: `Anggota Sintetis ${index + 1}`,
      email: `${id}@example.test`,
    })),
  ]);
  [actor] = await db.select().from(usersTable).where(eq(usersTable.id, adminId)).limit(1);

  let result = await postAs(companyId, "/onboarding/company", {
    companyName: "PT Mitra Pilot Sintetis",
    companyType: "Kontraktor",
    phone: "0210000000",
    businessEmail: `${companyId}@example.test`,
    address: "Jakarta",
    picName: "PIC Pilot Sintetis",
    picTitle: "Manajer SDM",
    primaryNeed: "talent",
  });
  assert.equal(result.response.status, 200);

  result = await postAs(adminId, "/admin/programs", {
    name: "Bimtek Pilot 20 Anggota",
    category: "Bimtek",
    mode: "Hybrid",
    schedule: "Sabtu",
    duration: "4 minggu",
    price: 100000,
    instructor: "Fasilitator Sintetis",
    description: "Program fiktif untuk pembuktian pilot.",
    status: "published",
    capacity: 20,
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  programId = result.body.id as string;

  result = await postAs(companyId, "/company/requirements", {
    kind: "talent",
    title: "BIM Modeler Pilot",
    description: "Kebutuhan fiktif untuk pembuktian pilot.",
    location: "Jakarta",
    competencies: ["BIM"],
    minimumSkkLevel: 1,
    minimumExperience: 1,
    headcount: 20,
    deadline: "2026-12-31",
    status: "open",
  });
  assert.equal(result.response.status, 201, `requirement: ${JSON.stringify(result.body)}`);
  requirementId = result.body.id as string;

  const passportSlugs: string[] = [];
  for (const [index, memberId] of memberIds.entries()) {
    result = await postAs(memberId, "/onboarding/member", {
      fullName: `Anggota Sintetis ${index + 1}`,
      phone: `08000000${String(index + 1).padStart(2, "0")}`,
      domicile: "Jakarta",
      education: "S1 Teknik Sipil",
      jobTitle: "BIM Modeler",
      skkLevel: 3,
      expertise: "BIM",
      experienceYears: 3,
      primaryGoal: "competency",
      dataConsent: index !== 0,
    });
    assert.equal(result.response.status, 200);

    result = await postAs(memberId, `/member/programs/${programId}/enroll`, {});
    assert.equal(result.response.status, 201, `enrollment ${index}: ${JSON.stringify(result.body)}`);
    enrollmentIds.push(result.body.id);

    result = await postAs(memberId, "/member/diagnostics", {
      answers: { technical: 5, safety: 4, communication: 3, problemSolving: 4, evidence: 5 },
    });
    assert.equal(result.response.status, 200);

    result = await requestAs(memberId, "/member/passport");
    assert.equal(result.response.status, 200);
    const slug = `pilot-${index + 1}-${suffix}`;
    passportSlugs.push(slug);
    result = await patchAs(memberId, "/member/passport", {
      slug,
      isPublic: index === 0,
      headline: "BIM Modeler Sintetis",
      preferredRoles: ["BIM Modeler"],
      preferredLocations: ["Jakarta"],
      availabilityStatus: "available",
    });
    assert.equal(result.response.status, 200);

    result = await postAs(memberId, "/member/passport/consents", {
      companyId,
      note: "Consent time-bounded untuk pilot sintetis",
    });
    assert.equal(result.response.status, 201, `consent ${index}: ${JSON.stringify(result.body)}`);

    result = await postAs(memberId, "/member/evidence", {
      clientRequestId: `pilot-evidence-${index + 1}-${suffix}`,
      evidenceType: "certification",
      title: `Bukti BIM Sintetis ${index + 1}`,
      description: "Bukti kompetensi fiktif tanpa dokumen pribadi.",
      referenceUrl: null,
      status: "submitted",
    });
    assert.equal(result.response.status, 201, `evidence ${index}: ${JSON.stringify(result.body)}`);
    const evidenceId = result.body.id as string;
    result = await postAs(adminId, `/admin/verifications/verification-${evidenceId}/decision`, {
      status: "approved",
      note: "Bukti sintetis disetujui untuk simulasi",
    });
    assert.equal(result.response.status, 200);
  }

  // Public visibility and company consent are independent controls.
  result = await requestAs(companyId, `/passport/${passportSlugs[0]}`);
  assert.equal(result.response.status, 200);
  result = await requestAs(companyId, `/passport/${passportSlugs[1]}`);
  assert.equal(result.response.status, 404);
  result = await requestAs(companyId, "/company/talent-pool?page=1&pageSize=20");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.total, 19);
  assert.equal(result.body.items.some((item: { name: string }) => item.name === "Anggota Sintetis 1"), false);
  assert.equal(result.body.items.some((item: { name: string }) => item.name === "Anggota Sintetis 2"), true);

  for (let index = 0; index < 10; index += 1) {
    result = await postAs(superAdminId, "/admin/transactions/manual", {
      enrollmentId: enrollmentIds[index],
      amount: 100000,
      source: index % 2 === 0 ? "sandbox" : "manual",
    });
    assert.equal(result.response.status, 201, `payment ${index}: ${JSON.stringify(result.body)}`);
    transactionIds.push(result.body.id);
    result = await postAs(adminId, "/admin/transactions/settlement", {
      referenceId: enrollmentIds[index],
      settlementAmount: 100000,
      settledAt: new Date(Date.now() - index * 1000).toISOString(),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.reconciliationStatus, "matched");
    result = await patchAs(adminId, `/admin/enrollments/${enrollmentIds[index]}`, {
      status: "completed",
      note: "Penyelesaian program pilot sintetis",
    });
    assert.equal(result.response.status, 200);
  }

  result = await requestAs(companyId, `/company/talent-pool/matches?requirementId=${requirementId}&page=1&pageSize=20&refresh=true`);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.total, 19);
  for (const candidate of result.body.items as Array<{ candidateId: string }>) {
    const shortlisted = await postAs(companyId, "/company/shortlist", {
      requirementId,
      candidateId: candidate.candidateId,
    });
    assert.ok([200, 201].includes(shortlisted.response.status));
    matchingIds.push(shortlisted.body.id);
  }
  const transactionCountBeforePlacement = await db.select({ value: count() }).from(transactionsTable);
  result = await patchAs(companyId, `/company/shortlist/${matchingIds[0]}`, {
    status: "placed",
    note: "Placement simulasi tanpa tindakan eksternal",
  });
  assert.equal(result.response.status, 200);
  const transactionCountAfterPlacement = await db.select({ value: count() }).from(transactionsTable);
  assert.equal(transactionCountAfterPlacement[0]?.value, transactionCountBeforePlacement[0]?.value);

  const reportPath = `/admin/pilot-evaluation?programId=${programId}&requirementId=${requirementId}`;
  result = await requestAs(memberIds[0], reportPath);
  assert.equal(result.response.status, 403);
  result = await requestAs(adminId, reportPath);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.targetParticipants, 20);
  assert.deepEqual(result.body.cohort, {
    programName: "Bimtek Pilot 20 Anggota",
    requirementTitle: "BIM Modeler Pilot",
    companyName: "PT Mitra Pilot Sintetis",
    participantCount: 20,
  });
  const metrics = new Map(result.body.metrics.map((metric: { key: string }) => [metric.key, metric]));
  assert.equal(metrics.get("registrations")?.value, 20);
  assert.equal(metrics.get("completedDiagnostics")?.value, 20);
  assert.equal(metrics.get("paidParticipants")?.value, 10);
  assert.equal(metrics.get("completionRate")?.value, 50);
  assert.equal(metrics.get("activeConsent")?.value, 19);
  assert.equal(metrics.get("verifiedTalent")?.value, 19);
  assert.equal(metrics.get("matchedCandidates")?.value, 19);
  assert.equal(metrics.get("shortlistPipeline")?.value, 19);
  assert.equal(metrics.get("placementSimulation")?.value, 1);

  const aggregateJson = JSON.stringify(result.body);
  for (const secretValue of [programId, requirementId, companyId, ...memberIds, ...enrollmentIds, ...matchingIds, ...transactionIds]) {
    assert.equal(aggregateJson.includes(secretValue), false);
  }
  const forbiddenKeys = ["id", "memberUserId", "candidateUserId", "companyUserId", "clerkUserId", "consentVersion", "expiresAt"];
  assert.equal(forbiddenKeys.some((key) => key in result.body.cohort), false);
  assert.equal(result.body.metrics.some((metric: Record<string, unknown>) => forbiddenKeys.some((key) => key in metric)), false);

  result = await postAs(adminId, "/admin/pilot-feedback", {
    programId,
    requirementId,
    note: "Kendala akses materi sandbox",
  });
  assert.equal(result.response.status, 201, `feedback: ${JSON.stringify(result.body)}`);
  result = await requestAs(adminId, `/admin/pilot-feedback?programId=${programId}&requirementId=${requirementId}`);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.length, 1);
  const feedbackId = result.body[0].id as string;
  result = await patchAs(adminId, `/admin/pilot-feedback/${feedbackId}`, {
    status: "resolved",
    note: "Materi sandbox dibuka kembali",
  });
  assert.equal(result.response.status, 200);
  result = await requestAs(adminId, reportPath);
  assert.equal(result.body.metrics.find((metric: { key: string }) => metric.key === "complaints").value, 1);
  assert.equal(typeof result.body.metrics.find((metric: { key: string }) => metric.key === "adminResponseTimeHours").value, "number");

  console.log("20-member synthetic pilot integration tests passed");
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.transaction(async (tx) => {
    await tx.delete(notificationsTable).where(inArray(notificationsTable.userId, actorIds));
    await tx.delete(auditLogsTable).where(or(inArray(auditLogsTable.actorUserId, actorIds), inArray(auditLogsTable.entityId, actorIds)));
    await tx.delete(matchingsTable).where(eq(matchingsTable.companyUserId, companyId));
    await tx.delete(companyTalentConsentsTable).where(eq(companyTalentConsentsTable.companyUserId, companyId));
    if (enrollmentIds.length > 0) {
      await tx.delete(transactionsTable).where(inArray(transactionsTable.referenceId, enrollmentIds));
    }
    await tx.delete(verificationsTable).where(inArray(verificationsTable.submittedByUserId, memberIds));
    await tx.delete(memberEvidenceTable).where(inArray(memberEvidenceTable.memberUserId, memberIds));
    await tx.delete(readinessDiagnosticsTable).where(inArray(readinessDiagnosticsTable.memberUserId, memberIds));
    await tx.delete(professionalPassportsTable).where(inArray(professionalPassportsTable.memberUserId, memberIds));
    await tx.delete(enrollmentsTable).where(inArray(enrollmentsTable.memberUserId, memberIds));
    await tx.delete(memberProfilesTable).where(inArray(memberProfilesTable.userId, memberIds));
    await tx.delete(companyRequirementsTable).where(eq(companyRequirementsTable.companyUserId, companyId));
    await tx.delete(companyProfilesTable).where(eq(companyProfilesTable.userId, companyId));
    if (programId) {
      await tx.delete(programsTable).where(eq(programsTable.id, programId));
    }
    await tx.delete(usersTable).where(inArray(usersTable.id, actorIds));
  });
}