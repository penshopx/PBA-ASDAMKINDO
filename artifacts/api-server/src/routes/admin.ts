import { randomUUID } from "node:crypto";
import { and, count, countDistinct, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateAdminProgramBody,
  CreateAdminProgramResponse,
  DecideVerificationBody,
  DecideVerificationParams,
  DecideVerificationResponse,
  GetAdminFunnelResponse,
  GetAdminPilotEvaluationOptionsResponse,
  GetAdminPilotEvaluationQueryParams,
  GetAdminPilotEvaluationResponse,
  GetAdminOperationsResponse,
  IngestAdminTransactionSettlementBody,
  IngestAdminTransactionSettlementResponse,
  ListAdminMatchingsQueryParams,
  ListAdminMatchingsResponse,
  ListAdminAuditLogsResponse,
  ListAdminPilotFeedbackQueryParams,
  ListAdminPilotFeedbackResponse,
  CreateAdminPilotFeedbackBody,
  CreateAdminPilotFeedbackResponse,
  ResolveAdminPilotFeedbackBody,
  ResolveAdminPilotFeedbackParams,
  ResolveAdminPilotFeedbackResponse,
  ResolveAdminTransactionReconciliationBody,
  ResolveAdminTransactionReconciliationParams,
  ResolveAdminTransactionReconciliationResponse,
  UpdateAdminEnrollmentBody,
  UpdateAdminEnrollmentParams,
  UpdateAdminEnrollmentResponse,
  UpdateAdminMatchingBody,
  UpdateAdminMatchingParams,
  UpdateAdminMatchingResponse,
  UpdateAdminProgramBody,
  UpdateAdminProgramParams,
  UpdateAdminProgramResponse,
  UpdateAdminTransactionBody,
  UpdateAdminTransactionParams,
  UpdateAdminTransactionResponse,
} from "@workspace/api-zod";
import {
  auditLogsTable,
  companyTalentConsentsTable,
  companyRequirementsTable,
  companyProfilesTable,
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
  verificationsTable,
} from "@workspace/db";
import { getAuthenticatedUser, requireRole, requireUser } from "../lib/auth";
import { logger } from "../lib/logger";
import { expireCompanyTalentConsents } from "../lib/talent-consent";
import { listTalentMatches } from "../lib/talent-matching";
import {
  getVerificationSla,
  getVerificationSlaReminderWorkerStatus,
  orderVerificationSlaItems,
  syncVerificationSlaReminders,
} from "../lib/verification-sla";

const router: IRouter = Router();
const adminRoles = ["admin", "super_admin"] as const;
const superAdminOnly = [requireUser, requireRole("super_admin")];

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function programResponse(
  program: typeof programsTable.$inferSelect,
  enrollmentCount = 0,
  completionCount = 0,
) {
  return {
    ...program,
    price: Number(program.price),
    capacity: program.capacity,
    enrollmentCount,
    completionCount,
    enrolledCount: enrollmentCount,
    completedCount: completionCount,
  };
}

function verificationResponse(verification: typeof verificationsTable.$inferSelect, now = new Date()) {
  return {
    ...verification,
    submittedAt: verification.submittedAt,
    reviewedAt: iso(verification.reviewedAt),
    ...getVerificationSla(verification, now),
  };
}

const SETTLEMENT_SLA_DAYS = 7;
const CENT_TOLERANCE = 0.01;
const ISO_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

function isValidIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_DATE_TIME.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  const daysInMonth =
    month >= 1 && month <= 12
      ? new Date(Date.UTC(year, month, 0)).getUTCDate()
      : 0;

  return (
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 14 &&
    offsetMinute <= 59 &&
    (offsetHour < 14 || offsetMinute === 0)
  );
}

function transactionResponse(transaction: typeof transactionsTable.$inferSelect, now = new Date()) {
  const amount = Number(transaction.amount);
  const invoiceAmount = transaction.invoiceAmount === null ? amount : Number(transaction.invoiceAmount);
  const feeAmount = Number(transaction.feeAmount);
  const commission = Number(transaction.commission);
  const refundAmount = Number(transaction.refundAmount);
  const expectedSettlement = invoiceAmount - feeAmount - commission - refundAmount;
  const settlementAmount = transaction.settlementAmount === null ? null : Number(transaction.settlementAmount);
  const settlementDifference =
    settlementAmount === null ? null : Number((settlementAmount - expectedSettlement).toFixed(2));
  const settlementDueAt =
    transaction.settlementDueAt ?? new Date(transaction.occurredAt.getTime() + SETTLEMENT_SLA_DAYS * 24 * 60 * 60 * 1000);
  const settledAt = transaction.settledAt;
  const slaBreached =
    (settledAt !== null && settledAt.getTime() > settlementDueAt.getTime()) ||
    (settledAt === null && now.getTime() > settlementDueAt.getTime());
  const amountMismatch =
    settlementAmount !== null && Math.abs(settlementAmount - expectedSettlement) > CENT_TOLERANCE;
  const flags: Array<"settlement_missing" | "amount_mismatch" | "settlement_sla_breached"> = [];
  if (settlementAmount === null) flags.push("settlement_missing");
  if (amountMismatch) flags.push("amount_mismatch");
  if (slaBreached) flags.push("settlement_sla_breached");
  const reconciliationStatus =
    transaction.reconciliationStatus === "resolved"
      ? "resolved"
      : amountMismatch
        ? "mismatch"
        : slaBreached
          ? "overdue"
          : settlementAmount === null
            ? "pending"
            : "matched";

  return {
    ...transaction,
    amount,
    invoiceNumber: transaction.invoiceNumber ?? `INV-${transaction.referenceId}`,
    invoiceAmount,
    feeAmount,
    commission,
    refundAmount,
    expectedSettlement,
    settlementAmount,
    netSettlement: settlementAmount,
    settlementDifference,
    settlementDueAt,
    settledAt,
    reconciliationStatus,
    reconciliationFlags: flags,
    reconciliationResolvedAt: transaction.reconciliationResolvedAt,
  };
}

