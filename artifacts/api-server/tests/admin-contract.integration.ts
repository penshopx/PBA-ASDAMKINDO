import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  CreateAdminProgramResponse,
  CreateAdminPilotFeedbackResponse,
  CreateCompanyRequirementResponse,
  CreateCompanyShortlistResponse,
  DecideVerificationResponse,
  GetAdminDashboardResponse,
  GetAdminFunnelResponse,
  GetAdminOperationsResponse,
  GetAdminPilotEvaluationOptionsResponse,
  GetAdminPilotEvaluationResponse,
  GetAdminTalentConsentSettingsResponse,
  GetAdminTalentPoolResponse,
  GetCompanyDashboardResponse,
  GetCompanyTalentPoolResponse,
  GetCurrentUserResponse,
  GetMemberDashboardResponse,
  GetMemberJourneyResponse,
  GetMemberPassportResponse,
  GetPublicPassportResponse,
  GrantMemberCompanyConsentResponse,
  IngestAdminTransactionSettlementResponse,
  ListAdminAuditLogsResponse,
  ListAdminMatchingsResponse,
  ListAdminPilotFeedbackResponse,
  ListCompanyConsentRequestsResponse,
  ListCompanyRequirementsResponse,
  ListCompanyShortlistResponse,
  ListCompanyTalentPoolResponse,
  ListMemberCompaniesResponse,
  ListNotificationsResponse,
  ListProgramsResponse,
  MarkNotificationReadResponse,
  RequestCompanyTalentConsentResponse,
  ResolveAdminSettlementIngestFailureResponse,
  ResolveAdminPilotFeedbackResponse,
  ResolveAdminTransactionReconciliationResponse,
  SaveCompanyOnboardingResponse,
  SaveMemberDiagnosticResponse,
  SaveMemberEvidenceResponse,
  SaveMemberOnboardingResponse,
  UpdateAdminEnrollmentResponse,
  UpdateAdminMatchingResponse,
  UpdateAdminProgramResponse,
  UpdateAdminTransactionResponse,
  UpdateCompanyRequirementResponse,
  UpdateCompanyShortlistResponse,
  UpdateMemberCompanyConsentResponse,
  UpdateMemberEvidenceResponse,
  UpdateMemberPassportResponse,
  HealthCheckResponse,
} from "@workspace/api-zod";
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
  settlementIngestFailuresTable,
  transactionsTable,
  usersTable,
  verificationsTable,
  type User,
} from "@workspace/db";
import type { AuthenticatedRequest } from "../src/lib/auth";
import apiRouter from "../src/routes";

const suffix = randomUUID();
const adminId = `admin-contract-admin-${suffix}`;
const superAdminId = `admin-contract-super-${suffix}`;
const companyId = `admin-contract-company-${suffix}`;
const memberId = `admin-contract-member-${suffix}`;
const onboardingMemberId = `admin-contract-onboarding-member-${suffix}`;
const companyProfileId = `admin-contract-company-profile-${suffix}`;
const memberProfileId = `admin-contract-member-profile-${suffix}`;
const passportId = `admin-contract-passport-${suffix}`;
const requirementId = `admin-contract-requirement-${suffix}`;
const evidenceId = `admin-contract-evidence-${suffix}`;
const verificationId = `admin-contract-verification-${suffix}`;
const programId = `admin-contract-program-${suffix}`;
const enrollmentId = `admin-contract-enrollment-${suffix}`;
const matchingId = `admin-contract-matching-${suffix}`;
const settlementTransactionId = `admin-contract-settlement-${suffix}`;
const reconciliationTransactionId = `admin-contract-reconciliation-${suffix}`;
const failureIds = new Set<string>();
const contractEvidenceIds = new Set<string>();
const contractRequirementIds = new Set<string>();
let actor: User;
let createdProgramId: string | undefined;

type ApiRouteLayer = {
  handle?: {
    stack?: ApiRouteLayer[];
  };
  route?: {
    path?: string;
    methods?: Record<string, boolean>;
  };
};

const contractAssertions = new Set<string>();

function canonicalRoutePath(path: string) {
  return path
    .split("/")
    .map((segment) => (segment.startsWith(":") ? ":param" : segment))
    .join("/");
}

function apiRouteLayers(
  router: { stack?: ApiRouteLayer[] },
  visited = new Set<object>(),
): ApiRouteLayer[] {
  if (visited.has(router)) return [];
  visited.add(router);

  return (router.stack ?? []).flatMap((layer) => [
    ...(layer.route ? [layer] : []),
    ...(layer.handle?.stack ? apiRouteLayers(layer.handle, visited) : []),
  ]);
}

type RouteGroup = {
  name: string;
  matches: (path: string) => boolean;
};

