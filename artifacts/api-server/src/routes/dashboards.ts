import { count, desc, eq, or, sum } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetAdminDashboardResponse,
  GetCompanyDashboardResponse,
  GetMemberDashboardResponse,
} from "@workspace/api-zod";
import {
  companyProfilesTable,
  db,
  enrollmentsTable,
  matchingsTable,
  memberEvidenceTable,
  memberProfilesTable,
  programProgressTable,
  programsTable,
  readinessDiagnosticsTable,
  transactionsTable,
  usersTable,
  verificationsTable,
} from "@workspace/db";
import { getAuthenticatedUser, requireUser } from "../lib/auth";

const router: IRouter = Router();
const numberFromCount = (value: string | number): number => Number(value);

router.get("/dashboard/member", requireUser, async (req, res): Promise<void> => {
  const user = getAuthenticatedUser(req);
  const [[profile], [diagnostic], [evidenceSummary], enrollments, progressRows, opportunities] = await Promise.all([
    db.select().from(memberProfilesTable).where(eq(memberProfilesTable.userId, user.id)).limit(1),
    db.select().from(readinessDiagnosticsTable).where(eq(readinessDiagnosticsTable.memberUserId, user.id)).limit(1),
    db.select({ value: count(memberEvidenceTable.id) }).from(memberEvidenceTable).where(eq(memberEvidenceTable.memberUserId, user.id)),
    db.select().from(enrollmentsTable).where(eq(enrollmentsTable.memberUserId, user.id)).orderBy(desc(enrollmentsTable.updatedAt)),
    db.select().from(programProgressTable).where(eq(programProgressTable.memberUserId, user.id)),
    db.select().from(matchingsTable).where(eq(matchingsTable.candidateUserId, user.id)),
  ]);
  const profileCompletion = profile
    ? [profile.phone, profile.domicile, profile.education, profile.expertise].filter(Boolean).length * 20
    : 20;
  const activeEnrollment = enrollments.find((enrollment) => enrollment.status === "enrolled" || enrollment.status === "pending");
  const [activeProgram] = activeEnrollment
    ? await db.select().from(programsTable).where(eq(programsTable.id, activeEnrollment.programId)).limit(1)
    : [];
  const storedProgress = activeEnrollment ? progressRows.find((row) => row.programId === activeEnrollment.programId) : undefined;
  const progress = storedProgress?.progress ?? (activeEnrollment?.status === "enrolled" ? 24 : 0);
  const readinessScore = diagnostic?.score ?? 0;
  const readinessLabel = readinessScore >= 80 ? "Sangat Siap" : readinessScore >= 60 ? "Cukup Siap" : readinessScore > 0 ? "Perlu Diperkuat" : "Belum Dinilai";
  const evidenceCount = Number(evidenceSummary?.value ?? 0);
  res.json(
    GetMemberDashboardResponse.parse({
      greeting: `Selamat datang, ${user.name.split(" ")[0]}`,
      profileCompletion: Math.min(profileCompletion, 100),
      readinessScore,
      readinessLabel,
      metrics: [
        { label: "Kelengkapan profil", value: `${Math.min(profileCompletion, 100)}%`, change: "Lengkapi untuk diverifikasi", tone: profileCompletion < 80 ? "warning" : "positive" },
        { label: "Readiness score", value: diagnostic ? String(readinessScore) : "—", change: diagnostic ? "Diagnostik terakhir" : "Belum dikerjakan", tone: diagnostic ? "positive" : "warning" },
        { label: "Peluang relevan", value: String(opportunities.length), change: "Berdasarkan profil Anda", tone: opportunities.length ? "positive" : "neutral" },
      ],
      nextAction: {
        title: !diagnostic ? "Mulai diagnostik kompetensi" : evidenceCount === 0 ? "Tambahkan bukti pengalaman" : !activeProgram ? "Pilih program yang sesuai" : "Lanjutkan perjalanan kompetensi",
        description: !diagnostic ? "Pahami kesiapan Anda sebelum memilih program Bimtek." : evidenceCount === 0 ? "Satu bukti kerja membuat profil Anda lebih kuat." : !activeProgram ? "Tutup gap kompetensi dengan program yang paling relevan." : "Pantau progres, bukti, dan peluang Anda dalam satu tempat.",
        href: !activeProgram && diagnostic && evidenceCount > 0 ? "/programs" : "/member/journey",
        tone: "primary",
      },
      activeProgram: activeProgram?.name ?? null,
      progress,
      notificationsCount: evidenceCount + opportunities.length,
    }),
  );
});