async function recordAudit(
  executor: any,
  actor: ReturnType<typeof getAuthenticatedUser>,
  values: {
    action: string;
    entityType: string;
    entityId: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    note?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await executor.insert(auditLogsTable).values({
    id: randomUUID(),
    actorUserId: actor.id,
    actorRole: actor.role,
    action: values.action,
    entityType: values.entityType,
    entityId: values.entityId,
    fromStatus: values.fromStatus,
    toStatus: values.toStatus,
    note: values.note,
    ...(values.metadata ? { metadata: values.metadata } : {}),
  });
}

async function getAuditLogs(includeLogs: boolean) {
  if (!includeLogs) return [];
  const logs = await db
    .select({ log: auditLogsTable, actorName: usersTable.name })
    .from(auditLogsTable)
    .leftJoin(usersTable, eq(auditLogsTable.actorUserId, usersTable.id))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(100);
  return logs.map(({ log, actorName }) => ({
    ...log,
    actorName: actorName ?? "Admin PBA",
    createdAt: log.createdAt,
  }));
}

const PILOT_TARGET_PARTICIPANTS = 20;
const PILOT_FEEDBACK_ENTITY = "pilot_feedback";
const PILOT_FEEDBACK_RECORDED = "pilot.feedback.recorded";
const PILOT_FEEDBACK_RESOLVED = "pilot.feedback.resolved";
const PILOT_SENSITIVE_FEEDBACK =
  /(?:\b(?:nama peserta|email|e-mail|telepon|nomor hp|whatsapp|alamat|nik|ktp|paspor|password|kata sandi|token|api key|rekening|kartu kredit|diagnosis|penyakit)\b|@|https?:\/\/|(?:\+62|08)\d{7,}|\b\d{12,19}\b)/i;

function percentage(value: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Number(((value / denominator) * 100).toFixed(1));
}

function isSafePilotFeedback(note: string): boolean {
  return note.length >= 3 && note.length <= 500 && !PILOT_SENSITIVE_FEEDBACK.test(note);
}

async function getPilotAnchors(programId: string, requirementId: string) {
  const [programRows, requirementRows] = await Promise.all([
    db
      .select({ id: programsTable.id, name: programsTable.name })
      .from(programsTable)
      .where(
        and(
          eq(programsTable.id, programId),
          eq(programsTable.status, "published"),
          eq(programsTable.category, "Bimtek"),
        ),
      )
      .limit(1),
    db
      .select({
        id: companyRequirementsTable.id,
        title: companyRequirementsTable.title,
        companyUserId: companyRequirementsTable.companyUserId,
        companyName: sql<string>`coalesce(${companyProfilesTable.companyName}, ${usersTable.organization}, ${usersTable.name})`,
      })
      .from(companyRequirementsTable)
      .innerJoin(usersTable, eq(usersTable.id, companyRequirementsTable.companyUserId))
      .leftJoin(companyProfilesTable, eq(companyProfilesTable.userId, companyRequirementsTable.companyUserId))
      .where(
        and(
          eq(companyRequirementsTable.id, requirementId),
          eq(companyRequirementsTable.status, "open"),
        ),
      )
      .limit(1),
  ]);
  const program = programRows[0];
  const requirement = requirementRows[0];
  return program && requirement ? { program, requirement } : null;
}

async function getPilotFeedbackEvents(programId: string, requirementId: string) {
  return db
    .select({
      id: auditLogsTable.id,
      action: auditLogsTable.action,
      entityId: auditLogsTable.entityId,
      note: auditLogsTable.note,
      createdAt: auditLogsTable.createdAt,
      metadata: auditLogsTable.metadata,
    })
    .from(auditLogsTable)
    .where(
      and(
        eq(auditLogsTable.entityType, PILOT_FEEDBACK_ENTITY),
        inArray(auditLogsTable.action, [PILOT_FEEDBACK_RECORDED, PILOT_FEEDBACK_RESOLVED]),
        sql`${auditLogsTable.metadata}->>'programId' = ${programId}`,
        sql`${auditLogsTable.metadata}->>'requirementId' = ${requirementId}`,
      ),
    )
    .orderBy(desc(auditLogsTable.createdAt));
}

function buildPilotFeedbackRecords(
  events: Awaited<ReturnType<typeof getPilotFeedbackEvents>>,
) {
  const grouped = new Map<
    string,
    {
      id: string;
      note: string;
      createdAt: Date;
      resolvedAt: Date | null;
    }
  >();
  for (const event of events) {
    if (event.action !== PILOT_FEEDBACK_RECORDED) continue;
    grouped.set(event.entityId, {
      id: event.entityId,
      note: event.note ?? "Feedback pilot tanpa ringkasan.",
      createdAt: event.createdAt,
      resolvedAt: null,
    });
  }
  for (const event of events) {
    if (event.action !== PILOT_FEEDBACK_RESOLVED) continue;
    const feedback = grouped.get(event.entityId);
    if (feedback && (!feedback.resolvedAt || event.createdAt < feedback.resolvedAt)) {
      feedback.resolvedAt = event.createdAt;
    }
  }
  return [...grouped.values()]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((feedback) => ({
      ...feedback,
      status: feedback.resolvedAt ? ("resolved" as const) : ("open" as const),
    }));
}

router.get("/admin/matchings", requireUser, requireRole(...adminRoles), async (req, res): Promise<void> => {
  const query = ListAdminMatchingsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Filter matching tidak valid." });
    return;
  }
    const actor = getAuthenticatedUser(req);
  await expireCompanyTalentConsents();
  const page = await listTalentMatches({
    requirementId: query.data.requirementId,
    companyId: query.data.companyId,
    search: query.data.search,
    minScore: query.data.minScore,
    location: query.data.location,
    skkLevel: query.data.skkLevel,
    experienceMin: query.data.experienceMin,
    availability: query.data.availability,
    verificationStatus: query.data.verificationStatus,
    status: query.data.status,
    page: query.data.page,
    pageSize: query.data.pageSize,
  });
  const entityId = query.data.requirementId ?? query.data.companyId ?? "cross-requirement";
  const actions = ["matching.generated", "matching.viewed", ...(query.data.refresh ? ["matching.refreshed"] : [])];
  await Promise.all(
    actions.map((action) =>
      recordAudit(db, actor, {
        action,
        entityType: "matching_review",
        entityId,
        note: `Admin meninjau halaman ${query.data.page} hasil matching.`,
      }),
    ),
  );
  res.json(ListAdminMatchingsResponse.parse(page));
});