const routeGroups: RouteGroup[] = [
  { name: "health", matches: (path) => path === "/healthz" },
  {
    name: "identity",
    matches: (path) => path === "/me" || path.startsWith("/onboarding/"),
  },
  { name: "programs", matches: (path) => path === "/programs" },
  {
    name: "notifications",
    matches: (path) => path === "/notifications" || path.startsWith("/notifications/"),
  },
  { name: "dashboards", matches: (path) => path.startsWith("/dashboard/") },
  { name: "admin", matches: (path) => path === "/admin" || path.startsWith("/admin/") },
  {
    name: "member-journey",
    matches: (path) =>
      path === "/member/journey" ||
      path === "/member/diagnostics" ||
      path === "/member/evidence" ||
      path.startsWith("/member/evidence/") ||
      path.startsWith("/member/programs/"),
  },
  {
    name: "passport",
    matches: (path) =>
      path === "/member/passport" ||
      path.startsWith("/member/passport/") ||
      path === "/member/companies" ||
      path === "/passport" ||
      path.startsWith("/passport/") ||
      path === "/company/talent-pool" ||
      path.startsWith("/company/talent-pool/consent-requests"),
  },
  {
    name: "company",
    matches: (path) =>
      path === "/company/talent-pool/matches" ||
      path === "/company/requirements" ||
      path.startsWith("/company/requirements/") ||
      path === "/company/shortlist" ||
      path.startsWith("/company/shortlist/"),
  },
];

function apiRouteInventory(matches: (path: string) => boolean = () => true) {
  return new Set(
    apiRouteLayers(apiRouter as unknown as { stack?: ApiRouteLayer[] }).flatMap((layer) => {
      const path = layer.route?.path;
      if (!path || !matches(path) || !layer.route.methods) {
        return [];
      }
      return Object.entries(layer.route.methods)
        .filter(([, enabled]) => enabled)
        .map(([method]) => `${method.toUpperCase()} ${canonicalRoutePath(path)}`);
    }),
  );
}

function routeMatchesPath(routePath: string, requestPath: string) {
  const routeSegments = routePath.split("/").filter(Boolean);
  const requestSegments = requestPath.split("/").filter(Boolean);
  return (
    routeSegments.length === requestSegments.length &&
    routeSegments.every(
      (segment, index) =>
        segment.startsWith(":") || segment === requestSegments[index],
    )
  );
}

function trackContractAssertion(path: string, init?: RequestInit) {
  const pathname = new URL(path, "http://admin-contract.test").pathname;
  const method = (init?.method ?? "GET").toLowerCase();
  const matchedRoute = apiRouteLayers(
    apiRouter as unknown as { stack?: ApiRouteLayer[] },
  ).find((layer) => {
    const route = layer.route;
    return (
      typeof route?.path === "string" &&
      route.methods?.[method] === true &&
      routeMatchesPath(route.path, pathname)
    );
  });
  if (matchedRoute?.route?.path) {
    contractAssertions.add(
      `${method.toUpperCase()} ${canonicalRoutePath(matchedRoute.route.path)}`,
    );
  }
}

function assertApiContractCoverage() {
  const inventory = apiRouteInventory();
  assert.ok(
    inventory.size > 0,
    "API route inventory is empty; the contract test could not inspect the registered router.",
  );
  const groupedInventory = new Set<string>();
  for (const group of routeGroups) {
    const groupInventory = apiRouteInventory(group.matches);
    assert.ok(
      groupInventory.size > 0,
      `${group.name} route inventory is empty; add the router group to the contract inventory.`,
    );
    for (const route of groupInventory) groupedInventory.add(route);

    const missing = [...groupInventory]
      .filter((route) => !contractAssertions.has(route))
      .sort();
    assert.equal(
      missing.length,
      0,
      [
        `${group.name} endpoint contract coverage is incomplete.`,
        "Add a contract assertion that exercises each missing method/path.",
        ...missing.map((route) => `Missing: ${route}`),
      ].join("\n"),
    );
  }

  const unclassified = [...inventory].filter((route) => !groupedInventory.has(route)).sort();
  assert.equal(
    unclassified.length,
    0,
    [
      "API route inventory contains an unclassified method/path.",
      "Assign the route to a router group before adding its contract assertion.",
      ...unclassified.map((route) => `Unclassified: ${route}`),
    ].join("\n"),
  );

  const missing = [...inventory].filter((route) => !contractAssertions.has(route)).sort();
  const unexpected = [...contractAssertions].filter((route) => !inventory.has(route)).sort();

  assert.equal(
    missing.length,
    0,
    [
      "API endpoint contract coverage is incomplete.",
      "Add a contract assertion that exercises each missing method/path.",
      ...missing.map((route) => `Missing: ${route}`),
    ].join("\n"),
  );
  assert.equal(
    unexpected.length,
    0,
    [
      "API contract assertions reference routes that are not registered.",
      ...unexpected.map((route) => `Unexpected: ${route}`),
    ].join("\n"),
  );
}

