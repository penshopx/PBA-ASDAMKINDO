import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express, { type NextFunction, type Request, type Response } from "express";
import { and, count, countDistinct, eq, inArray, or } from "drizzle-orm";
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
  readinessDiagnosticsTable,
  transactionsTable,
  talentConsentSettingsTable,
  usersTable,
  type User,
} from "@workspace/db";
import type { AuthenticatedRequest } from "../src/lib/auth";
import companyRouter from "../src/routes/company";
import passportRouter from "../src/routes/passport";
import adminRouter from "../src/routes/admin";

const suffix = randomUUID();
const adminId = `security-admin-${suffix}`;
const companyAId = `security-company-a-${suffix}`;
const companyBId = `security-company-b-${suffix}`;
const strongMemberId = `security-member-strong-${suffix}`;
const partialMemberId = `security-member-partial-${suffix}`;
const privateMemberId = `security-member-private-${suffix}`;
const requirementAId = `security-requirement-a-${suffix}`;
const requirementBId = `security-requirement-b-${suffix}`;
const strongPassportId = `security-passport-strong-${suffix}`;
const partialPassportId = `security-passport-partial-${suffix}`;
const privatePassportId = `security-passport-private-${suffix}`;
const matchingBId = `security-matching-b-${suffix}`;
const strongConsentAId = `security-consent-a-strong-${suffix}`;
const partialConsentAId = `security-consent-a-partial-${suffix}`;
const privateConsentAId = `security-consent-a-private-${suffix}`;
let actor: User;

const app = express();
app.use(express.json());
app.use(async (req: Request, _res: Response, next: NextFunction) => {
  const requestedActorId = req.header("x-test-user");
  const requestActor = requestedActorId ? await loadUser(requestedActorId) : actor;
  const authenticated = req as AuthenticatedRequest;
  authenticated.userId = requestActor.id;
  authenticated.currentUser = requestActor;
  next();
});
app.use("/api", passportRouter, companyRouter, adminRouter);
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (req.header("x-test-fail-notification") !== "true") {
    console.error(`Unexpected ${req.method} ${req.path} failure`, error);
  }
  res.status(500).json({ error: "Terjadi kesalahan pada server." });
});

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const port = (server.address() as AddressInfo).port;
const baseUrl = `http://127.0.0.1:${port}/api`;

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const responseText = await response.text();
  let body: any;
  try {
    body = JSON.parse(responseText);
  } catch {
    throw new Error(`${init?.method ?? "GET"} ${path} returned ${response.status} with a non-JSON response: ${responseText.slice(0, 2000)}`);
  }
  return { response, body };
}
async function requestAs(userId: string, path: string, init?: RequestInit) {
  return request(path, { ...init, headers: { ...init?.headers, "x-test-user": userId } });
}

async function loadUser(id: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  assert.ok(user);
  return user;
}

const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const [originalConsentSettings] = await db.select().from(talentConsentSettingsTable).limit(1);