router.get("/dashboard/company", requireUser, async (req, res): Promise<void> => {
  const user = getAuthenticatedUser(req);
  const [[members], [programs]] = await Promise.all([
    db.select({ value: count(memberProfilesTable.id) }).from(memberProfilesTable),
    db.select({ value: count(programsTable.id) }).from(programsTable).where(eq(programsTable.status, "published")),
  ]);
  res.json(
    GetCompanyDashboardResponse.parse({
      greeting: `Selamat datang, ${user.organization ?? user.name}`,
      metrics: [
        { label: "Kebutuhan aktif", value: "3", change: "1 mendekati tanggal mulai", tone: "warning" },
        { label: "Kandidat cocok", value: String(numberFromCount(members?.value ?? 0)), change: "Dari Talent Pool", tone: "positive" },
        { label: "Dalam shortlist", value: "7", change: "2 perlu ditindaklanjuti", tone: "neutral" },
      ],
      nextAction: { title: "Tinjau kandidat baru", description: "Ada kandidat yang sesuai dengan kebutuhan tenaga Anda.", href: "/company/candidates", tone: "primary" },
      activeRequirements: 3,
      matchingCandidates: numberFromCount(members?.value ?? 0),
      shortlistCount: 7,
      notificationsCount: numberFromCount(programs?.value ?? 0),
    }),
  );
});

router.get("/dashboard/admin", requireUser, async (req, res): Promise<void> => {
  const user = getAuthenticatedUser(req);
  if (user.role !== "admin" && user.role !== "super_admin") {
    res.status(403).json({ error: "Anda tidak memiliki akses ke dashboard Admin PBA." });
    return;
  }
  const [[members], [companies], [programs], [verified], [pending], [placements], [paidRevenue]] = await Promise.all([
    db.select({ value: count(usersTable.id) }).from(usersTable).where(eq(usersTable.role, "member")),
    db.select({ value: count(companyProfilesTable.id) }).from(companyProfilesTable),
    db.select({ value: count(programsTable.id) }).from(programsTable).where(eq(programsTable.status, "published")),
    db.select({ value: count(verificationsTable.id) }).from(verificationsTable).where(eq(verificationsTable.status, "approved")),
    db.select({ value: count(verificationsTable.id) }).from(verificationsTable).where(or(eq(verificationsTable.status, "pending"), eq(verificationsTable.status, "changes_requested"))),
    db.select({ value: count(matchingsTable.id) }).from(matchingsTable).where(eq(matchingsTable.status, "placed")),
    db.select({ value: sum(transactionsTable.amount) }).from(transactionsTable).where(eq(transactionsTable.status, "paid")),
  ]);
  const pendingCount = numberFromCount(pending?.value ?? 0);
  const revenueValue = Number(paidRevenue?.value ?? 0);
  const formattedRevenue = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(revenueValue);
  res.json(
    GetAdminDashboardResponse.parse({
      greeting: `Selamat datang, ${user.name.split(" ")[0]}`,
      metrics: [
        { label: "Anggota aktif", value: String(numberFromCount(members?.value ?? 0)), change: "+12% bulan ini", tone: "positive" },
        { label: "Talent terverifikasi", value: String(numberFromCount(verified?.value ?? 0)), change: `${pendingCount} menunggu verifikasi`, tone: pendingCount > 0 ? "warning" : "positive" },
        { label: "Penempatan", value: String(numberFromCount(placements?.value ?? 0)), change: "Dari pipeline matching", tone: "positive" },
        { label: "Pendapatan program", value: formattedRevenue, change: "Status paid", tone: "positive" },
      ],
      nextAction: { title: pendingCount > 0 ? "Verifikasi dokumen tertunda" : "Tinjau pipeline operasi", description: pendingCount > 0 ? "Buka pusat operasi untuk memeriksa antrean dan mencatat keputusan." : "Periksa program, placement, dan settlement terbaru di pusat operasi.", href: "/admin/operations", tone: pendingCount > 0 ? "warning" : "primary" },
      pendingVerifications: pendingCount,
      activeMembers: numberFromCount(members?.value ?? 0),
      activeCompanies: numberFromCount(companies?.value ?? 0),
      activeRequirements: 5,
      placements: numberFromCount(placements?.value ?? 0),
      revenue: formattedRevenue,
    }),
  );
});

export default router;