router.get("/admin/funnel", requireUser, requireRole(...adminRoles), async (_req, res): Promise<void> => {
  const [
    registrations,
    completedDiagnostics,
    paidParticipants,
    activeTalent,
    openCompanyRequirements,
    matchingRecords,
    shortlistPipeline,
    placements,
  ] = await Promise.all([
    db.select({ value: count(usersTable.id) }).from(usersTable).where(eq(usersTable.role, "member")),
    db.select({ value: count(readinessDiagnosticsTable.id) }).from(readinessDiagnosticsTable),
    db
      .select({ value: countDistinct(enrollmentsTable.memberUserId) })
      .from(transactionsTable)
      .innerJoin(enrollmentsTable, eq(transactionsTable.referenceId, enrollmentsTable.id))
      .where(and(eq(transactionsTable.kind, "program"), eq(transactionsTable.status, "paid"))),
    db
      .select({ value: count(professionalPassportsTable.id) })
      .from(professionalPassportsTable)
      .innerJoin(memberProfilesTable, eq(memberProfilesTable.userId, professionalPassportsTable.memberUserId))
      .where(and(eq(memberProfilesTable.dataConsent, true), inArray(professionalPassportsTable.availabilityStatus, ["available", "open_to_offer"]))),
    db.select({ value: count(companyRequirementsTable.id) }).from(companyRequirementsTable).where(eq(companyRequirementsTable.status, "open")),
    db.select({ value: count(matchingsTable.id) }).from(matchingsTable),
    db.select({ value: count(matchingsTable.id) }).from(matchingsTable).where(inArray(matchingsTable.status, ["shortlisted", "interview"])),
    db.select({ value: count(matchingsTable.id) }).from(matchingsTable).where(eq(matchingsTable.status, "placed")),
  ]);

  res.json(GetAdminFunnelResponse.parse({
    metrics: [
      { key: "registrations", label: "Registrasi anggota", value: registrations[0]?.value ?? 0, definition: "Jumlah seluruh akun dengan peran member yang terdaftar, tanpa mensyaratkan onboarding atau aktivitas lain." },
      { key: "completedDiagnostics", label: "Diagnostik selesai", value: completedDiagnostics[0]?.value ?? 0, definition: "Jumlah record readiness diagnostic; satu member hanya dapat memiliki satu record dan record dibuat saat diagnostik disimpan selesai." },
      { key: "paidParticipants", label: "Peserta berbayar", value: paidParticipants[0]?.value ?? 0, definition: "Jumlah anggota unik pada enrollment yang memiliki transaksi program berstatus paid; transaksi tanpa relasi enrollment tidak dihitung." },
      { key: "activeTalent", label: "Talenta aktif", value: activeTalent[0]?.value ?? 0, definition: "Jumlah passport profesional milik member dengan dataConsent aktif dan availabilityStatus available atau open_to_offer; tidak menyiratkan consent kepada perusahaan tertentu." },
      { key: "openCompanyRequirements", label: "Kebutuhan perusahaan terbuka", value: openCompanyRequirements[0]?.value ?? 0, definition: "Jumlah company requirement dengan status open, untuk semua jenis kebutuhan yang tercatat pada skema." },
      { key: "matchingRecords", label: "Record matching", value: matchingRecords[0]?.value ?? 0, definition: "Jumlah seluruh record matching yang tersimpan, termasuk status baru, ditinjau, shortlist, interview, placed, dan declined." },
      { key: "shortlistPipeline", label: "Pipeline shortlist", value: shortlistPipeline[0]?.value ?? 0, definition: "Jumlah record matching berstatus shortlisted atau interview; placed dihitung terpisah sebagai placement dan declined tidak termasuk." },
      { key: "placements", label: "Placement", value: placements[0]?.value ?? 0, definition: "Jumlah record matching dengan status placed." },
    ],
  }));
});

router.get(
  "/admin/pilot-evaluation/options",
  requireUser,
  requireRole(...adminRoles),
  async (_req, res): Promise<void> => {
    const [programs, requirements] = await Promise.all([
      db
        .select({
          id: programsTable.id,
          name: programsTable.name,
          category: programsTable.category,
        })
        .from(programsTable)
        .where(
          and(
            eq(programsTable.status, "published"),
            eq(programsTable.category, "Bimtek"),
          ),
        )
        .orderBy(programsTable.name),
      db
        .select({
          id: companyRequirementsTable.id,
          title: companyRequirementsTable.title,
          companyName: sql<string>`coalesce(${companyProfilesTable.companyName}, ${usersTable.organization}, ${usersTable.name})`,
        })
        .from(companyRequirementsTable)
        .innerJoin(usersTable, eq(usersTable.id, companyRequirementsTable.companyUserId))
        .leftJoin(companyProfilesTable, eq(companyProfilesTable.userId, companyRequirementsTable.companyUserId))
        .where(eq(companyRequirementsTable.status, "open"))
        .orderBy(companyRequirementsTable.title),
    ]);
    res.json(GetAdminPilotEvaluationOptionsResponse.parse({ programs, requirements }));
  },
);

