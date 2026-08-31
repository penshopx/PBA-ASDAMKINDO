import { randomUUID } from "node:crypto";
import process from "node:process";
import { inArray, like, or } from "drizzle-orm";
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
  passportConsentsTable,
  professionalPassportsTable,
  programProgressTable,
  programsTable,
  readinessDiagnosticsTable,
  talentConsentSettingsTable,
  transactionsTable,
  usersTable,
  verificationsTable,
} from "@workspace/db";

const args = process.argv.slice(2);
const command = args[0];
const runIdArgument = valueAfter("--run-id");
const targetArgument = valueAfter("--target");
const userIdArguments = valuesAfter("--user-id");

function valueAfter(flag: string) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function valuesAfter(flag: string) {
  return args.flatMap((argument, index) =>
    argument === flag && args[index + 1] ? [args[index + 1]] : [],
  );
}

function fail(message: string): never {
  console.error(`Pilot data tool refused: ${message}`);
  process.exit(1);
}

function assertSafeInvocation() {
  if (!["seed", "reset", "cleanup-user"].includes(command ?? "")) {
    fail("choose seed, reset, or cleanup-user.");
  }
  if (!args.includes("--allow-pilot-data") || !args.includes("--confirm-pilot")) {
    fail("pass both --allow-pilot-data and --confirm-pilot.");
  }
  if (command === "cleanup-user" && !args.includes("--confirm-delete-test-user")) {
    fail("cleanup-user requires --confirm-delete-test-user.");
  }
  if (targetArgument !== "development") {
    fail("pass --target development; every other target is denied.");
  }
  if (
    process.env.REPLIT_DEPLOYMENT ||
    process.env.REPLIT_DEPLOYMENT_ID ||
    process.env.REPLIT_DEPLOYMENT_URL
  ) {
    fail("production and deployment environments are never permitted.");
  }
  const environmentMarkers = [
    process.env.NODE_ENV,
  ].filter(Boolean).join(" ").toLowerCase();
  if (environmentMarkers.includes("production")) {
    fail("production and deployment environments are never permitted.");
  }
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is required.");
  if (!process.env.PGHOST || !process.env.PGDATABASE || !process.env.PGUSER) {
    fail("platform database identity is unavailable.");
  }
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(process.env.DATABASE_URL);
  } catch {
    fail("DATABASE_URL is invalid.");
  }
  if (
    databaseUrl.hostname !== process.env.PGHOST ||
    databaseUrl.pathname.slice(1) !== process.env.PGDATABASE ||
    decodeURIComponent(databaseUrl.username) !== process.env.PGUSER
  ) {
    fail("DATABASE_URL does not match the platform development database identity.");
  }
}

function createRunId() {
  return `pilot-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8)}`;
}

function getRunId() {
  const runId = command === "seed" ? runIdArgument ?? createRunId() : runIdArgument;
  if (!runId || !/^pilot-\d{8}-[a-z0-9]{8}$/.test(runId)) {
    fail("use a fixed-length run ID, e.g. --run-id pilot-20260101-ab12cd34.");
  }
  return runId;
}