const app = express();
app.use(express.json());
app.use(async (req: Request, _res: Response, next: NextFunction) => {
  const requestedActorId = req.header("x-test-user");
  const userId = requestedActorId ?? actor.id;
  const [requestActor] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  assert.ok(requestActor);
  const authenticated = req as AuthenticatedRequest;
  authenticated.userId = requestActor.id;
  authenticated.currentUser = requestActor;
  next();
});
app.use("/api", apiRouter);
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Endpoint tidak ditemukan." });
});
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error(`Unexpected ${req.method} ${req.path} failure`, error);
  res.status(500).json({ error: "Terjadi kesalahan pada server." });
});

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const port = (server.address() as AddressInfo).port;
const baseUrl = `http://127.0.0.1:${port}/api`;

async function request(path: string, init?: RequestInit) {
  trackContractAssertion(path, init);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const responseText = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(responseText);
  } catch {
    assert.fail(
      `${init?.method ?? "GET"} ${path} returned ${response.status} with a non-JSON body: ${responseText.slice(0, 2000)}`,
    );
  }
  return { response, body: body as Record<string, any> };
}

async function requestAs(userId: string, path: string, init?: RequestInit) {
  return request(path, {
    ...init,
    headers: { ...init?.headers, "x-test-user": userId },
  });
}


async function assertJsonError(
  path: string,
  status: number,
  init?: RequestInit,
) {
  const result = await request(path, init);
  assert.equal(result.response.status, status);
  assert.equal(typeof result.body, "object");
  assert.equal(typeof result.body.error, "string");
  assert.ok(result.body.error.length > 0);
  return result;
}

async function assertContract(
  path: string,
  status: number,
  schema: { parse: (value: unknown) => unknown },
  init?: RequestInit,
) {
  const result = await request(path, init);
  assert.equal(
    result.response.status,
    status,
    `${init?.method ?? "GET"} ${path} returned ${result.response.status}: ${JSON.stringify(result.body)}`,
  );
  schema.parse(result.body);
  return result;
}

