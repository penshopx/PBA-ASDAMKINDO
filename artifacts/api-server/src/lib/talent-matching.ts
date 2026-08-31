import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  or,
  sql,
} from "drizzle-orm";
import {
  companyProfilesTable,
  companyRequirementsTable,
  companyTalentConsentsTable,
  db,
  matchingsTable,
  memberProfilesTable,
  professionalPassportsTable,
  readinessDiagnosticsTable,
  usersTable,
} from "@workspace/db";

export type VerificationStatus = "verified" | "pending" | "unverified";
export type CandidateStatus = "new" | "review" | "shortlisted" | "interview" | "placed" | "declined";

export type TalentMatchingFilters = {
  requirementId?: string;
  companyId?: string;
  search?: string;
  minScore: number;
  location?: string;
  skkLevel?: number;
  experienceMin?: number;
  availability?: "available" | "open_to_offer" | "unavailable";
  verificationStatus?: VerificationStatus;
  status?: CandidateStatus;
  page: number;
  pageSize: number;
};

type Requirement = typeof companyRequirementsTable.$inferSelect;
type Profile = typeof memberProfilesTable.$inferSelect;
type Passport = typeof professionalPassportsTable.$inferSelect;

const normalize = (value: string) => value.trim().toLocaleLowerCase("id-ID");
const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function containsEither(left: string, right: string): boolean {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return Boolean(
    normalizedLeft &&
      normalizedRight &&
      (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)),
  );
}

function matchingExpressions() {
  const jobTitle = sql<number>`CASE
    WHEN trim(${companyRequirementsTable.title}) <> '' AND (
      (trim(${memberProfilesTable.jobTitle}) <> '' AND (
        lower(${memberProfilesTable.jobTitle}) LIKE '%' || lower(${companyRequirementsTable.title}) || '%'
        OR lower(${companyRequirementsTable.title}) LIKE '%' || lower(${memberProfilesTable.jobTitle}) || '%'
      ))
      OR (trim(${professionalPassportsTable.headline}) <> '' AND (
        lower(${professionalPassportsTable.headline}) LIKE '%' || lower(${companyRequirementsTable.title}) || '%'
        OR lower(${companyRequirementsTable.title}) LIKE '%' || lower(${professionalPassportsTable.headline}) || '%'
      ))
      OR lower(${professionalPassportsTable.preferredRoles}::text) LIKE '%' || lower(${companyRequirementsTable.title}) || '%'
    ) THEN 25 ELSE 0 END`;

  const skkLevel = sql<number>`CASE
    WHEN ${companyRequirementsTable.minimumSkkLevel} <= 0 THEN 20
    WHEN ${memberProfilesTable.skkLevel} >= ${companyRequirementsTable.minimumSkkLevel} THEN 20
    WHEN ${memberProfilesTable.skkLevel} > 0
      THEN round((${memberProfilesTable.skkLevel}::numeric / ${companyRequirementsTable.minimumSkkLevel}) * 20)::int
    ELSE 0 END`;

  const requiredCompetencies = sql<number>`coalesce((
    SELECT CASE
      WHEN count(*) FILTER (WHERE trim(required_competency) <> '') = 0 THEN 0
      ELSE round(
        (
          count(*) FILTER (
            WHERE trim(required_competency) <> ''
              AND lower(${memberProfilesTable.expertise}) LIKE '%' || lower(trim(required_competency)) || '%'
          )
        )::numeric * 20
        / count(*) FILTER (WHERE trim(required_competency) <> '')
      )::int
    END
    FROM unnest(${companyRequirementsTable.competencies}) AS required_competency
  ), 0)`;

  const experience = sql<number>`CASE
    WHEN ${companyRequirementsTable.minimumExperience} <= 0 THEN 15
    WHEN ${memberProfilesTable.experienceYears} >= ${companyRequirementsTable.minimumExperience} THEN 15
    WHEN ${memberProfilesTable.experienceYears} > 0
      THEN round((${memberProfilesTable.experienceYears}::numeric / ${companyRequirementsTable.minimumExperience}) * 15)::int
    ELSE 0 END`;

  const location = sql<number>`CASE
    WHEN trim(${companyRequirementsTable.location}) <> '' AND (
      lower(${memberProfilesTable.domicile}) LIKE '%' || lower(${companyRequirementsTable.location}) || '%'
      OR lower(${companyRequirementsTable.location}) LIKE '%' || lower(${memberProfilesTable.domicile}) || '%'
      OR lower(${professionalPassportsTable.preferredLocations}::text) LIKE '%' || lower(${companyRequirementsTable.location}) || '%'
    ) THEN 10 ELSE 0 END`;

  const availability = sql<number>`CASE ${professionalPassportsTable.availabilityStatus}
    WHEN 'available' THEN 10
    WHEN 'open_to_offer' THEN 7
    ELSE 0 END`;

  const score = sql<number>`(
    ${jobTitle} + ${skkLevel} + ${requiredCompetencies} + ${experience} + ${location} + ${availability}
  )::int`;

  const verificationStatus = sql<VerificationStatus>`CASE
    WHEN EXISTS (
      SELECT 1 FROM member_evidence verified_evidence
      WHERE verified_evidence.member_user_id = ${memberProfilesTable.userId}
        AND verified_evidence.status = 'verified'
    ) THEN 'verified'
    WHEN EXISTS (
      SELECT 1 FROM member_evidence pending_evidence
      WHERE pending_evidence.member_user_id = ${memberProfilesTable.userId}
        AND pending_evidence.status IN ('submitted', 'changes_requested')
    ) THEN 'pending'
    ELSE 'unverified' END`;

  return { score, verificationStatus };
}