async function resetRun(runId: string) {
  const prefix = `${runId}-`;
  const owned = (column: Parameters<typeof like>[0]) => like(column, `${prefix}%`);
  await db.transaction(async (tx) => {
    // Children and cross-domain references are removed before their owned parents.
    await tx.delete(auditLogsTable).where(or(owned(auditLogsTable.id), owned(auditLogsTable.entityId), owned(auditLogsTable.actorUserId)));
    await tx.delete(notificationsTable).where(or(owned(notificationsTable.id), owned(notificationsTable.userId)));
    await tx.delete(verificationsTable).where(or(owned(verificationsTable.id), owned(verificationsTable.subjectId), owned(verificationsTable.submittedByUserId), owned(verificationsTable.reviewedByUserId)));
    await tx.delete(matchingsTable).where(or(owned(matchingsTable.id), owned(matchingsTable.requirementId), owned(matchingsTable.companyUserId), owned(matchingsTable.candidateUserId)));
    await tx.delete(companyTalentConsentsTable).where(or(owned(companyTalentConsentsTable.id), owned(companyTalentConsentsTable.memberUserId), owned(companyTalentConsentsTable.companyUserId)));
    await tx.delete(passportConsentsTable).where(or(owned(passportConsentsTable.id), owned(passportConsentsTable.memberUserId)));
    await tx.delete(professionalPassportsTable).where(or(owned(professionalPassportsTable.id), owned(professionalPassportsTable.memberUserId)));
    await tx.delete(programProgressTable).where(or(owned(programProgressTable.id), owned(programProgressTable.memberUserId), owned(programProgressTable.programId)));
    await tx.delete(memberEvidenceTable).where(or(owned(memberEvidenceTable.id), owned(memberEvidenceTable.memberUserId)));
    await tx.delete(readinessDiagnosticsTable).where(or(owned(readinessDiagnosticsTable.id), owned(readinessDiagnosticsTable.memberUserId)));
    await tx.delete(enrollmentsTable).where(or(owned(enrollmentsTable.id), owned(enrollmentsTable.memberUserId), owned(enrollmentsTable.programId)));
    await tx.delete(transactionsTable).where(or(owned(transactionsTable.id), owned(transactionsTable.referenceId), owned(transactionsTable.reconciliationResolvedByUserId)));
    await tx.delete(companyRequirementsTable).where(or(owned(companyRequirementsTable.id), owned(companyRequirementsTable.companyUserId)));
    await tx.delete(memberProfilesTable).where(or(owned(memberProfilesTable.id), owned(memberProfilesTable.userId)));
    await tx.delete(companyProfilesTable).where(or(owned(companyProfilesTable.id), owned(companyProfilesTable.userId)));
    await tx.delete(programsTable).where(owned(programsTable.id));
    await tx.delete(usersTable).where(owned(usersTable.id));
  });
}