router.get(
  "/admin/pilot-evaluation",
  requireUser,
  requireRole(...adminRoles),
  async (req, res): Promise<void> => {
    const query = GetAdminPilotEvaluationQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Program dan kebutuhan perusahaan wajib dipilih." });
      return;
    }
    const anchors = await getPilotAnchors(query.data.programId, query.data.requirementId);
    if (!anchors) {
      res.status(400).json({ error: "Program Bimtek terbit atau kebutuhan perusahaan terbuka tidak ditemukan." });
      return;
    }

    const metricResult = await db.execute<{
      registrations: number;
      completedDiagnostics: number;
      paidParticipants: number;
      completedProgram: number;
      activeConsent: number;
      verifiedTalent: number;
      matchedCandidates: number;
      shortlistPipeline: number;
      placementSimulation: number;
      complaints: number;
      adminResponseTimeHours: string | null;
      resolvedFeedbackCount: number;
    }>(sql`
      with cohort as (
        select distinct e.member_user_id
        from enrollments e
        where e.program_id = ${anchors.program.id}
          and e.status <> 'cancelled'
      ),
      feedback_created as (
        select a.entity_id, a.created_at
        from audit_logs a
        where a.entity_type = ${PILOT_FEEDBACK_ENTITY}
          and a.action = ${PILOT_FEEDBACK_RECORDED}
          and a.metadata->>'programId' = ${anchors.program.id}
          and a.metadata->>'requirementId' = ${anchors.requirement.id}
      ),
      feedback_resolved as (
        select a.entity_id, min(a.created_at) as resolved_at
        from audit_logs a
        where a.entity_type = ${PILOT_FEEDBACK_ENTITY}
          and a.action = ${PILOT_FEEDBACK_RESOLVED}
          and a.metadata->>'programId' = ${anchors.program.id}
          and a.metadata->>'requirementId' = ${anchors.requirement.id}
        group by a.entity_id
      )
      select
        (select count(*)::int from cohort) as "registrations",
        (select count(distinct c.member_user_id)::int from cohort c inner join readiness_diagnostics d on d.member_user_id = c.member_user_id) as "completedDiagnostics",
        (select count(distinct c.member_user_id)::int from cohort c inner join enrollments e on e.member_user_id = c.member_user_id and e.program_id = ${anchors.program.id} and e.status <> 'cancelled' inner join transactions t on t.reference_id = e.id and t.kind = 'program' and t.status = 'paid') as "paidParticipants",
        (select count(distinct c.member_user_id)::int from cohort c inner join enrollments e on e.member_user_id = c.member_user_id and e.program_id = ${anchors.program.id} and e.status = 'completed') as "completedProgram",
        (select count(distinct c.member_user_id)::int from cohort c inner join member_profiles p on p.user_id = c.member_user_id and p.data_consent = true inner join company_talent_consents tc on tc.member_user_id = c.member_user_id and tc.company_user_id = ${anchors.requirement.companyUserId} and tc.status = 'active' and tc.expires_at > now()) as "activeConsent",
        (select count(distinct c.member_user_id)::int from cohort c inner join professional_passports pp on pp.member_user_id = c.member_user_id inner join member_evidence me on me.member_user_id = c.member_user_id and me.status = 'verified') as "verifiedTalent",
        (select count(distinct c.member_user_id)::int from cohort c inner join matchings m on m.candidate_user_id = c.member_user_id and m.requirement_id = ${anchors.requirement.id} and m.status in ('new', 'review', 'shortlisted', 'interview', 'placed')) as "matchedCandidates",
        (select count(distinct c.member_user_id)::int from cohort c inner join matchings m on m.candidate_user_id = c.member_user_id and m.requirement_id = ${anchors.requirement.id} and m.status in ('shortlisted', 'interview', 'placed')) as "shortlistPipeline",
        (select count(distinct c.member_user_id)::int from cohort c inner join matchings m on m.candidate_user_id = c.member_user_id and m.requirement_id = ${anchors.requirement.id} and m.status = 'placed') as "placementSimulation",
        (select count(*)::int from feedback_created) as "complaints",
        (select round(avg(extract(epoch from (r.resolved_at - c.created_at)) / 3600.0)::numeric, 1)::text from feedback_created c inner join feedback_resolved r on r.entity_id = c.entity_id where r.resolved_at >= c.created_at) as "adminResponseTimeHours",
        (select count(*)::int from feedback_created c inner join feedback_resolved r on r.entity_id = c.entity_id where r.resolved_at >= c.created_at) as "resolvedFeedbackCount"
    `);
    const rawMetrics = metricResult.rows[0];
    const registrations = Number(rawMetrics?.registrations ?? 0);
    const completedDiagnostics = Number(rawMetrics?.completedDiagnostics ?? 0);
    const paidParticipants = Number(rawMetrics?.paidParticipants ?? 0);
    const completedProgram = Number(rawMetrics?.completedProgram ?? 0);
    const activeConsent = Number(rawMetrics?.activeConsent ?? 0);
    const verifiedTalent = Number(rawMetrics?.verifiedTalent ?? 0);
    const matchedCandidates = Number(rawMetrics?.matchedCandidates ?? 0);
    const shortlistPipeline = Number(rawMetrics?.shortlistPipeline ?? 0);
    const placementSimulation = Number(rawMetrics?.placementSimulation ?? 0);
    const complaints = Number(rawMetrics?.complaints ?? 0);
    const resolvedFeedbackCount = Number(rawMetrics?.resolvedFeedbackCount ?? 0);
    const adminResponseTimeHours =
      rawMetrics?.adminResponseTimeHours === null || rawMetrics?.adminResponseTimeHours === undefined
        ? null
        : Number(rawMetrics.adminResponseTimeHours);
    const completionRate = percentage(completedProgram, registrations);
    const funnelCounts = {
      registrations,
      completedDiagnostics,
      paidParticipants,
      completedProgram,
      activeConsent,
      matchedCandidates,
      shortlistPipeline,
      placementSimulation,
    };
    const funnelDefinitions = {
      registrations: "Anggota unik dengan enrollment program terpilih yang tidak berstatus dibatalkan.",
      completedDiagnostics: "Anggota cohort yang sudah memiliki readiness diagnostic.",
      paidParticipants: "Anggota cohort unik dengan transaksi program sandbox/manual berstatus paid.",
      completedProgram: "Anggota cohort dengan enrollment berstatus selesai.",
      activeConsent: "Anggota cohort dengan dataConsent aktif dan consent aktif yang belum kedaluwarsa untuk perusahaan mitra.",
      matchedCandidates: "Anggota cohort yang memiliki record matching aktif untuk kebutuhan terpilih; declined tidak dihitung.",
      shortlistPipeline: "Anggota cohort pada status shortlisted, interview, atau placed untuk kebutuhan terpilih.",
      placementSimulation: "Anggota cohort pada status placed; dalam pilot ini hanya simulasi placement.",
    } as const;
    const funnelLabels = {
      registrations: "Registrasi cohort",
      completedDiagnostics: "Diagnostik selesai",
      paidParticipants: "Pembayaran sandbox",
      completedProgram: "Program selesai",
      activeConsent: "Consent aktif",
      matchedCandidates: "Matched",
      shortlistPipeline: "Shortlist / pipeline",
      placementSimulation: "Placement simulation",
    } as const;
    const funnel = (
      Object.keys(funnelCounts) as Array<keyof typeof funnelCounts>
    ).map((key) => ({
      key,
      label: funnelLabels[key],
      count: funnelCounts[key],
      percentage: percentage(funnelCounts[key], registrations),
      definition: funnelDefinitions[key],
    }));

    res.json(
      GetAdminPilotEvaluationResponse.parse({
        targetParticipants: PILOT_TARGET_PARTICIPANTS,
        cohort: {
          programName: anchors.program.name,
          requirementTitle: anchors.requirement.title,
          companyName: anchors.requirement.companyName,
          participantCount: registrations,
        },
        metrics: [
          { key: "registrations", label: "Registrasi cohort", value: registrations, unit: "count", denominator: PILOT_TARGET_PARTICIPANTS, definition: funnelDefinitions.registrations },
          { key: "completedDiagnostics", label: "Diagnostik selesai", value: completedDiagnostics, unit: "count", denominator: registrations, definition: funnelDefinitions.completedDiagnostics },
          { key: "paidParticipants", label: "Peserta berbayar", value: paidParticipants, unit: "count", denominator: registrations, definition: funnelDefinitions.paidParticipants },
          { key: "completionRate", label: "Completion rate", value: completionRate, unit: "percentage", denominator: registrations, definition: "Persentase anggota cohort dengan enrollment selesai terhadap seluruh anggota cohort." },
          { key: "activeConsent", label: "Consent aktif", value: activeConsent, unit: "count", denominator: registrations, definition: funnelDefinitions.activeConsent },
          { key: "verifiedTalent", label: "Talenta terverifikasi", value: verifiedTalent, unit: "count", denominator: registrations, definition: "Anggota cohort yang memiliki Professional Passport dan setidaknya satu evidence berstatus verified." },
          { key: "matchedCandidates", label: "Kandidat matched", value: matchedCandidates, unit: "count", denominator: registrations, definition: funnelDefinitions.matchedCandidates },
          { key: "shortlistPipeline", label: "Shortlist / pipeline", value: shortlistPipeline, unit: "count", denominator: matchedCandidates, definition: funnelDefinitions.shortlistPipeline },
          { key: "placementSimulation", label: "Placement simulation", value: placementSimulation, unit: "count", denominator: shortlistPipeline, definition: funnelDefinitions.placementSimulation },
          { key: "complaints", label: "Keluhan / feedback", value: complaints, unit: "count", denominator: registrations, definition: "Jumlah feedback non-sensitif yang dicatat Admin untuk anchor pilot ini, termasuk yang telah diselesaikan." },
          { key: "adminResponseTimeHours", label: "Waktu respons Admin", value: adminResponseTimeHours, unit: "hours", denominator: resolvedFeedbackCount, definition: "Rata-rata jam dari feedback dicatat sampai ditandai selesai. Nilai N/A jika belum ada feedback yang selesai." },
        ],
        funnel,
      }),
    );
  },
);