function candidateStatusExpression() {
  return sql<CandidateStatus>`coalesce(${matchingsTable.status}, 'new')`;
}

function matchingFilters(filters: TalentMatchingFilters) {
  const { score, verificationStatus } = matchingExpressions();
  const status = candidateStatusExpression();
  return and(
    eq(usersTable.role, "member"),
    eq(memberProfilesTable.dataConsent, true),
    eq(companyTalentConsentsTable.status, "active"),
    gt(companyTalentConsentsTable.expiresAt, new Date()),
    filters.requirementId ? eq(companyRequirementsTable.id, filters.requirementId) : undefined,
    filters.companyId ? eq(companyRequirementsTable.companyUserId, filters.companyId) : undefined,
    filters.search
      ? or(
          ilike(usersTable.name, `%${filters.search}%`),
          ilike(memberProfilesTable.jobTitle, `%${filters.search}%`),
          ilike(memberProfilesTable.expertise, `%${filters.search}%`),
          ilike(professionalPassportsTable.headline, `%${filters.search}%`),
          ilike(companyRequirementsTable.title, `%${filters.search}%`),
          ilike(companyProfilesTable.companyName, `%${filters.search}%`),
        )
      : undefined,
    filters.location
      ? or(
          ilike(memberProfilesTable.domicile, `%${filters.location}%`),
          sql`${professionalPassportsTable.preferredLocations}::text ILIKE ${`%${filters.location}%`}`,
        )
      : undefined,
    filters.skkLevel === undefined ? undefined : gte(memberProfilesTable.skkLevel, filters.skkLevel),
    filters.experienceMin === undefined
      ? undefined
      : gte(memberProfilesTable.experienceYears, filters.experienceMin),
    filters.availability
      ? eq(professionalPassportsTable.availabilityStatus, filters.availability)
      : undefined,
    filters.verificationStatus
      ? sql`${verificationStatus} = ${filters.verificationStatus}`
      : undefined,
    filters.status ? sql`${status} = ${filters.status}` : undefined,
    gte(score, filters.minScore),
  );
}