async function assertNonAdminRouteCoverage() {
  await assertContract("/healthz", 200, HealthCheckResponse);
  await assertContract("/me", 200, GetCurrentUserResponse);
  await assertContract(
    "/onboarding/member",
    200,
    SaveMemberOnboardingResponse,
    {
      method: "POST",
      headers: { "x-test-user": onboardingMemberId },
      body: JSON.stringify({
        fullName: "Member Onboarding Contract",
        phone: "0815550001",
        domicile: "Jakarta",
        education: "S1 Teknik Sipil",
        expertise: "Manajemen proyek",
        experienceYears: 2,
        primaryGoal: "competency",
        dataConsent: true,
      }),
    },
  );
  await assertContract(
    "/onboarding/company",
    200,
    SaveCompanyOnboardingResponse,
    {
      method: "POST",
      headers: { "x-test-user": companyId },
      body: JSON.stringify({
        companyName: "PT Contract Admin",
        companyType: "Kontraktor",
        phone: "0215550000",
        businessEmail: `${companyId}@business.test`,
        address: "Jakarta",
        picName: "PIC Contract",
        picTitle: "HR Manager",
        primaryNeed: "talent",
      }),
    },
  );
  await assertContract("/programs", 200, ListProgramsResponse);

  const notificationId = `notification-contract-${suffix}`;
  await db.insert(notificationsTable).values({
    id: notificationId,
    userId: adminId,
    title: "Notifikasi kontrak",
    description: "Notifikasi untuk pemeriksaan kontrak API.",
    type: "system",
  });
  await assertContract("/notifications", 200, ListNotificationsResponse);
  await assertContract(
    `/notifications/${notificationId}/read`,
    200,
    MarkNotificationReadResponse,
    {
      method: "PATCH",
      body: JSON.stringify({}),
    },
  );

  await assertContract(
    "/dashboard/member",
    200,
    GetMemberDashboardResponse,
    { headers: { "x-test-user": memberId } },
  );
  await assertContract(
    "/dashboard/company",
    200,
    GetCompanyDashboardResponse,
    { headers: { "x-test-user": companyId } },
  );
  await assertContract("/dashboard/admin", 200, GetAdminDashboardResponse);

  await assertContract(
    "/member/journey",
    200,
    GetMemberJourneyResponse,
    { headers: { "x-test-user": memberId } },
  );
  await assertJsonError(
    `/member/programs/${programId}/enrollment`,
    409,
    {
      method: "POST",
      headers: { "x-test-user": memberId },
    },
  );
  await assertContract(
    "/member/diagnostics",
    200,
    SaveMemberDiagnosticResponse,
    {
      method: "POST",
      headers: { "x-test-user": memberId },
      body: JSON.stringify({
        answers: {
          technical: 5,
          safety: 4,
          communication: 4,
          problemSolving: 5,
          evidence: 3,
        },
      }),
    },
  );
  const evidenceResult = await assertContract(
    "/member/evidence",
    201,
    SaveMemberEvidenceResponse,
    {
      method: "POST",
      headers: { "x-test-user": memberId },
      body: JSON.stringify({
        clientRequestId: `contract-${suffix}`,
        evidenceType: "project",
        title: "Bukti kontrak API",
        description: "Bukti draft untuk validasi response kontrak.",
        referenceUrl: null,
        status: "draft",
      }),
    },
  );
  const contractEvidenceId = evidenceResult.body.id as string;
  contractEvidenceIds.add(contractEvidenceId);
  await assertContract(
    `/member/evidence/${contractEvidenceId}`,
    200,
    UpdateMemberEvidenceResponse,
    {
      method: "PATCH",
      headers: { "x-test-user": memberId },
      body: JSON.stringify({ title: "Bukti kontrak API diperbarui" }),
    },
  );

  await assertContract(
    "/member/passport",
    200,
    GetMemberPassportResponse,
    { headers: { "x-test-user": memberId } },
  );
  await assertContract(
    "/member/passport",
    200,
    UpdateMemberPassportResponse,
    {
      method: "PATCH",
      headers: { "x-test-user": memberId },
      body: JSON.stringify({ headline: "Project Engineer Contract API" }),
    },
  );
  await assertContract(
    "/member/companies",
    200,
    ListMemberCompaniesResponse,
    { headers: { "x-test-user": memberId } },
  );
  await assertContract(
    "/member/passport/consents",
    201,
    GrantMemberCompanyConsentResponse,
    {
      method: "POST",
      headers: { "x-test-user": memberId },
      body: JSON.stringify({
        companyId,
        note: "Consent valid untuk pemeriksaan kontrak.",
      }),
    },
  );
  await assertContract(
    `/member/passport/consents/admin-contract-consent-${suffix}`,
    200,
    UpdateMemberCompanyConsentResponse,
    {
      method: "PATCH",
      headers: { "x-test-user": memberId },
      body: JSON.stringify({
        action: "grant",
        note: "Consent tetap aktif untuk pemeriksaan kontrak.",
      }),
    },
  );
  await assertContract(
    `/passport/admin-contract-passport-${suffix}`,
    200,
    GetPublicPassportResponse,
  );
  await assertContract(
    "/company/talent-pool",
    200,
    GetCompanyTalentPoolResponse,
    { headers: { "x-test-user": companyId } },
  );
  await assertContract(
    "/company/talent-pool/consent-requests",
    200,
    ListCompanyConsentRequestsResponse,
    { headers: { "x-test-user": companyId } },
  );
  await assertContract(
    "/company/talent-pool/consent-requests",
    201,
    RequestCompanyTalentConsentResponse,
    {
      method: "POST",
      headers: { "x-test-user": companyId },
      body: JSON.stringify({
        passportSlug: `admin-contract-passport-${suffix}`,
        note: "Permintaan valid untuk pemeriksaan kontrak.",
      }),
    },
  );

  await assertContract(
    "/company/requirements",
    200,
    ListCompanyRequirementsResponse,
    { headers: { "x-test-user": companyId } },
  );
  const requirementResult = await assertContract(
    "/company/requirements",
    201,
    CreateCompanyRequirementResponse,
    {
      method: "POST",
      headers: { "x-test-user": companyId },
      body: JSON.stringify({
        kind: "talent",
        title: "Site Engineer Contract API",
        description: "Kebutuhan untuk validasi response kontrak.",
        location: "Jakarta",
        competencies: ["Manajemen proyek"],
        minimumSkkLevel: 4,
        minimumExperience: 3,
        headcount: 1,
        deadline: "2026-12-31",
        status: "draft",
      }),
    },
  );
  const contractRequirementId = requirementResult.body.id as string;
  contractRequirementIds.add(contractRequirementId);
  await assertContract(
    `/company/requirements/${contractRequirementId}`,
    200,
    UpdateCompanyRequirementResponse,
    {
      method: "PATCH",
      headers: { "x-test-user": companyId },
      body: JSON.stringify({ status: "open" }),
    },
  );
  await assertContract(
    `/company/talent-pool/matches?requirementId=${requirementId}`,
    200,
    ListCompanyTalentPoolResponse,
    { headers: { "x-test-user": companyId } },
  );
  await assertContract(
    "/company/shortlist",
    200,
    ListCompanyShortlistResponse,
    { headers: { "x-test-user": companyId } },
  );
  const createdShortlist = await assertContract(
    "/company/shortlist",
    200,
    CreateCompanyShortlistResponse,
    {
      method: "POST",
      headers: { "x-test-user": companyId },
      body: JSON.stringify({ requirementId, candidateId: passportId }),
    },
  );
  await assertContract(
    `/company/shortlist/${createdShortlist.body.id}`,
    200,
    UpdateCompanyShortlistResponse,
    {
      method: "PATCH",
      headers: { "x-test-user": companyId },
      body: JSON.stringify({
        status: "interview",
        note: "Kandidat masuk tahap wawancara.",
      }),
    },
  );
}

function transaction(
  id: string,
  overrides: Partial<typeof transactionsTable.$inferInsert> = {},
) {
  return {
    id,
    kind: "program",
    referenceId: `reference-${id}`,
    customerName: "Pelanggan Contract Admin",
    amount: "100.00",
    invoiceNumber: null,
    invoiceAmount: "100.00",
    feeAmount: "10.00",
    commission: "10.00",
    refundAmount: "0.00",
    settlementAmount: null,
    settlementDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    settledAt: null,
    reconciliationStatus: "pending",
    status: "pending",
    ...overrides,
  };
}