async function cleanupInteractiveUsers(userIds: string[]) {
  if (userIds.length === 0 || userIds.length > 10 || userIds.some((id) => !/^user_[a-zA-Z0-9_-]+$/.test(id))) {
    fail("provide between one and ten Clerk user IDs with repeated --user-id flags.");
  }
  await db.transaction(async (tx) => {
    const users = await tx.select().from(usersTable).where(inArray(usersTable.id, userIds));
    if (users.length !== userIds.length) {
      throw new Error("Every requested test user must exist in the development database.");
    }
    if (users.some((user) => user.clerkUserId !== user.id || !user.email.toLowerCase().endsWith("@example.test"))) {
      throw new Error("Cleanup is limited to Clerk-linked users with an example.test email.");
    }

    const [enrollments, requirements, matchings, evidence, passports, consents, passportConsents, diagnostics, progress, memberProfiles, companyProfiles] = await Promise.all([
      tx.select({ id: enrollmentsTable.id }).from(enrollmentsTable).where(inArray(enrollmentsTable.memberUserId, userIds)),
      tx.select({ id: companyRequirementsTable.id }).from(companyRequirementsTable).where(inArray(companyRequirementsTable.companyUserId, userIds)),
      tx.select({ id: matchingsTable.id }).from(matchingsTable).where(or(inArray(matchingsTable.companyUserId, userIds), inArray(matchingsTable.candidateUserId, userIds))),
      tx.select({ id: memberEvidenceTable.id }).from(memberEvidenceTable).where(inArray(memberEvidenceTable.memberUserId, userIds)),
      tx.select({ id: professionalPassportsTable.id }).from(professionalPassportsTable).where(inArray(professionalPassportsTable.memberUserId, userIds)),
      tx.select({ id: companyTalentConsentsTable.id }).from(companyTalentConsentsTable).where(or(
        inArray(companyTalentConsentsTable.memberUserId, userIds),
        inArray(companyTalentConsentsTable.companyUserId, userIds),
        inArray(companyTalentConsentsTable.grantedBy, userIds),
        inArray(companyTalentConsentsTable.revokedBy, userIds),
      )),
      tx.select({ id: passportConsentsTable.id }).from(passportConsentsTable).where(inArray(passportConsentsTable.memberUserId, userIds)),
      tx.select({ id: readinessDiagnosticsTable.id }).from(readinessDiagnosticsTable).where(inArray(readinessDiagnosticsTable.memberUserId, userIds)),
      tx.select({ id: programProgressTable.id }).from(programProgressTable).where(inArray(programProgressTable.memberUserId, userIds)),
      tx.select({ id: memberProfilesTable.id }).from(memberProfilesTable).where(inArray(memberProfilesTable.userId, userIds)),
      tx.select({ id: companyProfilesTable.id }).from(companyProfilesTable).where(inArray(companyProfilesTable.userId, userIds)),
    ]);
    const enrollmentIds = enrollments.map(({ id }) => id);
    const transactions = await tx
      .select({ id: transactionsTable.id, referenceId: transactionsTable.referenceId })
      .from(transactionsTable)
      .where(enrollmentIds.length
        ? or(
            inArray(transactionsTable.referenceId, enrollmentIds),
            inArray(transactionsTable.reconciliationResolvedByUserId, userIds),
          )
        : inArray(transactionsTable.reconciliationResolvedByUserId, userIds));
    const entityIds = [
      ...userIds,
      ...enrollmentIds,
      ...requirements.map(({ id }) => id),
      ...matchings.map(({ id }) => id),
      ...evidence.map(({ id }) => id),
      ...passports.map(({ id }) => id),
      ...consents.map(({ id }) => id),
      ...passportConsents.map(({ id }) => id),
      ...diagnostics.map(({ id }) => id),
      ...progress.map(({ id }) => id),
      ...memberProfiles.map(({ id }) => id),
      ...companyProfiles.map(({ id }) => id),
      ...transactions.flatMap(({ id, referenceId }) => [id, referenceId]),
    ];

    await tx.delete(auditLogsTable).where(entityIds.length
      ? or(inArray(auditLogsTable.actorUserId, userIds), inArray(auditLogsTable.entityId, entityIds))
      : inArray(auditLogsTable.actorUserId, userIds));
    await tx.delete(notificationsTable).where(inArray(notificationsTable.userId, userIds));
    await tx.delete(verificationsTable).where(or(inArray(verificationsTable.submittedByUserId, userIds), inArray(verificationsTable.reviewedByUserId, userIds)));
    await tx.delete(matchingsTable).where(or(inArray(matchingsTable.companyUserId, userIds), inArray(matchingsTable.candidateUserId, userIds)));
    await tx.delete(companyTalentConsentsTable).where(or(
      inArray(companyTalentConsentsTable.memberUserId, userIds),
      inArray(companyTalentConsentsTable.companyUserId, userIds),
      inArray(companyTalentConsentsTable.grantedBy, userIds),
      inArray(companyTalentConsentsTable.revokedBy, userIds),
    ));
    await tx.delete(passportConsentsTable).where(inArray(passportConsentsTable.memberUserId, userIds));
    await tx.delete(professionalPassportsTable).where(inArray(professionalPassportsTable.memberUserId, userIds));
    await tx.delete(programProgressTable).where(inArray(programProgressTable.memberUserId, userIds));
    await tx.delete(memberEvidenceTable).where(inArray(memberEvidenceTable.memberUserId, userIds));
    await tx.delete(readinessDiagnosticsTable).where(inArray(readinessDiagnosticsTable.memberUserId, userIds));
    if (enrollmentIds.length) {
      await tx.delete(transactionsTable).where(or(
        inArray(transactionsTable.referenceId, enrollmentIds),
        inArray(transactionsTable.reconciliationResolvedByUserId, userIds),
      ));
    } else {
      await tx.delete(transactionsTable).where(inArray(transactionsTable.reconciliationResolvedByUserId, userIds));
    }
    await tx.delete(enrollmentsTable).where(inArray(enrollmentsTable.memberUserId, userIds));
    await tx.delete(companyRequirementsTable).where(inArray(companyRequirementsTable.companyUserId, userIds));
    await tx.delete(memberProfilesTable).where(inArray(memberProfilesTable.userId, userIds));
    await tx.delete(companyProfilesTable).where(inArray(companyProfilesTable.userId, userIds));
    await tx
      .update(talentConsentSettingsTable)
      .set({ updatedBy: null, updatedAt: new Date() })
      .where(inArray(talentConsentSettingsTable.updatedBy, userIds));
    await tx.delete(usersTable).where(inArray(usersTable.id, userIds));
  });
}