function candidateQueryBase() {
  return db
    .select({
      requirement: companyRequirementsTable,
      companyName: companyProfilesTable.companyName,
      memberName: usersTable.name,
      profile: memberProfilesTable,
      passport: professionalPassportsTable,
      diagnostic: readinessDiagnosticsTable,
      matching: matchingsTable,
      score: matchingExpressions().score,
      verificationStatus: matchingExpressions().verificationStatus,
    })
    .from(companyRequirementsTable)
    .innerJoin(companyProfilesTable, eq(companyProfilesTable.userId, companyRequirementsTable.companyUserId))
    .innerJoin(
      companyTalentConsentsTable,
      eq(companyTalentConsentsTable.companyUserId, companyRequirementsTable.companyUserId),
    )
    .innerJoin(memberProfilesTable, eq(memberProfilesTable.userId, companyTalentConsentsTable.memberUserId))
    .innerJoin(usersTable, eq(usersTable.id, memberProfilesTable.userId))
    .innerJoin(
      professionalPassportsTable,
      eq(professionalPassportsTable.memberUserId, memberProfilesTable.userId),
    )
    .leftJoin(
      readinessDiagnosticsTable,
      eq(readinessDiagnosticsTable.memberUserId, memberProfilesTable.userId),
    )
    .leftJoin(
      matchingsTable,
      and(
        eq(matchingsTable.requirementId, companyRequirementsTable.id),
        eq(matchingsTable.companyUserId, companyRequirementsTable.companyUserId),
        eq(matchingsTable.candidateUserId, memberProfilesTable.userId),
      ),
    );
}

function countQueryBase() {
  return db
    .select({ value: count() })
    .from(companyRequirementsTable)
    .innerJoin(companyProfilesTable, eq(companyProfilesTable.userId, companyRequirementsTable.companyUserId))
    .innerJoin(
      companyTalentConsentsTable,
      eq(companyTalentConsentsTable.companyUserId, companyRequirementsTable.companyUserId),
    )
    .innerJoin(memberProfilesTable, eq(memberProfilesTable.userId, companyTalentConsentsTable.memberUserId))
    .innerJoin(usersTable, eq(usersTable.id, memberProfilesTable.userId))
    .innerJoin(
      professionalPassportsTable,
      eq(professionalPassportsTable.memberUserId, memberProfilesTable.userId),
    )
    .leftJoin(
      matchingsTable,
      and(
        eq(matchingsTable.requirementId, companyRequirementsTable.id),
        eq(matchingsTable.companyUserId, companyRequirementsTable.companyUserId),
        eq(matchingsTable.candidateUserId, memberProfilesTable.userId),
      ),
    );
}