const responseTransactionFields = [
  "id",
  "kind",
  "referenceId",
  "customerName",
  "amount",
  "invoiceNumber",
  "invoiceAmount",
  "feeAmount",
  "commission",
  "refundAmount",
  "expectedSettlement",
  "settlementAmount",
  "netSettlement",
  "settlementDifference",
  "settlementDueAt",
  "settledAt",
  "reconciliationStatus",
  "reconciliationFlags",
  "reconciliationResolvedAt",
  "status",
  "occurredAt",
  "updatedAt",
];

async function loadUser(id: string) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  assert.ok(user);
  return user;
}

try {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.transaction(async (tx) => {
    await tx.insert(usersTable).values([
      {
        id: adminId,
        clerkUserId: adminId,
        name: "Admin Contract",
        email: `${adminId}@example.test`,
        role: "admin",
        onboardingComplete: true,
      },
      {
        id: superAdminId,
        clerkUserId: superAdminId,
        name: "Super Admin Contract",
        email: `${superAdminId}@example.test`,
        role: "super_admin",
        onboardingComplete: true,
      },
      {
        id: companyId,
        clerkUserId: companyId,
        name: "Company Contract",
        email: `${companyId}@example.test`,
        role: "company",
        onboardingComplete: true,
        organization: "PT Contract Admin",
      },
      {
        id: memberId,
        clerkUserId: memberId,
        name: "Member Contract",
        email: `${memberId}@example.test`,
        role: "member",
        onboardingComplete: true,
      },
      {
        id: onboardingMemberId,
        clerkUserId: onboardingMemberId,
        name: "Member Onboarding Contract",
        email: `${onboardingMemberId}@example.test`,
        role: "member",
        onboardingComplete: false,
      },
    ]);
    await tx.insert(companyProfilesTable).values({
      id: companyProfileId,
      userId: companyId,
      companyName: "PT Contract Admin",
      companyType: "Kontraktor",
      phone: "0215550000",
      businessEmail: `${companyId}@business.test`,
      address: "Jakarta",
      picName: "PIC Contract",
      picTitle: "HR Manager",
      primaryNeed: "talent",
    });
    await tx.insert(memberProfilesTable).values({
      id: memberProfileId,
      userId: memberId,
      phone: "0815550000",
      domicile: "Jakarta",
      education: "S1 Teknik Sipil",
      jobTitle: "Project Engineer",
      expertise: "BIM, Manajemen proyek",
      skkLevel: 6,
      experienceYears: 6,
      primaryGoal: "competency",
      dataConsent: true,
    });
    await tx.insert(professionalPassportsTable).values({
      id: passportId,
      memberUserId: memberId,
      slug: `admin-contract-passport-${suffix}`,
      isPublic: true,
      headline: "Project Engineer Contract",
      preferredRoles: ["Project Engineer"],
      preferredLocations: ["Jakarta"],
      availabilityStatus: "available",
    });
    await tx.insert(companyRequirementsTable).values({
      id: requirementId,
      companyUserId: companyId,
      kind: "talent",
      title: "Project Engineer Contract",
      description: "Kebutuhan untuk contract test.",
      location: "Jakarta",
      competencies: ["BIM"],
      minimumSkkLevel: 4,
      minimumExperience: 2,
      headcount: 1,
      deadline: "2026-12-31",
      status: "open",
    });
    await tx.insert(companyTalentConsentsTable).values({
      id: `admin-contract-consent-${suffix}`,
      memberUserId: memberId,
      companyUserId: companyId,
      scope: "talent_pool",
      status: "active",
      grantedAt: new Date(),
      expiresAt: future,
      grantedBy: memberId,
    });
    await tx.insert(memberEvidenceTable).values({
      id: evidenceId,
      memberUserId: memberId,
      evidenceType: "certification",
      title: "Sertifikat Contract Admin",
      status: "submitted",
    });
    await tx.insert(verificationsTable).values({
      id: verificationId,
      subjectType: "competency",
      subjectId: evidenceId,
      subjectName: "Sertifikat Contract Admin",
      evidenceType: "certificate",
      status: "pending",
      submittedByUserId: memberId,
    });
    await tx.insert(programsTable).values({
      id: programId,
      name: "Program Contract Admin",
      category: "Bimtek",
      mode: "hybrid",
      schedule: "Sabtu",
      duration: "4 minggu",
      price: "100.00",
      instructor: "Instruktur Contract",
      description: "Program fixture untuk contract test.",
      status: "published",
      capacity: 20,
    });
    await tx.insert(enrollmentsTable).values({
      id: enrollmentId,
      programId,
      memberUserId: memberId,
      memberName: "Member Contract",
      status: "pending",
    });
    await tx.insert(matchingsTable).values({
      id: matchingId,
      requirementId,
      passportId,
      companyUserId: companyId,
      requirement: "Project Engineer Contract",
      companyName: "PT Contract Admin",
      candidateUserId: memberId,
      candidateName: "Member Contract",
      score: 82,
      status: "review",
    });
    await tx.insert(transactionsTable).values([
      transaction(settlementTransactionId),
      transaction(reconciliationTransactionId, {
        settlementAmount: "70.00",
        settledAt: new Date(),
        reconciliationStatus: "pending",
        status: "paid",
      }),
    ]);
  });

  actor = await loadUser(adminId);

  let result = await request("/admin/pilot-evaluation/options", {
    headers: { "x-test-user": memberId },
  });
  assert.equal(result.response.status, 403);

  result = await request("/admin/pilot-evaluation/options");
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  GetAdminPilotEvaluationOptionsResponse.parse(result.body);
  assert.ok(result.body.programs.some((program: { id: string }) => program.id === programId));
  assert.ok(
    result.body.requirements.some(
      (requirement: { id: string }) => requirement.id === requirementId,
    ),
  );

  result = await request(
    `/admin/pilot-evaluation?programId=${programId}&requirementId=${requirementId}`,
  );
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  GetAdminPilotEvaluationResponse.parse(result.body);
  assert.equal(result.body.cohort.programName, "Program Contract Admin");
  assert.equal(result.body.cohort.requirementTitle, "Project Engineer Contract");

  result = await request("/admin/pilot-feedback", {
    method: "POST",
    body: JSON.stringify({
      programId,
      requirementId,
      note: "Kendala akses materi contract test",
    }),
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  CreateAdminPilotFeedbackResponse.parse(result.body);
  assert.deepEqual(result.body, { status: "recorded" });

  result = await request(
    `/admin/pilot-feedback?programId=${programId}&requirementId=${requirementId}`,
  );
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  ListAdminPilotFeedbackResponse.parse(result.body);
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0].status, "open");
  const feedbackId = result.body[0].id as string;

  result = await request(`/admin/pilot-feedback/${feedbackId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "resolved",
      note: "Kendala contract test sudah selesai",
    }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  ResolveAdminPilotFeedbackResponse.parse(result.body);
  assert.deepEqual(result.body, { status: "resolved" });

  result = await request("/admin/talent-pool/settings");
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  GetAdminTalentConsentSettingsResponse.parse(result.body);

  await assertJsonError("/admin/talent-pool/settings", 400, {
    method: "PATCH",
    body: JSON.stringify({ defaultDurationDays: 0 }),
  });

  result = await request(
    `/admin/talent-pool?companyId=${companyId}&consent=active&page=1&pageSize=10`,
  );
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  GetAdminTalentPoolResponse.parse(result.body);
  assert.equal(result.body.total, 1);
  assert.equal(result.body.items[0].id, `admin-contract-consent-${suffix}`);

  await assertJsonError(
    `/admin/talent-pool/consents/consent-tidak-ada-${suffix}`,
    404,
    {
      method: "PATCH",
      body: JSON.stringify({
        action: "revoke",
        note: "Consent contract tidak ditemukan",
      }),
    },
  );

  result = await request("/admin/funnel");
  assert.equal(result.response.status, 200);
  GetAdminFunnelResponse.parse(result.body);
  assert.deepEqual(
    result.body.metrics.map((metric: { key: string }) => metric.key),
    [
      "registrations",
      "completedDiagnostics",
      "paidParticipants",
      "activeTalent",
      "openCompanyRequirements",
      "matchingRecords",
      "shortlistPipeline",
      "placements",
    ],
  );

  result = await request(
    `/admin/matchings?requirementId=${requirementId}&page=1&pageSize=10`,
  );
  assert.equal(result.response.status, 200);
  ListAdminMatchingsResponse.parse(result.body);
  assert.equal(result.body.total, 1);
  assert.equal(result.body.items[0].candidateId, passportId);
  assert.equal(result.body.items[0].requirementId, requirementId);

  result = await request("/admin/operations");
  assert.equal(result.response.status, 200);
  GetAdminOperationsResponse.parse(result.body);
  assert.deepEqual(
    Object.keys(result.body).sort(),
    [
      "auditLogs",
      "enrollments",
      "matchings",
      "permissions",
      "programs",
      "settlementIngestFailures",
      "summary",
      "transactions",
      "verificationSlaWorker",
      "verifications",
    ],
  );
  assert.ok(result.body.programs.some((program: { id: string }) => program.id === programId));
  assert.ok(
    result.body.enrollments.some(
      (enrollment: { id: string }) => enrollment.id === enrollmentId,
    ),
  );
  assert.ok(
    result.body.verifications.some(
      (verification: { id: string }) => verification.id === verificationId,
    ),
  );

  result = await request("/admin/audit-logs");
  assert.equal(result.response.status, 403);
  result = await requestAs(superAdminId, "/admin/audit-logs");
  assert.equal(result.response.status, 200);
  ListAdminAuditLogsResponse.parse(result.body);
  assert.ok(Array.isArray(result.body));

  result = await request("/admin/programs", {
    headers: { "x-test-user": superAdminId },
    method: "POST",
    body: JSON.stringify({
      name: "Program Baru Contract",
      category: "Bimtek",
      mode: "online",
      schedule: "Minggu",
      duration: "2 minggu",
      price: 250,
      instructor: "Instruktur Baru",
      description: "Program yang dibuat lewat endpoint admin.",
      status: "draft",
      capacity: 15,
    }),
  });
  assert.equal(result.response.status, 201);
  CreateAdminProgramResponse.parse(result.body);
  assert.equal(result.body.enrolledCount, 0);
  assert.equal(result.body.completedCount, 0);
  createdProgramId = result.body.id as string;

  result = await request(`/admin/programs/${createdProgramId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "Program Diperbarui Contract", status: "published" }),
  });
  assert.equal(result.response.status, 200);
  UpdateAdminProgramResponse.parse(result.body);
  assert.equal(result.body.name, "Program Diperbarui Contract");
  assert.equal(result.body.status, "published");

  result = await request(`/admin/enrollments/${enrollmentId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "enrolled", note: "Enrollment siap berjalan" }),
  });
  assert.equal(result.response.status, 200);
  UpdateAdminEnrollmentResponse.parse(result.body);
  assert.equal(result.body.id, enrollmentId);
  assert.equal(result.body.programId, programId);
  assert.equal(result.body.programName, "Program Contract Admin");
  assert.equal(result.body.status, "enrolled");
  assert.ok(result.body.enrolledAt);
  assert.equal(result.body.completedAt, null);

  result = await request(`/admin/matchings/${matchingId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "shortlisted", note: "Kandidat masuk shortlist" }),
  });
  assert.equal(result.response.status, 200);
  UpdateAdminMatchingResponse.parse(result.body);
  assert.deepEqual(Object.keys(result.body).sort(), [
    "candidateName",
    "companyName",
    "id",
    "requirement",
    "score",
    "status",
    "updatedAt",
  ]);
  assert.equal(result.body.id, matchingId);
  assert.equal(result.body.status, "shortlisted");

  result = await request(`/admin/verifications/${verificationId}/decision`, {
    method: "POST",
    body: JSON.stringify({ status: "approved", note: "Bukti memenuhi syarat" }),
  });
  assert.equal(result.response.status, 200);
  DecideVerificationResponse.parse(result.body);
  assert.equal(result.body.id, verificationId);
  assert.equal(result.body.status, "approved");
  assert.equal(result.body.slaStatus, "resolved");

  const settlementAt = new Date().toISOString();
  result = await request("/admin/transactions/settlement", {
    method: "POST",
    body: JSON.stringify({
      referenceId: `reference-${settlementTransactionId}`,
      settlementAmount: 80,
      settledAt: settlementAt,
    }),
  });
  assert.equal(result.response.status, 200);
  IngestAdminTransactionSettlementResponse.parse(result.body);
  assert.deepEqual(Object.keys(result.body).sort(), [...responseTransactionFields].sort());
  assert.equal(result.body.id, settlementTransactionId);
  assert.equal(result.body.reconciliationStatus, "matched");
  assert.equal(result.body.settlementAmount, 80);

  result = await request(`/admin/transactions/${settlementTransactionId}`, {
    method: "PATCH",
    headers: { "x-test-user": superAdminId },
    body: JSON.stringify({ status: "paid", note: "Pembayaran dikonfirmasi" }),
  });
  assert.equal(result.response.status, 200);
  UpdateAdminTransactionResponse.parse(result.body);
  assert.deepEqual(Object.keys(result.body).sort(), [...responseTransactionFields].sort());
  assert.equal(result.body.status, "paid");

  result = await request(
    `/admin/transactions/${reconciliationTransactionId}/reconciliation`,
    {
      method: "PATCH",
      headers: { "x-test-user": superAdminId },
      body: JSON.stringify({ note: "Selisih direkonsiliasi" }),
    },
  );
  assert.equal(result.response.status, 200);
  ResolveAdminTransactionReconciliationResponse.parse(result.body);
  assert.deepEqual(Object.keys(result.body).sort(), [...responseTransactionFields].sort());
  assert.equal(result.body.id, reconciliationTransactionId);
  assert.equal(result.body.reconciliationStatus, "resolved");

  result = await request("/admin/transactions/settlement", {
    method: "POST",
    body: JSON.stringify({
      referenceId: `missing-reference-${suffix}`,
      settlementAmount: 80,
      settledAt: settlementAt,
    }),
  });
  assert.equal(result.response.status, 404);
  const [failure] = await db
    .select()
    .from(settlementIngestFailuresTable)
    .where(eq(settlementIngestFailuresTable.failureCode, "transaction_not_found"))
    .orderBy(desc(settlementIngestFailuresTable.lastSeenAt));
  assert.ok(failure);
  failureIds.add(failure.id);

  result = await request(`/admin/settlement-ingest-failures/${failure.id}`, {
    method: "PATCH",
    headers: { "x-test-user": superAdminId },
    body: JSON.stringify({ note: "Failure ditinjau dan ditutup" }),
  });
  assert.equal(result.response.status, 200);
  ResolveAdminSettlementIngestFailureResponse.parse(result.body);
  assert.equal(result.body.id, failure.id);
  assert.equal(result.body.status, "resolved");

  await assertJsonError("/admin/does-not-exist", 404);
  await assertJsonError(`/admin/programs/program-tidak-ada-${suffix}`, 404, {
    method: "PATCH",
    body: JSON.stringify({ name: "Program tidak ada" }),
  });
  await assertJsonError(`/admin/enrollments/enrollment-tidak-ada-${suffix}`, 404, {
    method: "PATCH",
    body: JSON.stringify({ status: "enrolled" }),
  });
  await assertJsonError(`/admin/matchings/matching-tidak-ada-${suffix}`, 404, {
    method: "PATCH",
    body: JSON.stringify({ status: "review", note: "Matching tidak ada" }),
  });
  await assertJsonError(`/admin/verifications/verification-tidak-ada-${suffix}/decision`, 404, {
    method: "POST",
    body: JSON.stringify({ status: "approved", note: "Verifikasi tidak ada" }),
  });
  await assertJsonError(`/admin/transactions/transaction-tidak-ada-${suffix}`, 404, {
    method: "PATCH",
    headers: { "x-test-user": superAdminId },
    body: JSON.stringify({ status: "paid", note: "Transaksi tidak ada" }),
  });
  await assertJsonError(
    `/admin/transactions/transaction-tidak-ada-${suffix}/reconciliation`,
    404,
    {
      method: "PATCH",
      headers: { "x-test-user": superAdminId },
      body: JSON.stringify({ note: "Rekonsiliasi tidak ada" }),
    },
  );
  await assertJsonError(
    `/admin/settlement-ingest-failures/failure-tidak-ada-${suffix}`,
    404,
    {
      method: "PATCH",
      headers: { "x-test-user": superAdminId },
      body: JSON.stringify({ note: "Failure tidak ada" }),
    },
  );
  await assertJsonError("/admin/programs", 400, {
    method: "POST",
    body: JSON.stringify({ name: "Tidak lengkap" }),
  });

  await assertNonAdminRouteCoverage();
  assertApiContractCoverage();
  console.log("API contract integration tests passed");
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.transaction(async (tx) => {
    const userIds = [
      adminId,
      superAdminId,
      companyId,
      memberId,
      onboardingMemberId,
    ];
    const entityIds = [
      requirementId,
      evidenceId,
      verificationId,
      programId,
      enrollmentId,
      matchingId,
      settlementTransactionId,
      reconciliationTransactionId,
      ...failureIds,
    ];
    await tx
      .delete(notificationsTable)
      .where(inArray(notificationsTable.userId, userIds));
    await tx
      .delete(auditLogsTable)
      .where(
        or(
          inArray(auditLogsTable.actorUserId, userIds),
          inArray(auditLogsTable.entityId, entityIds),
        ),
      );
    await tx
      .delete(settlementIngestFailuresTable)
      .where(inArray(settlementIngestFailuresTable.id, [...failureIds]));
    await tx
      .delete(verificationsTable)
      .where(eq(verificationsTable.id, verificationId));
    await tx
      .delete(memberEvidenceTable)
      .where(
        inArray(memberEvidenceTable.id, [evidenceId, ...contractEvidenceIds]),
      );
    await tx
      .delete(readinessDiagnosticsTable)
      .where(eq(readinessDiagnosticsTable.memberUserId, memberId));
    await tx
      .delete(matchingsTable)
      .where(eq(matchingsTable.id, matchingId));
    await tx
      .delete(companyTalentConsentsTable)
      .where(eq(companyTalentConsentsTable.companyUserId, companyId));
    await tx
      .delete(professionalPassportsTable)
      .where(eq(professionalPassportsTable.id, passportId));
    await tx
      .delete(transactionsTable)
      .where(
        inArray(transactionsTable.id, [
          settlementTransactionId,
          reconciliationTransactionId,
        ]),
      );
    await tx
      .delete(enrollmentsTable)
      .where(eq(enrollmentsTable.id, enrollmentId));
    await tx
      .delete(programsTable)
      .where(
        inArray(
          programsTable.id,
          [programId, ...(createdProgramId ? [createdProgramId] : [])],
        ),
      );
    await tx
      .delete(companyRequirementsTable)
      .where(
        inArray(companyRequirementsTable.id, [
          requirementId,
          ...contractRequirementIds,
        ]),
      );
    await tx
      .delete(memberProfilesTable)
      .where(
        inArray(memberProfilesTable.id, [
          memberProfileId,
          `${onboardingMemberId}-profile`,
        ]),
      );
    await tx
      .delete(companyProfilesTable)
      .where(eq(companyProfilesTable.id, companyProfileId));
    await tx.delete(usersTable).where(inArray(usersTable.id, userIds));
  });
}