async function seedRun(runId: string) {
  await resetRun(runId);
  const id = (name: string) => `${runId}-${name}`;
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const admin = id("admin"), company = id("company"), memberA = id("member-ari"), memberB = id("member-sari");
  const program = id("program-bim"), enrollment = id("enrollment-ari"), evidence = id("evidence-ari");
  const requirement = id("requirement-bim"), matching = id("matching-ari"), transaction = id("transaction-enrollment");
  await db.transaction(async (tx) => {
    await tx.insert(usersTable).values([
      { id: admin, clerkUserId: id("non-auth-admin"), name: "Admin Pilot", email: `${runId}-admin@example.test`, role: "admin", onboardingComplete: true },
      { id: company, clerkUserId: id("non-auth-company"), name: "PT Konstruksi Pilot", email: `${runId}-company@example.test`, role: "company", organization: "PT Konstruksi Pilot", onboardingComplete: true },
      { id: memberA, clerkUserId: id("non-auth-member-ari"), name: "Ari Pratama (Pilot)", email: `${runId}-ari@example.test`, role: "member", onboardingComplete: true },
      { id: memberB, clerkUserId: id("non-auth-member-sari"), name: "Sari Utami (Pilot)", email: `${runId}-sari@example.test`, role: "member", onboardingComplete: true },
    ]);
    await tx.insert(companyProfilesTable).values({ id: id("company-profile"), userId: company, companyName: "PT Konstruksi Pilot", companyType: "Kontraktor", phone: "021-555-0101", businessEmail: `${runId}-business@example.test`, address: "Jakarta", picName: "Rina Pilot", picTitle: "Manajer SDM", primaryNeed: "talent" });
    await tx.insert(memberProfilesTable).values([
      { id: id("member-profile-ari"), userId: memberA, phone: "0812-0000-0101", domicile: "Jakarta", education: "D4 Teknik Sipil", jobTitle: "BIM Modeler", expertise: "BIM, Revit", skkLevel: 5, experienceYears: 4, primaryGoal: "career", dataConsent: true },
      { id: id("member-profile-sari"), userId: memberB, phone: "0812-0000-0102", domicile: "Bandung", education: "S1 Teknik Sipil", jobTitle: "Site Engineer", expertise: "K3, pengawasan proyek", skkLevel: 4, experienceYears: 3, primaryGoal: "competency", dataConsent: true },
    ]);
    await tx.insert(programsTable).values({ id: program, name: "Pilot: Dasar BIM untuk Proyek", category: "Bimtek", mode: "hybrid", schedule: "Sabtu, 09.00 WIB", duration: "4 minggu", price: "750000.00", instructor: "Fasilitator Pilot", description: "Materi fiktif untuk validasi alur pilot.", capacity: 20, status: "published" });
    await tx.insert(enrollmentsTable).values({ id: enrollment, programId: program, memberUserId: memberA, memberName: "Ari Pratama (Pilot)", status: "enrolled", enrolledAt: now });
    await tx.insert(programProgressTable).values({ id: id("progress-ari"), programId: program, memberUserId: memberA, progress: 50, currentMilestone: "Modul 2", milestones: [{ title: "Orientasi", completed: true }, { title: "Modul 2", completed: false }] });
    await tx.insert(readinessDiagnosticsTable).values({ id: id("readiness-ari"), memberUserId: memberA, score: 72, answers: { technical: 4, safety: 4, communication: 3, problemSolving: 3, evidence: 4 }, focusAreas: ["Portofolio proyek"] });
    await tx.insert(memberEvidenceTable).values({ id: evidence, memberUserId: memberA, clientRequestId: id("evidence-request"), evidenceType: "project", title: "Portofolio BIM Pilot", description: "Contoh bukti fiktif tanpa dokumen pribadi.", status: "submitted", submittedAt: now });
    await tx.insert(verificationsTable).values({ id: id("verification-ari"), subjectType: "competency", subjectId: evidence, subjectName: "Portofolio BIM Pilot", evidenceType: "project", status: "pending", submittedByUserId: memberA });
    await tx.insert(professionalPassportsTable).values([
      { id: id("passport-ari"), memberUserId: memberA, slug: `${runId}-ari`, isPublic: true, headline: "BIM Modeler", bio: "Profil fiktif untuk pilot.", preferredRoles: ["BIM Modeler"], preferredLocations: ["Jakarta"], preferredWorkModes: ["hybrid"], availabilityStatus: "available" },
      { id: id("passport-sari"), memberUserId: memberB, slug: `${runId}-sari`, isPublic: true, headline: "Site Engineer", bio: "Profil fiktif untuk pilot.", preferredRoles: ["Site Engineer"], preferredLocations: ["Bandung"], preferredWorkModes: ["onsite"], availabilityStatus: "open_to_offer" },
    ]);
    await tx.insert(passportConsentsTable).values({ id: id("passport-consent-ari"), memberUserId: memberA, scope: "talent_pool", status: "granted", grantedAt: now });
    await tx.insert(companyTalentConsentsTable).values({ id: id("company-consent-ari"), memberUserId: memberA, companyUserId: company, scope: "talent_pool", status: "active", grantedAt: now, expiresAt: nextMonth, grantedBy: memberA, requestNote: "Persetujuan fiktif pilot." });
    await tx.insert(companyRequirementsTable).values({ id: requirement, companyUserId: company, kind: "talent", title: "BIM Modeler Pilot", description: "Kebutuhan fiktif untuk uji proses shortlist.", location: "Jakarta", competencies: ["BIM", "Revit"], minimumSkkLevel: 4, minimumExperience: 3, headcount: 1, deadline: "2026-12-31", status: "open" });
    await tx.insert(matchingsTable).values({ id: matching, requirementId: requirement, companyUserId: company, requirement: "BIM Modeler Pilot", companyName: "PT Konstruksi Pilot", candidateUserId: memberA, candidateName: "Ari Pratama (Pilot)", score: 88, status: "shortlisted" });
    await tx.insert(transactionsTable).values({ id: transaction, kind: "program", referenceId: enrollment, customerName: "Ari Pratama (Pilot)", amount: "750000.00", invoiceNumber: `INV-${runId}`, invoiceAmount: "750000.00", feeAmount: "37500.00", commission: "37500.00", refundAmount: "0.00", settlementAmount: "675000.00", settlementDueAt: nextMonth, settledAt: now, reconciliationStatus: "matched", status: "paid" });
    await tx.insert(notificationsTable).values([
      { id: id("notification-ari"), userId: memberA, title: "Data pilot dibuat", description: "Notifikasi fiktif untuk verifikasi alur.", type: "system", dedupeKey: id("notice-ari") },
      { id: id("notification-company"), userId: company, title: "Kandidat masuk shortlist", description: "Kandidat fiktif tersedia untuk pilot.", type: "recruitment", dedupeKey: id("notice-company") },
    ]);
    await tx.insert(auditLogsTable).values([
      { id: id("audit-seeded"), actorUserId: admin, actorRole: "admin", action: "pilot.seeded", entityType: "pilot_run", entityId: id("run"), note: "Non-authenticating fixture run.", metadata: { runId, fixture: true } },
      { id: id("audit-shortlist"), actorUserId: company, actorRole: "company", action: "matching.shortlisted", entityType: "matching", entityId: matching, fromStatus: "review", toStatus: "shortlisted", note: "Pilot fixture.", metadata: { runId, fixture: true } },
    ]);
  });
}

assertSafeInvocation();
if (command === "cleanup-user") {
  if (args.includes("--dry-run")) {
    console.log(`Would clean ${userIdArguments.length} fictional Clerk Development user(s); no database changes made.`);
    process.exit(0);
  }
  await cleanupInteractiveUsers(userIdArguments);
  console.log(`Cleaned ${userIdArguments.length} fictional Clerk Development user(s).`);
  process.exit(0);
}
const runId = getRunId();
if (args.includes("--dry-run")) {
  console.log(`${command === "reset" ? "Would reset" : "Would seed"} only non-authenticating pilot fixtures for run ${runId}; no database changes made.`);
  process.exit(0);
}
if (command === "reset") {
  await resetRun(runId);
  console.log(`Reset only pilot fixtures for run ${runId}.`);
} else {
  await seedRun(runId);
  console.log(`Seeded non-authenticating pilot fixtures for run ${runId}.`);
}