export function scoreCandidate(requirement: Requirement, profile: Profile, passport: Passport) {
  const jobTitle = profile.jobTitle || passport.headline;
  const titleMatch =
    containsEither(jobTitle, requirement.title) ||
    containsEither(passport.headline, requirement.title) ||
    asStrings(passport.preferredRoles).some((role) => containsEither(role, requirement.title));
  const jobTitleScore = titleMatch ? 25 : 0;

  const skkLevelScore =
    requirement.minimumSkkLevel <= 0
      ? 20
      : profile.skkLevel >= requirement.minimumSkkLevel
        ? 20
        : profile.skkLevel > 0
          ? Math.round((profile.skkLevel / requirement.minimumSkkLevel) * 20)
          : 0;

  const requiredCompetencies = requirement.competencies.map((item) => item.trim()).filter(Boolean);
  const expertise = normalize(profile.expertise);
  const matchedCompetencies = requiredCompetencies.filter((item) => expertise.includes(normalize(item)));
  const unmetCompetencies = requiredCompetencies.filter((item) => !expertise.includes(normalize(item)));
  const competencyScore = requiredCompetencies.length
    ? Math.round((matchedCompetencies.length / requiredCompetencies.length) * 20)
    : 0;

  const experienceScore =
    requirement.minimumExperience <= 0
      ? 15
      : profile.experienceYears >= requirement.minimumExperience
        ? 15
        : profile.experienceYears > 0
          ? Math.round((profile.experienceYears / requirement.minimumExperience) * 15)
          : 0;

  const preferredLocations = asStrings(passport.preferredLocations);
  const locationMatch =
    containsEither(profile.domicile, requirement.location) ||
    preferredLocations.some((location) => containsEither(location, requirement.location));
  const locationScore = locationMatch ? 10 : 0;
  const availabilityScore =
    passport.availabilityStatus === "available"
      ? 10
      : passport.availabilityStatus === "open_to_offer"
        ? 7
        : 0;

  const scoreBreakdown = {
    jobTitle: jobTitleScore,
    skkLevel: skkLevelScore,
    requiredCompetencies: competencyScore,
    experience: experienceScore,
    location: locationScore,
    availability: availabilityScore,
  };
  const score = Object.values(scoreBreakdown).reduce((total, value) => total + value, 0);
  const matchReasons = [
    titleMatch
      ? `Jabatan ${jobTitle || "pada profil"} selaras dengan kebutuhan.`
      : `Jabatan belum selaras penuh dengan ${requirement.title}.`,
    requirement.minimumSkkLevel <= 0
      ? "Kebutuhan tidak menetapkan minimum jenjang SKK."
      : profile.skkLevel >= requirement.minimumSkkLevel
        ? `SKK jenjang ${profile.skkLevel} memenuhi minimum ${requirement.minimumSkkLevel}.`
        : `SKK jenjang ${profile.skkLevel} belum mencapai minimum ${requirement.minimumSkkLevel}.`,
    `${matchedCompetencies.length} dari ${requiredCompetencies.length} kompetensi wajib cocok.`,
    profile.experienceYears >= requirement.minimumExperience
      ? `Pengalaman ${profile.experienceYears} tahun memenuhi minimum.`
      : `Pengalaman ${profile.experienceYears} tahun belum mencapai minimum ${requirement.minimumExperience} tahun.`,
    locationMatch
      ? `Domisili atau preferensi relokasi selaras dengan ${requirement.location}.`
      : `Lokasi ${requirement.location} belum ada di domisili atau preferensi relokasi.`,
    passport.availabilityStatus === "available"
      ? "Kandidat tersedia saat ini."
      : passport.availabilityStatus === "open_to_offer"
        ? "Kandidat terbuka untuk penawaran."
        : "Kandidat sedang tidak tersedia.",
  ];

  return { score, scoreBreakdown, matchedCompetencies, unmetCompetencies, matchReasons };
}

export async function listTalentMatches(filters: TalentMatchingFilters) {
  const where = matchingFilters(filters);
  const { score } = matchingExpressions();
  const [totalRows, rows] = await Promise.all([
    countQueryBase().where(where),
    candidateQueryBase()
      .where(where)
      .orderBy(desc(score), desc(readinessDiagnosticsTable.score), desc(professionalPassportsTable.updatedAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
  ]);

  const items = rows.map((row) => {
    const scored = scoreCandidate(row.requirement, row.profile, row.passport);
    return {
      candidateId: row.passport.id,
      name: row.memberName,
      domicile: row.profile.domicile,
      jobTitle: row.profile.jobTitle || row.passport.headline,
      expertise: row.profile.expertise,
      skkLevel: row.profile.skkLevel,
      experienceYears: row.profile.experienceYears,
      availabilityStatus: row.passport.availabilityStatus as "available" | "open_to_offer" | "unavailable",
      verificationStatus: row.verificationStatus,
      readinessScore: row.diagnostic?.score ?? 0,
      readinessLabel:
        (row.diagnostic?.score ?? 0) >= 80
          ? "Sangat siap"
          : (row.diagnostic?.score ?? 0) >= 60
            ? "Cukup siap"
            : (row.diagnostic?.score ?? 0) > 0
              ? "Perlu diperkuat"
              : "Belum dinilai",
      score: scored.score,
      matchReasons: scored.matchReasons,
      matchedCompetencies: scored.matchedCompetencies,
      unmetCompetencies: scored.unmetCompetencies,
      scoreBreakdown: scored.scoreBreakdown,
      matchingId: row.matching?.id ?? null,
      status: (row.matching?.status ?? "new") as CandidateStatus,
      requirementId: row.requirement.id,
      requirementTitle: row.requirement.title,
      companyName: row.companyName,
    };
  });
  const total = Number(totalRows[0]?.value ?? 0);
  return {
    items,
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}