try {
  await db.transaction(async (tx) => {
    await tx.insert(usersTable).values([
      {
        id: adminId,
        clerkUserId: adminId,
        name: "Admin Security",
        email: `${adminId}@example.test`,
        role: "admin",
        onboardingComplete: true,
      },
      {
        id: companyAId,
        clerkUserId: companyAId,
        name: "Company A Security",
        email: `${companyAId}@example.test`,
        role: "company",
        onboardingComplete: true,
        organization: "PT Company A",
      },
      {
        id: companyBId,
        clerkUserId: companyBId,
        name: "Company B Security",
        email: `${companyBId}@example.test`,
        role: "company",
        onboardingComplete: true,
        organization: "PT Company B",
      },
      {
        id: strongMemberId,
        clerkUserId: strongMemberId,
        name: "Strong Candidate",
        email: `${strongMemberId}@example.test`,
        role: "member",
        onboardingComplete: true,
      },
      {
        id: partialMemberId,
        clerkUserId: partialMemberId,
        name: "Partial Candidate",
        email: `${partialMemberId}@example.test`,
        role: "member",
        onboardingComplete: true,
      },
      {
        id: privateMemberId,
        clerkUserId: privateMemberId,
        name: "Private Candidate",
        email: `${privateMemberId}@example.test`,
        role: "member",
        onboardingComplete: true,
      },
    ]);

    await tx.insert(companyProfilesTable).values([
      {
        id: `security-profile-a-${suffix}`,
        userId: companyAId,
        companyName: "PT Company A",
        companyType: "Kontraktor",
        phone: "0211111111",
        businessEmail: `${companyAId}@business.test`,
        address: "Jakarta",
        picName: "PIC A",
        picTitle: "HR Manager",
        primaryNeed: "talent",
      },
      {
        id: `security-profile-b-${suffix}`,
        userId: companyBId,
        companyName: "PT Company B",
        companyType: "Konsultan",
        phone: "0212222222",
        businessEmail: `${companyBId}@business.test`,
        address: "Bandung",
        picName: "PIC B",
        picTitle: "HR Manager",
        primaryNeed: "talent",
      },
    ]);

    await tx.insert(memberProfilesTable).values([
      {
        id: `security-profile-strong-${suffix}`,
        userId: strongMemberId,
        phone: "0811111111",
        domicile: "Jakarta",
        education: "S1 Teknik Informatika",
        jobTitle: "Security Engineer",
        expertise: "TypeScript, Security",
        skkLevel: 7,
        experienceYears: 8,
        primaryGoal: "competency",
        dataConsent: true,
      },
      {
        id: `security-profile-partial-${suffix}`,
        userId: partialMemberId,
        phone: "0812222222",
        domicile: "Bandung",
        education: "S1 Sistem Informasi",
        jobTitle: "Junior TypeScript Engineer",
        expertise: "TypeScript",
        skkLevel: 3,
        experienceYears: 2,
        primaryGoal: "competency",
        dataConsent: true,
      },
      {
        id: `security-profile-private-${suffix}`,
        userId: privateMemberId,
        phone: "0813333333",
        domicile: "Jakarta",
        education: "S1 Teknik Informatika",
        jobTitle: "Security Engineer",
        expertise: "TypeScript, Security",
        skkLevel: 7,
        experienceYears: 8,
        primaryGoal: "competency",
        dataConsent: false,
      },
    ]);

    await tx.insert(professionalPassportsTable).values([
      {
        id: strongPassportId,
        memberUserId: strongMemberId,
        slug: `strong-security-${suffix}`,
        isPublic: true,
        headline: "Senior TypeScript Security Engineer",
        preferredRoles: ["Security Engineer"],
        preferredLocations: ["Jakarta"],
        availabilityStatus: "available",
      },
      {
        id: partialPassportId,
        memberUserId: partialMemberId,
        slug: `partial-security-${suffix}`,
        isPublic: true,
        headline: "TypeScript Engineer",
        preferredRoles: ["Frontend Engineer"],
        preferredLocations: ["Surabaya"],
        availabilityStatus: "open_to_offer",
      },
      {
        id: privatePassportId,
        memberUserId: privateMemberId,
        slug: `private-security-${suffix}`,
        isPublic: false,
        headline: "Private Security Engineer",
        preferredRoles: ["Security Engineer"],
        preferredLocations: ["Jakarta"],
        availabilityStatus: "available",
      },
    ]);

    await tx.insert(readinessDiagnosticsTable).values([
      {
        id: `security-readiness-strong-${suffix}`,
        memberUserId: strongMemberId,
        score: 90,
        answers: {},
        focusAreas: [],
      },
      {
        id: `security-readiness-partial-${suffix}`,
        memberUserId: partialMemberId,
        score: 40,
        answers: {},
        focusAreas: [],
      },
      {
        id: `security-readiness-private-${suffix}`,
        memberUserId: privateMemberId,
        score: 90,
        answers: {},
        focusAreas: [],
      },
    ]);

    await tx.insert(memberEvidenceTable).values([
      {
        id: `security-evidence-strong-${suffix}`,
        memberUserId: strongMemberId,
        evidenceType: "certificate",
        title: "SKK Security Engineer",
        status: "verified",
      },
      {
        id: `security-evidence-partial-${suffix}`,
        memberUserId: partialMemberId,
        evidenceType: "certificate",
        title: "Sertifikat TypeScript",
        status: "submitted",
      },
    ]);

    await tx.insert(companyRequirementsTable).values([
      {
        id: requirementAId,
        companyUserId: companyAId,
        kind: "talent",
        title: "Security Engineer",
        description: "Kebutuhan privat untuk pengujian isolasi.",
        location: "Jakarta",
        competencies: ["TypeScript", "Security"],
        minimumSkkLevel: 6,
        minimumExperience: 5,
        headcount: 1,
        deadline: "2026-12-31",
        status: "open",
      },
      {
        id: requirementBId,
        companyUserId: companyBId,
        kind: "talent",
        title: "Kebutuhan Privat Company B",
        description: "Tidak boleh terbaca oleh Company A.",
        location: "Bandung",
        competencies: ["Audit"],
        minimumSkkLevel: 4,
        minimumExperience: 3,
        headcount: 1,
        deadline: "2026-12-31",
        status: "open",
      },
    ]);

    await tx.insert(companyTalentConsentsTable).values([
      {
        id: strongConsentAId,
        memberUserId: strongMemberId,
        companyUserId: companyAId,
        scope: "talent_pool",
        status: "active",
        grantedAt: new Date(),
        expiresAt: future,
        grantedBy: strongMemberId,
      },
      {
        id: partialConsentAId,
        memberUserId: partialMemberId,
        companyUserId: companyAId,
        scope: "talent_pool",
        status: "active",
        grantedAt: new Date(),
        expiresAt: future,
        grantedBy: partialMemberId,
      },
      {
        id: privateConsentAId,
        memberUserId: privateMemberId,
        companyUserId: companyAId,
        scope: "talent_pool",
        status: "active",
        grantedAt: new Date(),
        expiresAt: future,
        grantedBy: privateMemberId,
      },
      {
        id: `security-consent-b-strong-${suffix}`,
        memberUserId: strongMemberId,
        companyUserId: companyBId,
        scope: "talent_pool",
        status: "active",
        grantedAt: new Date(),
        expiresAt: future,
        grantedBy: strongMemberId,
      },
    ]);

    await tx.insert(matchingsTable).values({
      id: matchingBId,
      requirementId: requirementBId,
      companyUserId: companyBId,
      requirement: "Kebutuhan Privat Company B",
      companyName: "PT Company B",
      candidateUserId: strongMemberId,
      candidateName: "Strong Candidate",
      score: 77,
      status: "review",
    });
  });

  actor = await loadUser(companyAId);

  let result = await request("/company/requirements");
  assert.equal(result.response.status, 200);
  assert.deepEqual(
    result.body.map((requirement: { id: string }) => requirement.id),
    [requirementAId],
  );
  result = await request("/admin/funnel");
  assert.equal(result.response.status, 403);

  result = await request(`/company/requirements/${requirementBId}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "Diubah oleh Company A" }),
  });
  assert.equal(result.response.status, 404);

  result = await request(`/company/talent-pool/matches?requirementId=${requirementBId}`);
  assert.equal(result.response.status, 404);

  result = await request("/company/requirements", {
    method: "POST",
    body: JSON.stringify({
      kind: "talent",
      title: "Kebutuhan tidak valid",
      description: "Kompetensi whitespace harus ditolak.",
      location: "Jakarta",
      competencies: ["TypeScript", "   "],
      minimumSkkLevel: 0,
      minimumExperience: 0,
      headcount: 1,
      deadline: "2026-12-31",
      status: "open",
    }),
  });
  assert.equal(result.response.status, 400);

  result = await request(`/company/shortlist/${matchingBId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "placed", note: "Akses lintas perusahaan" }),
  });
  assert.equal(result.response.status, 404);

  result = await request("/company/talent-pool");
  assert.equal(result.response.status, 200);
  assert.deepEqual(
    result.body.items.map((candidate: { id: string }) => candidate.id).sort(),
    [strongPassportId, partialPassportId].sort(),
  );
  assert.equal(result.body.items.some((candidate: { id: string }) => candidate.id === privatePassportId), false);

  result = await request(`/company/talent-pool/matches?requirementId=${requirementAId}`);
  assert.equal(result.response.status, 200);
  assert.deepEqual(
    result.body.items.map((candidate: { candidateId: string }) => candidate.candidateId).sort(),
    [strongPassportId, partialPassportId].sort(),
  );
  assert.equal(result.body.page, 1);
  assert.equal(result.body.pageSize, 20);
  assert.equal(result.body.total, 2);
  const strongCandidate = result.body.items.find((candidate: { candidateId: string }) => candidate.candidateId === strongPassportId) as {
    candidateId: string;
    score: number;
    readinessScore: number;
    matchReasons: string[];
    verificationStatus: string;
    scoreBreakdown: Record<string, number>;
    matchedCompetencies: string[];
    unmetCompetencies: string[];
  };
  const partialCandidate = result.body.items.find((candidate: { candidateId: string }) => candidate.candidateId === partialPassportId) as {
    candidateId: string;
    score: number;
    readinessScore: number;
    verificationStatus: string;
  };
  assert.equal(strongCandidate.candidateId, strongPassportId);
  assert.equal(strongCandidate.readinessScore, 90);
  assert.equal(strongCandidate.score, 100);
  assert.deepEqual(strongCandidate.scoreBreakdown, {
    jobTitle: 25,
    skkLevel: 20,
    requiredCompetencies: 20,
    experience: 15,
    location: 10,
    availability: 10,
  });
  assert.deepEqual(strongCandidate.matchedCompetencies, ["TypeScript", "Security"]);
  assert.deepEqual(strongCandidate.unmetCompetencies, []);
  assert.equal(strongCandidate.verificationStatus, "verified");
  assert.match(strongCandidate.matchReasons.join(" | "), /Jabatan Security Engineer selaras/);
  assert.match(strongCandidate.matchReasons.join(" | "), /SKK jenjang 7 memenuhi minimum 6/);
  assert.match(strongCandidate.matchReasons.join(" | "), /2 dari 2 kompetensi wajib cocok/);
  assert.match(strongCandidate.matchReasons.join(" | "), /Pengalaman 8 tahun memenuhi minimum/);
  assert.match(strongCandidate.matchReasons.join(" | "), /preferensi relokasi selaras dengan Jakarta/);
  assert.equal(partialCandidate.candidateId, partialPassportId);
  assert.equal(partialCandidate.readinessScore, 40);
  assert.equal(partialCandidate.score, 33);
  assert.equal(partialCandidate.verificationStatus, "pending");
  assert.equal(result.body.items.some((candidate: { candidateId: string }) => candidate.candidateId === privatePassportId), false);
  assert.equal(["email", "phone", "memberUserId", "clerkUserId", "companyUserId", "consentVersion"].some((key) => key in strongCandidate), false);

  result = await request(`/company/talent-pool/matches?requirementId=${requirementAId}&minScore=90&page=1&pageSize=1&refresh=true`);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.total, 1);
  assert.deepEqual(result.body.items.map((candidate: { candidateId: string }) => candidate.candidateId), [strongPassportId]);
  const matchingAudits = await db
    .select()
    .from(auditLogsTable)
    .where(and(
      eq(auditLogsTable.actorUserId, companyAId),
      eq(auditLogsTable.entityId, requirementAId),
      inArray(auditLogsTable.action, ["matching.generated", "matching.viewed", "matching.refreshed"]),
    ));
  assert.equal(matchingAudits.some((audit) => audit.action === "matching.generated"), true);
  assert.equal(matchingAudits.some((audit) => audit.action === "matching.viewed"), true);
  assert.equal(matchingAudits.some((audit) => audit.action === "matching.refreshed"), true);

  result = await request(`/company/talent-pool/matches?requirementId=${requirementAId}&location=Bandung&skkLevel=3&experienceMin=2&availability=open_to_offer&verificationStatus=pending`);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.total, 1);
  assert.equal(result.body.items[0].candidateId, partialPassportId);

  await db
    .update(companyRequirementsTable)
    .set({ competencies: ["TypeScript", "Security", "   "] })
    .where(eq(companyRequirementsTable.id, requirementAId));
  result = await request(`/company/talent-pool/matches?requirementId=${requirementAId}&minScore=100`);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.total, 1);
  assert.equal(result.body.items[0].candidateId, strongPassportId);
  assert.equal(result.body.items[0].score, 100);
  assert.equal(result.body.items[0].scoreBreakdown.requiredCompetencies, 20);
  await db
    .update(companyRequirementsTable)
    .set({ competencies: ["TypeScript", "Security"] })
    .where(eq(companyRequirementsTable.id, requirementAId));

  const concurrentShortlistResults = await Promise.all([
    request("/company/shortlist", {
      method: "POST",
      body: JSON.stringify({ requirementId: requirementAId, candidateId: strongPassportId }),
    }),
    request("/company/shortlist", {
      method: "POST",
      body: JSON.stringify({ requirementId: requirementAId, candidateId: strongPassportId }),
    }),
  ]);
  assert.deepEqual(
    concurrentShortlistResults.map(({ response }) => response.status).sort(),
    [200, 201],
  );
  assert.equal(concurrentShortlistResults[0].body.status, "shortlisted");
  assert.equal(concurrentShortlistResults[1].body.status, "shortlisted");
  assert.equal(concurrentShortlistResults[0].body.id, concurrentShortlistResults[1].body.id);
  const matchingAId = concurrentShortlistResults[0].body.id as string;
  const [shortlistCountAfterRace] = await db
    .select({ value: count(matchingsTable.id) })
    .from(matchingsTable)
    .where(
      and(
        eq(matchingsTable.requirementId, requirementAId),
        eq(matchingsTable.companyUserId, companyAId),
        eq(matchingsTable.candidateUserId, strongMemberId),
      ),
    );
  assert.equal(shortlistCountAfterRace.value, 1);
  result = await request("/company/shortlist");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.some((matching: { id: string }) => matching.id === matchingAId), true);

  let recruitmentNotifications = await db
    .select()
    .from(notificationsTable)
    .where(and(inArray(notificationsTable.userId, [companyAId, strongMemberId]), eq(notificationsTable.type, "recruitment")));
  assert.equal(recruitmentNotifications.length, 2);
  assert.equal(recruitmentNotifications.some((notification) => notification.userId === companyAId && notification.title === "Kandidat masuk shortlist"), true);
  assert.equal(recruitmentNotifications.some((notification) => notification.userId === strongMemberId && notification.title === "Profil Anda ditinjau perusahaan"), true);

  result = await request(`/company/shortlist/${matchingAId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "interview", note: "Lanjut ke tahap interview" }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.status, "interview");

  recruitmentNotifications = await db
    .select()
    .from(notificationsTable)
    .where(and(inArray(notificationsTable.userId, [companyAId, strongMemberId]), eq(notificationsTable.type, "recruitment")));
  assert.equal(recruitmentNotifications.length, 4);
  assert.equal(recruitmentNotifications.some((notification) => notification.userId === companyAId && notification.title === "Pipeline kandidat diperbarui" && notification.description.includes("interview")), true);
  assert.equal(recruitmentNotifications.some((notification) => notification.userId === strongMemberId && notification.title === "Status peluang diperbarui" && notification.description.includes("interview")), true);

  const failedPipelineUpdate = await request(`/company/shortlist/${matchingAId}`, {
    method: "PATCH",
    headers: { "x-test-fail-notification": "true" },
    body: JSON.stringify({ status: "placed", note: "Uji rollback notifikasi" }),
  });
  assert.equal(failedPipelineUpdate.response.status, 500);
  assert.equal(failedPipelineUpdate.body.error, "Terjadi kesalahan pada server.");

  const [matchingAfterNotificationFailure] = await db
    .select()
    .from(matchingsTable)
    .where(eq(matchingsTable.id, matchingAId))
    .limit(1);
  assert.equal(matchingAfterNotificationFailure.status, "interview");
  const recruitmentNotificationsAfterFailure = await db
    .select()
    .from(notificationsTable)
    .where(and(inArray(notificationsTable.userId, [companyAId, strongMemberId]), eq(notificationsTable.type, "recruitment")));
  assert.equal(recruitmentNotificationsAfterFailure.length, 4);
  console.log("pipeline transaction rollback integration assertions passed");

  actor = await loadUser(adminId);
  result = await request("/admin/funnel");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.metrics.length, 8);
  assert.deepEqual(
    result.body.metrics.map((metric: { key: string }) => metric.key),
    ["registrations", "completedDiagnostics", "paidParticipants", "activeTalent", "openCompanyRequirements", "matchingRecords", "shortlistPipeline", "placements"],
  );
  assert.equal(result.body.metrics.every((metric: { value: unknown; definition: unknown }) => typeof metric.value === "number" && typeof metric.definition === "string" && metric.definition.length > 0), true);
  assert.equal(result.body.metrics.some((metric: Record<string, unknown>) => ["id", "memberUserId", "companyUserId", "candidateUserId"].some((key) => key in metric)), false);
  assert.match(
    result.body.metrics.find((metric: { key: string }) => metric.key === "paidParticipants").definition,
    /anggota unik/,
  );
  const [registrationCount, diagnosticCount, paidCount, activeTalentCount, openRequirementCount, matchingCount, shortlistCount, placementCount] = await Promise.all([
    db.select({ value: count(usersTable.id) }).from(usersTable).where(eq(usersTable.role, "member")),
    db.select({ value: count(readinessDiagnosticsTable.id) }).from(readinessDiagnosticsTable),
    db
      .select({ value: countDistinct(enrollmentsTable.memberUserId) })
      .from(transactionsTable)
      .innerJoin(enrollmentsTable, eq(transactionsTable.referenceId, enrollmentsTable.id))
      .where(and(eq(transactionsTable.kind, "program"), eq(transactionsTable.status, "paid"))),
    db.select({ value: count(professionalPassportsTable.id) }).from(professionalPassportsTable).innerJoin(memberProfilesTable, eq(memberProfilesTable.userId, professionalPassportsTable.memberUserId)).where(and(eq(memberProfilesTable.dataConsent, true), inArray(professionalPassportsTable.availabilityStatus, ["available", "open_to_offer"]))),
    db.select({ value: count(companyRequirementsTable.id) }).from(companyRequirementsTable).where(eq(companyRequirementsTable.status, "open")),
    db.select({ value: count(matchingsTable.id) }).from(matchingsTable),
    db.select({ value: count(matchingsTable.id) }).from(matchingsTable).where(inArray(matchingsTable.status, ["shortlisted", "interview"])),
    db.select({ value: count(matchingsTable.id) }).from(matchingsTable).where(eq(matchingsTable.status, "placed")),
  ]);
  assert.deepEqual(
    result.body.metrics.map((metric: { value: number }) => metric.value),
    [registrationCount[0]?.value, diagnosticCount[0]?.value, paidCount[0]?.value, activeTalentCount[0]?.value, openRequirementCount[0]?.value, matchingCount[0]?.value, shortlistCount[0]?.value, placementCount[0]?.value],
  );
  result = await request(`/admin/matchings?requirementId=${requirementAId}&minScore=90&page=1&pageSize=10&refresh=true`);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.total, 1);
  assert.equal(result.body.items[0].candidateId, strongPassportId);
  assert.equal(result.body.items[0].requirementId, requirementAId);
  assert.equal(result.body.items[0].requirementTitle, "Security Engineer");
  assert.equal(result.body.items[0].companyName, "PT Company A");
  assert.equal(["memberUserId", "clerkUserId", "companyUserId", "consentVersion"].some((key) => key in result.body.items[0]), false);
  result = await request(`/admin/matchings/${matchingAId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "review", note: "Tinjauan admin yang aman" }),
  });
  assert.equal(result.response.status, 200);
  assert.equal("candidateUserId" in result.body, false);
  result = await request("/admin/operations");
  assert.equal(result.response.status, 200);
  const activeAdminMatching = result.body.matchings.find((matching: { id: string }) => matching.id === matchingAId);
  assert.ok(activeAdminMatching);
  assert.equal("candidateUserId" in activeAdminMatching, false);
  result = await request("/admin/talent-pool/settings");
  assert.equal(result.response.status, 200);
  const currentDuration = result.body.defaultDurationDays as number;
  result = await request("/admin/talent-pool/settings", {
    method: "PATCH",
    body: JSON.stringify({ defaultDurationDays: currentDuration, note: "Verifikasi konfigurasi consent" }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.defaultDurationDays, currentDuration);

  result = await request(`/admin/talent-pool?companyId=${companyAId}&consent=active&page=1&pageSize=2`);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.total, 3);
  assert.equal(result.body.items.length, 2);
  assert.equal(result.body.items.every((item: { companyUserId: string }) => item.companyUserId === companyAId), true);

  const overriddenExpiry = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
  result = await request(`/admin/talent-pool/consents/${partialConsentAId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "set_expiry", expiresAt: overriddenExpiry.toISOString(), note: "Perpanjang untuk pengujian governance" }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.consentVersion, 2);
  assert.equal(new Date(result.body.expiresAt).getTime(), overriddenExpiry.getTime());

  const firstAdminRevoke = await request(`/admin/talent-pool/consents/${privateConsentAId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "revoke", note: "Tidak lagi diperlukan" }),
  });
  const repeatedAdminRevoke = await request(`/admin/talent-pool/consents/${privateConsentAId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "revoke", note: "Retry yang harus idempotent" }),
  });
  assert.equal(firstAdminRevoke.response.status, 200);
  assert.equal(repeatedAdminRevoke.response.status, 200);
  assert.equal(firstAdminRevoke.body.consentVersion, 2);
  assert.equal(repeatedAdminRevoke.body.consentVersion, 2);
  const adminRevokeAudits = await db.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityId, privateConsentAId), eq(auditLogsTable.action, "talent_consent.admin_revoked")));
  assert.equal(adminRevokeAudits.length, 1);

  await db.update(companyTalentConsentsTable).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(companyTalentConsentsTable.id, partialConsentAId));
  actor = await loadUser(companyAId);
  result = await request("/company/talent-pool");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.items.some((candidate: { id: string }) => candidate.id === partialPassportId), false);
  result = await request(`/company/talent-pool/matches?requirementId=${requirementAId}`);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.items.some((candidate: { candidateId: string }) => candidate.candidateId === partialPassportId), false);
  const [expiredConsent] = await db.select().from(companyTalentConsentsTable).where(eq(companyTalentConsentsTable.id, partialConsentAId)).limit(1);
  assert.equal(expiredConsent.status, "expired");
  assert.ok(expiredConsent.expiredAt);
  const expiryAudits = await db.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityId, partialConsentAId), eq(auditLogsTable.action, "talent_consent.expired")));
  assert.equal(expiryAudits.length, 1);
  const expiryNotifications = await db.select().from(notificationsTable).where(and(inArray(notificationsTable.userId, [companyAId, partialMemberId]), eq(notificationsTable.type, "consent")));
  assert.equal(expiryNotifications.filter((notification) => notification.title === "Akses perusahaan telah kedaluwarsa" || notification.title === "Persetujuan kandidat telah berakhir").length, 2);
  actor = await loadUser(partialMemberId);
  result = await request(`/member/passport/consents/${partialConsentAId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "revoke", note: "Retry setelah masa berlaku habis" }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.status, "expired");
  assert.equal(result.body.consentVersion, 3);
  const repeatedExpiryAudits = await db.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityId, partialConsentAId), eq(auditLogsTable.action, "talent_consent.expired")));
  assert.equal(repeatedExpiryAudits.length, 1);

  actor = await loadUser(companyBId);
  result = await request("/company/requirements");
  assert.equal(result.response.status, 200);
  assert.deepEqual(
    result.body.map((requirement: { id: string }) => requirement.id),
    [requirementBId],
  );
  result = await request("/company/talent-pool");
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.items.map((candidate: { id: string }) => candidate.id), [strongPassportId]);

  result = await request("/company/talent-pool/consent-requests?page=1&pageSize=1&status=active");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.page, 1);
  assert.equal(result.body.pageSize, 1);
  assert.equal(result.body.total, 1);
  assert.equal(result.body.items[0].passportSlug, `strong-security-${suffix}`);

  const concurrentRequests = await Promise.all([
    requestAs(partialMemberId, "/member/passport/consents", {
      method: "POST",
      body: JSON.stringify({ companyId: companyBId, note: "Grant bersamaan" }),
    }),
    requestAs(companyBId, "/company/talent-pool/consent-requests", {
      method: "POST",
      body: JSON.stringify({ passportSlug: `partial-security-${suffix}`, note: "Permintaan bersamaan" }),
    }),
  ]);
  assert.equal(concurrentRequests[0].response.status, 201);
  assert.equal(concurrentRequests[1].response.status, 201);
  assert.equal(concurrentRequests[0].body.id, concurrentRequests[1].body.id);
  const [concurrentFinal] = await db.select().from(companyTalentConsentsTable).where(eq(companyTalentConsentsTable.id, concurrentRequests[0].body.id)).limit(1);
  assert.equal(concurrentFinal.status, "active");
  const concurrentAudits = await db.select().from(auditLogsTable).where(eq(auditLogsTable.entityId, concurrentFinal.id));
  assert.equal(concurrentAudits.length, concurrentFinal.consentVersion);

  result = await request("/company/talent-pool/consent-requests", {
    method: "POST",
    body: JSON.stringify({ passportSlug: `private-security-${suffix}` }),
  });
  assert.equal(result.response.status, 404);

  actor = await loadUser(strongMemberId);
  await db.update(companyTalentConsentsTable).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(companyTalentConsentsTable.id, strongConsentAId));
  result = await request("/member/passport/consents", {
    method: "POST",
    body: JSON.stringify({ companyId: companyAId, note: "Aktifkan kembali setelah expiry" }),
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.body.status, "active");
  assert.equal(result.body.consentVersion, 3);
  assert.equal(result.body.history[0].toStatus, "active");
  assert.equal(result.body.history[1].toStatus, "expired");
  const [strongExpiryAudit] = await db.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityId, strongConsentAId), eq(auditLogsTable.action, "talent_consent.expired"))).limit(1);
  assert.equal(strongExpiryAudit.actorUserId, null);
  assert.equal(strongExpiryAudit.actorRole, "system");

  result = await request(`/member/passport/consents/${strongConsentAId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "revoke", note: "Akses Company A selesai" }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.status, "revoked");
  assert.equal(result.body.history[0].toStatus, "revoked");

  actor = await loadUser(companyAId);
  result = await request("/company/talent-pool");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.items.some((candidate: { id: string }) => candidate.id === strongPassportId), false);
  result = await request(`/company/talent-pool/matches?requirementId=${requirementAId}`);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.items.some((candidate: { candidateId: string }) => candidate.candidateId === strongPassportId), false);
  result = await request("/company/shortlist");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.some((matching: { id: string }) => matching.id === matchingAId), false);

  actor = await loadUser(adminId);
  result = await request("/admin/operations");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.matchings.some((matching: { id: string }) => matching.id === matchingAId), false);
  result = await request(`/admin/matchings/${matchingAId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "interview", note: "Tidak boleh setelah revoke" }),
  });
  assert.equal(result.response.status, 404);

  actor = await loadUser(companyBId);
  result = await request("/company/talent-pool");
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.items.map((candidate: { id: string }) => candidate.id).sort(), [strongPassportId, partialPassportId].sort());

  console.log("company security integration tests passed");
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.transaction(async (tx) => {
    await tx.delete(auditLogsTable).where(or(
      inArray(auditLogsTable.actorUserId, [adminId, companyAId, companyBId, strongMemberId, partialMemberId, privateMemberId]),
      inArray(auditLogsTable.entityId, [strongConsentAId, partialConsentAId, privateConsentAId]),
    ));
    await tx.delete(notificationsTable).where(inArray(notificationsTable.userId, [adminId, companyAId, companyBId, strongMemberId, partialMemberId, privateMemberId]));
    if (originalConsentSettings) {
      await tx.update(talentConsentSettingsTable).set({
        defaultDurationDays: originalConsentSettings.defaultDurationDays,
        updatedBy: originalConsentSettings.updatedBy,
        updatedAt: originalConsentSettings.updatedAt,
      }).where(eq(talentConsentSettingsTable.id, originalConsentSettings.id));
    } else {
      await tx.delete(talentConsentSettingsTable).where(eq(talentConsentSettingsTable.updatedBy, adminId));
    }
    await tx.delete(matchingsTable).where(inArray(matchingsTable.companyUserId, [companyAId, companyBId]));
    await tx.delete(companyTalentConsentsTable).where(inArray(companyTalentConsentsTable.companyUserId, [companyAId, companyBId]));
    await tx.delete(memberEvidenceTable).where(inArray(memberEvidenceTable.memberUserId, [strongMemberId, partialMemberId, privateMemberId]));
    await tx.delete(readinessDiagnosticsTable).where(inArray(readinessDiagnosticsTable.memberUserId, [strongMemberId, partialMemberId, privateMemberId]));
    await tx.delete(professionalPassportsTable).where(inArray(professionalPassportsTable.memberUserId, [strongMemberId, partialMemberId, privateMemberId]));
    await tx.delete(memberProfilesTable).where(inArray(memberProfilesTable.userId, [strongMemberId, partialMemberId, privateMemberId]));
    await tx.delete(companyRequirementsTable).where(inArray(companyRequirementsTable.id, [requirementAId, requirementBId]));
    await tx.delete(companyProfilesTable).where(inArray(companyProfilesTable.userId, [companyAId, companyBId]));
    await tx.delete(usersTable).where(inArray(usersTable.id, [adminId, companyAId, companyBId, strongMemberId, partialMemberId, privateMemberId]));
  });
}