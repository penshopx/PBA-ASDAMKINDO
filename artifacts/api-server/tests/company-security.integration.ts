import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express, { type NextFunction, type Request, type Response } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  companyProfilesTable,
  companyRequirementsTable,
  companyTalentConsentsTable,
  db,
  matchingsTable,
  memberProfilesTable,
  notificationsTable,
  professionalPassportsTable,
  readinessDiagnosticsTable,
  usersTable,
  type User,
} from "@workspace/db";
import type { AuthenticatedRequest } from "../src/lib/auth";
import companyRouter from "../src/routes/company";
import passportRouter from "../src/routes/passport";

const suffix = randomUUID();
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
let actor: User;

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  const authenticated = req as AuthenticatedRequest;
  authenticated.userId = actor.id;
  authenticated.currentUser = actor;
  next();
});
app.use("/api", passportRouter, companyRouter);

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

const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

try {
  await db.transaction(async (tx) => {
    await tx.insert(usersTable).values([
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
        expertise: "TypeScript, Security",
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
        expertise: "TypeScript",
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
        expertise: "TypeScript, Security",
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
      },
      {
        id: partialPassportId,
        memberUserId: partialMemberId,
        slug: `partial-security-${suffix}`,
        isPublic: true,
        headline: "TypeScript Engineer",
      },
      {
        id: privatePassportId,
        memberUserId: privateMemberId,
        slug: `private-security-${suffix}`,
        isPublic: true,
        headline: "Private Security Engineer",
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

    await tx.insert(companyRequirementsTable).values([
      {
        id: requirementAId,
        companyUserId: companyAId,
        kind: "talent",
        title: "Kebutuhan Security Company A",
        description: "Kebutuhan privat untuk pengujian isolasi.",
        location: "Jakarta",
        competencies: ["TypeScript", "Security"],
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
        minimumExperience: 3,
        headcount: 1,
        deadline: "2026-12-31",
        status: "open",
      },
    ]);

    await tx.insert(companyTalentConsentsTable).values([
      {
        id: `security-consent-a-strong-${suffix}`,
        memberUserId: strongMemberId,
        companyUserId: companyAId,
        scope: "talent_pool",
        status: "active",
        grantedAt: new Date(),
        expiresAt: future,
        grantedBy: strongMemberId,
      },
      {
        id: `security-consent-a-partial-${suffix}`,
        memberUserId: partialMemberId,
        companyUserId: companyAId,
        scope: "talent_pool",
        status: "active",
        grantedAt: new Date(),
        expiresAt: future,
        grantedBy: partialMemberId,
      },
      {
        id: `security-consent-a-private-${suffix}`,
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

  result = await request(`/company/requirements/${requirementBId}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "Diubah oleh Company A" }),
  });
  assert.equal(result.response.status, 404);

  result = await request(`/company/talent-pool/matches?requirementId=${requirementBId}`);
  assert.equal(result.response.status, 404);

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
    result.body.map((candidate: { candidateId: string }) => candidate.candidateId),
    [strongPassportId, partialPassportId],
  );
  const strongCandidate = result.body[0] as {
    candidateId: string;
    score: number;
    readinessScore: number;
    matchReasons: string[];
  };
  const partialCandidate = result.body[1] as {
    candidateId: string;
    score: number;
    readinessScore: number;
  };
  assert.equal(strongCandidate.candidateId, strongPassportId);
  assert.equal(strongCandidate.readinessScore, 90);
  assert.equal(strongCandidate.score, 99);
  assert.match(strongCandidate.matchReasons.join(" | "), /Kompetensi relevan: typescript, security/);
  assert.match(strongCandidate.matchReasons.join(" | "), /Pengalaman 8 tahun memenuhi minimum/);
  assert.match(strongCandidate.matchReasons.join(" | "), /Domisili sesuai area Jakarta/);
  assert.match(strongCandidate.matchReasons.join(" | "), /Readiness score 90/);
  assert.equal(partialCandidate.candidateId, partialPassportId);
  assert.equal(partialCandidate.readinessScore, 40);
  assert.equal(partialCandidate.score, 39);
  assert.equal(result.body.some((candidate: { candidateId: string }) => candidate.candidateId === privatePassportId), false);

  result = await request("/company/shortlist", {
    method: "POST",
    body: JSON.stringify({ requirementId: requirementAId, candidateId: privatePassportId }),
  });
  assert.equal(result.response.status, 404);

  result = await request("/company/shortlist", {
    method: "POST",
    body: JSON.stringify({ requirementId: requirementAId, candidateId: strongPassportId }),
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.body.status, "shortlisted");
  const matchingAId = result.body.id as string;

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

  actor = await loadUser(companyBId);
  result = await request("/company/requirements");
  assert.equal(result.response.status, 200);
  assert.deepEqual(
    result.body.map((requirement: { id: string }) => requirement.id),
    [requirementBId],
  );

  console.log("company security integration tests passed");
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.transaction(async (tx) => {
    await tx.delete(notificationsTable).where(inArray(notificationsTable.userId, [companyAId, companyBId, strongMemberId, partialMemberId, privateMemberId]));
    await tx.delete(matchingsTable).where(inArray(matchingsTable.companyUserId, [companyAId, companyBId]));
    await tx.delete(companyTalentConsentsTable).where(inArray(companyTalentConsentsTable.companyUserId, [companyAId, companyBId]));
    await tx.delete(readinessDiagnosticsTable).where(inArray(readinessDiagnosticsTable.memberUserId, [strongMemberId, partialMemberId, privateMemberId]));
    await tx.delete(professionalPassportsTable).where(inArray(professionalPassportsTable.memberUserId, [strongMemberId, partialMemberId, privateMemberId]));
    await tx.delete(memberProfilesTable).where(inArray(memberProfilesTable.userId, [strongMemberId, partialMemberId, privateMemberId]));
    await tx.delete(companyRequirementsTable).where(inArray(companyRequirementsTable.id, [requirementAId, requirementBId]));
    await tx.delete(companyProfilesTable).where(inArray(companyProfilesTable.userId, [companyAId, companyBId]));
    await tx.delete(usersTable).where(inArray(usersTable.id, [companyAId, companyBId, strongMemberId, partialMemberId, privateMemberId]));
  });
}