router.get(
  "/admin/pilot-feedback",
  requireUser,
  requireRole(...adminRoles),
  async (req, res): Promise<void> => {
    const query = ListAdminPilotFeedbackQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Program dan kebutuhan perusahaan wajib dipilih." });
      return;
    }
    const anchors = await getPilotAnchors(query.data.programId, query.data.requirementId);
    if (!anchors) {
      res.status(400).json({ error: "Anchor pilot tidak tersedia." });
      return;
    }
    const records = buildPilotFeedbackRecords(
      await getPilotFeedbackEvents(query.data.programId, query.data.requirementId),
    );
    res.json(ListAdminPilotFeedbackResponse.parse(records));
  },
);

router.post(
  "/admin/pilot-feedback",
  requireUser,
  requireRole(...adminRoles),
  async (req, res): Promise<void> => {
    const body = CreateAdminPilotFeedbackBody.safeParse(req.body);
    const note = body.success ? body.data.note.trim() : "";
    if (!body.success || !isSafePilotFeedback(note)) {
      res.status(400).json({ error: "Gunakan ringkasan operasional 3–500 karakter tanpa data pribadi, kontak, kredensial, kesehatan, identitas, atau pembayaran." });
      return;
    }
    const anchors = await getPilotAnchors(body.data.programId, body.data.requirementId);
    if (!anchors) {
      res.status(400).json({ error: "Anchor pilot tidak tersedia." });
      return;
    }
    const actor = getAuthenticatedUser(req);
    await recordAudit(db, actor, {
      action: PILOT_FEEDBACK_RECORDED,
      entityType: PILOT_FEEDBACK_ENTITY,
      entityId: randomUUID(),
      toStatus: "open",
      note,
      metadata: {
        programId: anchors.program.id,
        requirementId: anchors.requirement.id,
      },
    });
    res.status(201).json(CreateAdminPilotFeedbackResponse.parse({ status: "recorded" }));
  },
);

router.patch(
  "/admin/pilot-feedback/:id",
  requireUser,
  requireRole(...adminRoles),
  async (req, res): Promise<void> => {
    const params = ResolveAdminPilotFeedbackParams.safeParse(req.params);
    const body = ResolveAdminPilotFeedbackBody.safeParse(req.body);
    const resolutionNote = body.success ? body.data.note?.trim() : undefined;
    if (!params.success || !body.success || (resolutionNote !== undefined && !isSafePilotFeedback(resolutionNote))) {
      res.status(400).json({ error: "Penyelesaian feedback tidak valid atau memuat data sensitif." });
      return;
    }
    const actor = getAuthenticatedUser(req);
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${params.data.id}))`);
      const [recorded] = await tx
        .select({
          entityId: auditLogsTable.entityId,
          metadata: auditLogsTable.metadata,
        })
        .from(auditLogsTable)
        .where(
          and(
            eq(auditLogsTable.entityType, PILOT_FEEDBACK_ENTITY),
            eq(auditLogsTable.action, PILOT_FEEDBACK_RECORDED),
            eq(auditLogsTable.entityId, params.data.id),
          ),
        )
        .limit(1);
      if (!recorded) return "not_found" as const;
      const [resolved] = await tx
        .select({ id: auditLogsTable.id })
        .from(auditLogsTable)
        .where(
          and(
            eq(auditLogsTable.entityType, PILOT_FEEDBACK_ENTITY),
            eq(auditLogsTable.action, PILOT_FEEDBACK_RESOLVED),
            eq(auditLogsTable.entityId, params.data.id),
          ),
        )
        .limit(1);
      if (resolved) return "resolved" as const;
      const metadata =
        typeof recorded.metadata === "object" && recorded.metadata !== null
          ? (recorded.metadata as Record<string, unknown>)
          : {};
      await recordAudit(tx, actor, {
        action: PILOT_FEEDBACK_RESOLVED,
        entityType: PILOT_FEEDBACK_ENTITY,
        entityId: recorded.entityId,
        fromStatus: "open",
        toStatus: "resolved",
        note: resolutionNote || "Feedback ditandai selesai oleh Admin PBA.",
        metadata,
      });
      return "ok" as const;
    });
    if (result === "not_found") {
      res.status(404).json({ error: "Feedback pilot tidak ditemukan." });
      return;
    }
    if (result === "resolved") {
      res.status(400).json({ error: "Feedback pilot ini sudah diselesaikan." });
      return;
    }
    res.json(ResolveAdminPilotFeedbackResponse.parse({ status: "resolved" }));
  },
);

router.get("/admin/operations", requireUser, requireRole(...adminRoles), async (req, res): Promise<void> => {
  const user = getAuthenticatedUser(req);
  try {
    await syncVerificationSlaReminders();
  } catch (error) {
    logger.error(
      { err: error },
      "Failed to synchronize verification SLA reminders from admin workspace",
    );
  }
  await expireCompanyTalentConsents();
  const [verifications, programs, enrollments, matchings, transactions, auditLogs] = await Promise.all([
    db.select().from(verificationsTable).orderBy(desc(verificationsTable.submittedAt)).limit(100),
    db.select().from(programsTable).orderBy(desc(programsTable.updatedAt)).limit(100),
    db.select().from(enrollmentsTable).orderBy(desc(enrollmentsTable.createdAt)).limit(100),
    db
      .select({ matching: matchingsTable })
      .from(matchingsTable)
      .innerJoin(
        companyTalentConsentsTable,
        and(
          eq(companyTalentConsentsTable.memberUserId, matchingsTable.candidateUserId),
          eq(companyTalentConsentsTable.companyUserId, matchingsTable.companyUserId),
          eq(companyTalentConsentsTable.status, "active"),
          gt(companyTalentConsentsTable.expiresAt, new Date()),
        ),
      )
      .innerJoin(
        memberProfilesTable,
        and(
          eq(memberProfilesTable.userId, matchingsTable.candidateUserId),
          eq(memberProfilesTable.dataConsent, true),
        ),
      )
      .orderBy(desc(matchingsTable.updatedAt))
      .limit(100)
      .then((rows) => rows.map(({ matching }) => matching)),
    db.select().from(transactionsTable).orderBy(desc(transactionsTable.occurredAt)).limit(100),
    getAuditLogs(user.role === "super_admin"),
  ]);

  const programNames = new Map(programs.map((program) => [program.id, program.name]));
  const enrollmentCounts = new Map<string, number>();
  const completionCounts = new Map<string, number>();
  for (const enrollment of enrollments) {
    if (enrollment.status !== "cancelled") {
      enrollmentCounts.set(enrollment.programId, (enrollmentCounts.get(enrollment.programId) ?? 0) + 1);
    }
    if (enrollment.status === "completed") {
      completionCounts.set(enrollment.programId, (completionCounts.get(enrollment.programId) ?? 0) + 1);
    }
  }

    const now = new Date();
  const verificationResponses = orderVerificationSlaItems(
    verifications.map((verification) => verificationResponse(verification, now)),
  );
  const pendingVerificationRows = verificationResponses.filter(
    (verification) => verification.slaStatus !== "resolved",
  );
  const pendingVerifications = pendingVerificationRows.length;
  const approachingVerifications = pendingVerificationRows.filter((verification) => verification.slaStatus === "approaching").length;
  const overdueVerifications = pendingVerificationRows.filter((verification) => verification.slaStatus === "overdue").length;
  const activeEnrollments = enrollments.filter(
    (enrollment) => enrollment.status === "pending" || enrollment.status === "enrolled",
  ).length;
  const revenue = transactions
    .filter((transaction) => transaction.status === "paid")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const pendingRevenue = transactions
    .filter((transaction) => transaction.status === "pending")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const transactionResponses = transactions.map((transaction) => transactionResponse(transaction));
  const reconciliationIssues = transactionResponses.filter(
    (transaction) => transaction.reconciliationStatus === "mismatch" || transaction.reconciliationStatus === "overdue",
  ).length;
  const overdueSettlements = transactionResponses.filter((transaction) =>
    transaction.reconciliationFlags.includes("settlement_sla_breached"),
  ).length;

  res.json(
    GetAdminOperationsResponse.parse({
      permissions: {
        canReviewVerifications: true,
        canManagePrograms: true,
        canManageEnrollments: true,
        canManagePlacements: true,
        canManageTransactions: user.role === "super_admin",
        canViewAudit: user.role === "super_admin",
      },
      summary: {
        pendingVerifications,
        approachingVerifications,
        overdueVerifications,
        activePrograms: programs.filter((program) => program.status === "published").length,
        activeEnrollments,
        completions: enrollments.filter((enrollment) => enrollment.status === "completed").length,
        placements: matchings.filter((matching) => matching.status === "placed").length,
        revenue,
        pendingRevenue,
        reconciliationIssues,
        overdueSettlements,
      },
      verificationSlaWorker: getVerificationSlaReminderWorkerStatus(),
      verifications: verificationResponses,
      programs: programs.map((program) =>
        programResponse(program, enrollmentCounts.get(program.id) ?? 0, completionCounts.get(program.id) ?? 0),
      ),
      enrollments: enrollments.map((enrollment) => ({
        ...enrollment,
        programName: programNames.get(enrollment.programId) ?? "Program tidak ditemukan",
        enrolledAt: iso(enrollment.enrolledAt),
        completedAt: iso(enrollment.completedAt),
        createdAt: enrollment.createdAt,
      })),
      matchings,
      transactions: transactionResponses,
      auditLogs,
    }),
  );
});

router.get("/admin/audit-logs", ...superAdminOnly, async (_req, res): Promise<void> => {
  res.json(ListAdminAuditLogsResponse.parse(await getAuditLogs(true)));
});

router.post(
  "/admin/transactions/settlement",
  requireUser,
  requireRole(...adminRoles),
  async (req, res): Promise<void> => {
    const rawSettledAt =
      typeof req.body === "object" && req.body !== null
        ? (req.body as Record<string, unknown>).settledAt
        : undefined;
    if (!isValidIsoDateTime(rawSettledAt)) {
      res.status(400).json({ error: "settledAt wajib berupa ISO date-time yang valid." });
      return;
    }

    const body = IngestAdminTransactionSettlementBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        error: "Settlement wajib memiliki referenceId atau invoiceNumber, nominal, dan waktu settlement yang valid.",
      });
      return;
    }

    const referenceId = body.data.referenceId?.trim();
    const invoiceNumber = body.data.invoiceNumber?.trim();
    if (!referenceId && !invoiceNumber) {
      res.status(400).json({ error: "referenceId atau invoiceNumber wajib diisi." });
      return;
    }

    const actor = getAuthenticatedUser(req);
    const settledAt = body.data.settledAt;
    const normalizedSettlementAmount = Number(body.data.settlementAmount.toFixed(2));
    const settlementAmount = normalizedSettlementAmount.toFixed(2);
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const invoiceCondition = invoiceNumber
        ? or(
            eq(transactionsTable.invoiceNumber, invoiceNumber),
            invoiceNumber.startsWith("INV-")
              ? and(
                  isNull(transactionsTable.invoiceNumber),
                  eq(transactionsTable.referenceId, invoiceNumber.slice(4)),
                )
              : undefined,
          )
        : undefined;
      const matches = await tx
        .select()
        .from(transactionsTable)
        .where(
          or(
            referenceId ? eq(transactionsTable.referenceId, referenceId) : undefined,
            invoiceCondition,
          ),
        )
        .orderBy(transactionsTable.id)
        .for("update");

      if (matches.length === 0) return { kind: "not_found" as const };
      if (matches.length > 1) return { kind: "ambiguous" as const };

      const existing = matches[0]!;
      const effectiveInvoiceNumber = existing.invoiceNumber ?? `INV-${existing.referenceId}`;
      if (
        (referenceId && existing.referenceId !== referenceId) ||
        (invoiceNumber && effectiveInvoiceNumber !== invoiceNumber)
      ) {
        return { kind: "conflicting_identifiers" as const };
      }

      const isIdempotentReplay =
        existing.settlementAmount !== null &&
        Number(existing.settlementAmount) === normalizedSettlementAmount &&
        existing.settledAt?.getTime() === settledAt.getTime();

      if (isIdempotentReplay) {
        return { kind: "ok" as const, transaction: existing };
      }

      const current = transactionResponse(existing, now);
      const [transaction] = await tx
        .update(transactionsTable)
        .set({
          settlementAmount,
          settledAt,
          reconciliationStatus: "pending",
          reconciliationResolvedAt: null,
          reconciliationResolvedByUserId: null,
          updatedAt: now,
        })
        .where(eq(programsTable.id, existing.id))
        .returning();
      const next = transactionResponse(transaction, now);

      await recordAudit(tx, actor, {
        action: "transaction.settlement_ingested",
        entityType: "transaction",
        entityId: existing.id,
        fromStatus: current.reconciliationStatus,
        toStatus: next.reconciliationStatus,
        note: `Settlement bank diterima melalui ${referenceId ? "referenceId" : "invoiceNumber"}.`,
      });
      return { kind: "ok" as const, transaction };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Transaksi dengan reference atau invoice tersebut tidak ditemukan." });
      return;
    }
    if (result.kind === "ambiguous") {
      res.status(409).json({ error: "Reference atau invoice tidak mengidentifikasi satu transaksi secara unik." });
      return;
    }
    if (result.kind === "conflicting_identifiers") {
      res.status(409).json({ error: "referenceId dan invoiceNumber tidak menunjuk ke transaksi yang sama." });
      return;
    }
    res.json(IngestAdminTransactionSettlementResponse.parse(transactionResponse(result.transaction, now)));
  },
);

router.post(
  "/admin/verifications/:id/decision",
  requireUser,
  requireRole(...adminRoles),
  async (req, res): Promise<void> => {
    const params = DecideVerificationParams.safeParse(req.params);
    const body = DecideVerificationBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Catatan penyelesaian wajib diisi minimal 3 karakter." });
      return;
    }
    const actor = getAuthenticatedUser(req);
    const [existing] = await db
      .select()
      .from(verificationsTable)
      .where(eq(verificationsTable.id, params.data.id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Item verifikasi tidak ditemukan." });
      return;
    }
    if (existing.status !== "pending") {
      res.status(409).json({ error: "Item verifikasi ini tidak sedang menunggu keputusan Admin." });
      return;
    }
    if (existing.subjectType === "competency") {
      const [evidence] = await db
        .select()
        .from(memberEvidenceTable)
        .where(and(eq(memberEvidenceTable.id, existing.subjectId), eq(memberEvidenceTable.memberUserId, existing.submittedByUserId)))
        .limit(1);
      if (!evidence) {
        res.status(404).json({ error: "Bukti kompetensi terkait tidak ditemukan." });
        return;
      }
    }
    const updated = await db.transaction(async (tx) => {
      const now = new Date();
      const [next] = await tx
        .update(verificationsTable)
        .set({
          status: body.data.status,
          reviewedByUserId: actor.id,
           reviewedAt: now,
          reviewNote: body.data.note,
        })
        .where(and(eq(verificationsTable.id, existing.id), eq(verificationsTable.status, existing.status)))
        .returning();
      if (!next) return null;
      if (next.subjectType === "competency") {
        await tx
          .update(memberEvidenceTable)
          .set({
            status: body.data.status === "approved"
              ? "verified"
              : body.data.status,
            verifiedAt: body.data.status === "approved" ? now : null,
            updatedAt: now,
          })
          .where(and(
            eq(memberEvidenceTable.id, next.subjectId),
            eq(memberEvidenceTable.memberUserId, next.submittedByUserId),
          ));
      }
      await recordAudit(tx, actor, {
        action: "verification.decision",
        entityType: existing.subjectType,
        entityId: existing.subjectId,
        fromStatus: existing.status,
        toStatus: body.data.status,
        note: body.data.note,
      });
      return next;
    });
    if (!updated) {
      res.status(409).json({ error: "Item verifikasi ini tidak sedang menunggu keputusan Admin." });
      return;
    }
    res.json(DecideVerificationResponse.parse(verificationResponse(updated)));
  },
);

router.post(
  "/admin/programs",
  requireUser,
  requireRole(...adminRoles),
  async (req, res): Promise<void> => {
    const parsed = CreateAdminProgramBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Data program belum lengkap atau tidak valid." });
      return;
    }
    const actor = getAuthenticatedUser(req);
    const [created] = await db.transaction(async (tx) => {
      const [program] = await tx
        .insert(programsTable)
        .values({ id: `program-${randomUUID()}`, ...parsed.data, price: String(parsed.data.price) })
        .returning();
      await recordAudit(tx, actor, {
        action: "program.created",
        entityType: "program",
        entityId: program.id,
        toStatus: program.status,
      });
      return [program];
    });
    res.status(201).json(CreateAdminProgramResponse.parse(programResponse(created)));
  },
);

router.patch(
  "/admin/programs/:id",
  requireUser,
  requireRole(...adminRoles),
  async (req, res): Promise<void> => {
    const params = UpdateAdminProgramParams.safeParse(req.params);
    const body = UpdateAdminProgramBody.safeParse(req.body);
    if (!params.success || !body.success || Object.keys(body.data).length === 0) {
      res.status(400).json({ error: "Perubahan program tidak valid." });
      return;
    }
    const actor = getAuthenticatedUser(req);
    const [existing] = await db.select().from(programsTable).where(eq(programsTable.id, params.data.id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Program tidak ditemukan." });
      return;
    }
    const [updated] = await db.transaction(async (tx) => {
      const [program] = await tx
        .update(programsTable)
        .set({
          ...body.data,
          ...(body.data.price === undefined ? {} : { price: String(body.data.price) }),
          updatedAt: new Date(),
        } as any)
        .where(eq(programsTable.id, existing.id))
        .returning();
      await recordAudit(tx, actor, {
        action: "program.updated",
        entityType: "program",
        entityId: existing.id,
        fromStatus: existing.status,
        toStatus: program.status,
        note: "Detail program atau publikasi diperbarui.",
      });
      return [program];
    });
    res.json(UpdateAdminProgramResponse.parse(programResponse(updated)));
  },
);

router.patch(
  "/admin/enrollments/:id",
  requireUser,
  requireRole(...adminRoles),
  async (req, res): Promise<void> => {
    const params = UpdateAdminEnrollmentParams.safeParse(req.params);
    const body = UpdateAdminEnrollmentBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Status enrollment tidak valid." });
      return;
    }
    const actor = getAuthenticatedUser(req);
    const [existing] = await db.select().from(enrollmentsTable).where(eq(enrollmentsTable.id, params.data.id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Enrollment tidak ditemukan." });
      return;
    }
    const now = new Date();
    const [updated] = await db.transaction(async (tx) => {
      const [enrollment] = await tx
        .update(enrollmentsTable)
        .set({
          status: body.data.status,
          enrolledAt: body.data.status === "enrolled" ? existing.enrolledAt ?? now : existing.enrolledAt,
          completedAt: body.data.status === "completed" ? now : null,
          updatedAt: now,
        })
        .where(eq(enrollmentsTable.id, existing.id))
        .returning();
      await recordAudit(tx, actor, {
        action: "enrollment.status_changed",
        entityType: "enrollment",
        entityId: existing.id,
        fromStatus: existing.status,
        toStatus: body.data.status,
        note: body.data.note,
      });
      return [enrollment];
    });
    const [program] = await db.select().from(programsTable).where(eq(programsTable.id, updated.programId)).limit(1);
    res.json(
      UpdateAdminEnrollmentResponse.parse({
        ...updated,
        programName: program?.name ?? "Program tidak ditemukan",
        enrolledAt: iso(updated.enrolledAt),
        completedAt: iso(updated.completedAt),
        createdAt: updated.createdAt,
      }),
    );
  },
);

router.patch(
  "/admin/matchings/:id",
  requireUser,
  requireRole(...adminRoles),
  async (req, res): Promise<void> => {
    const params = UpdateAdminMatchingParams.safeParse(req.params);
    const body = UpdateAdminMatchingBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Status matching tidak valid." });
      return;
    }
    const actor = getAuthenticatedUser(req);
    await expireCompanyTalentConsents();
    const [row] = await db
      .select({ matching: matchingsTable })
      .from(matchingsTable)
      .innerJoin(
        companyTalentConsentsTable,
        and(
          eq(companyTalentConsentsTable.memberUserId, matchingsTable.candidateUserId),
          eq(companyTalentConsentsTable.companyUserId, matchingsTable.companyUserId),
          eq(companyTalentConsentsTable.status, "active"),
          gt(companyTalentConsentsTable.expiresAt, new Date()),
        ),
      )
      .innerJoin(
        memberProfilesTable,
        and(
          eq(memberProfilesTable.userId, matchingsTable.candidateUserId),
          eq(memberProfilesTable.dataConsent, true),
        ),
      )
      .where(eq(matchingsTable.id, params.data.id))
      .limit(1);
    const existing = row?.matching;
    if (!existing) {
      res.status(404).json({ error: "Matching tidak ditemukan." });
      return;
    }
    const [updated] = await db.transaction(async (tx) => {
      const [matching] = await tx
        .update(matchingsTable)
        .set({ status: body.data.status, updatedAt: new Date() })
        .where(eq(matchingsTable.id, existing.id))
        .returning();
      await recordAudit(tx, actor, {
        action: "matching.pipeline_changed",
        entityType: "matching",
        entityId: existing.id,
        fromStatus: existing.status,
        toStatus: body.data.status,
        note: body.data.note,
      });
      return [matching];
    });
    res.json(UpdateAdminMatchingResponse.parse(updated));
  },
);

router.patch(
  "/admin/transactions/:id",
  ...superAdminOnly,
  async (req, res): Promise<void> => {
    const params = UpdateAdminTransactionParams.safeParse(req.params);
    const body = UpdateAdminTransactionBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Status transaksi dan catatan wajib diisi." });
      return;
    }
    const actor = getAuthenticatedUser(req);
    const [existing] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, params.data.id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Transaksi tidak ditemukan." });
      return;
    }
    const [updated] = await db.transaction(async (tx) => {
      const [transaction] = await tx
        .update(transactionsTable)
        .set({ status: body.data.status, updatedAt: new Date() })
        .where(eq(transactionsTable.id, existing.id))
        .returning();
      await recordAudit(tx, actor, {
        action: "transaction.status_changed",
        entityType: "transaction",
        entityId: existing.id,
        fromStatus: existing.status,
        toStatus: body.data.status,
        note: body.data.note,
      });
      return [transaction];
    });
    res.json(
      UpdateAdminTransactionResponse.parse(transactionResponse(updated)),
    );
  },
);

router.patch(
  "/admin/transactions/:id/reconciliation",
  ...superAdminOnly,
  async (req, res): Promise<void> => {
    const params = ResolveAdminTransactionReconciliationParams.safeParse(req.params);
    const body = ResolveAdminTransactionReconciliationBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Catatan penyelesaian wajib diisi minimal 3 karakter." });
      return;
    }
    const actor = getAuthenticatedUser(req);
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(transactionsTable)
        .where(eq(transactionsTable.id, params.data.id))
        .limit(1)
        .for("update");
      if (!existing) return { kind: "not_found" as const };

      const current = transactionResponse(existing);
      if (current.reconciliationStatus === "resolved") {
        return { kind: "already_resolved" as const };
      }

      const now = new Date();
      const [transaction] = await tx
        .update(transactionsTable)
        .set({
          reconciliationStatus: "resolved",
          reconciliationResolvedAt: now,
          reconciliationResolvedByUserId: actor.id,
          updatedAt: now,
        })
        .where(eq(transactionsTable.id, existing.id))
        .returning();
      await recordAudit(tx, actor, {
        action: "transaction.reconciliation_resolved",
        entityType: "transaction_reconciliation",
        entityId: existing.id,
        fromStatus: current.reconciliationStatus,
        toStatus: "resolved",
        note: body.data.note,
      });
      return { kind: "resolved" as const, transaction, now };
    });
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Transaksi tidak ditemukan." });
      return;
    }
    if (result.kind === "already_resolved") {
      res.status(409).json({ error: "Rekonsiliasi transaksi ini sudah diselesaikan." });
      return;
    }
    res.json(
      ResolveAdminTransactionReconciliationResponse.parse(
        transactionResponse(result.transaction, result.now),
      ),
    );
  },
);

export default router;
