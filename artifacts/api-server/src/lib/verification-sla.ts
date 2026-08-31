import { randomUUID } from "node:crypto";
import { eq, inArray, or } from "drizzle-orm";
import {
  db,
  notificationsTable,
  usersTable,
  verificationsTable,
} from "@workspace/db";

export const VERIFICATION_SLA_HOURS = 72;
const WARNING_THRESHOLD = 0.75;

export type VerificationSlaStatus = "on_track" | "approaching" | "overdue" | "resolved";
export type VerificationSlaPriority = "normal" | "high" | "urgent";

export function getVerificationSla(
  verification: typeof verificationsTable.$inferSelect,
  now = new Date(),
) {
  const isPending = verification.status === "pending" || verification.status === "changes_requested";
  const slaDueAt = new Date(verification.submittedAt.getTime() + VERIFICATION_SLA_HOURS * 60 * 60 * 1000);
  const pendingAgeHours = Math.max(
    0,
    Math.round(((now.getTime() - verification.submittedAt.getTime()) / (60 * 60 * 1000)) * 10) / 10,
  );
  const slaStatus: VerificationSlaStatus = !isPending
    ? "resolved"
    : now.getTime() >= slaDueAt.getTime()
      ? "overdue"
      : pendingAgeHours >= VERIFICATION_SLA_HOURS * WARNING_THRESHOLD
        ? "approaching"
        : "on_track";
  const slaPriority: VerificationSlaPriority =
    slaStatus === "overdue" ? "urgent" : slaStatus === "approaching" ? "high" : "normal";

  return { pendingAgeHours, slaDueAt, slaStatus, slaPriority };
}

export async function syncVerificationSlaReminders(
  verifications?: typeof verificationsTable.$inferSelect[],
) {
  const [verificationRows, admins] = await Promise.all([
    verifications
      ? Promise.resolve(verifications)
      : db
          .select()
          .from(verificationsTable)
          .where(or(eq(verificationsTable.status, "pending"), eq(verificationsTable.status, "changes_requested"))),
    db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(or(eq(usersTable.role, "admin"), eq(usersTable.role, "super_admin"))),
  ]);
  if (admins.length === 0) return;

  const reminders = verificationRows
    .map((verification) => ({ verification, sla: getVerificationSla(verification) }))
    .filter(({ sla }) => sla.slaStatus === "approaching" || sla.slaStatus === "overdue");
  if (reminders.length === 0) return;

  const candidates = reminders.flatMap(({ verification, sla }) =>
    admins.map((admin) => ({
      verification,
      sla,
      adminId: admin.id,
      dedupeKey: `verification-sla:${verification.id}:${sla.slaStatus}:${admin.id}`,
    })),
  );
  const existing = await db
    .select({ dedupeKey: notificationsTable.dedupeKey })
    .from(notificationsTable)
    .where(inArray(notificationsTable.dedupeKey, candidates.map((candidate) => candidate.dedupeKey)));
  const existingKeys = new Set(existing.map((notification) => notification.dedupeKey));
  const values = candidates
    .filter((candidate) => !existingKeys.has(candidate.dedupeKey))
    .map(({ verification, sla, adminId, dedupeKey }) => {
      const title = sla.slaStatus === "overdue"
        ? "Verifikasi melewati SLA"
        : "Verifikasi segera mencapai SLA";
      const age = `${sla.pendingAgeHours} jam tertunda`;
      return {
        id: `notification-${randomUUID()}`,
        userId: adminId,
        title,
        description: `${verification.subjectName} (${verification.evidenceType}) sudah ${age}. Prioritaskan keputusan sebelum antrean semakin tertunda.`,
        type: "system",
        dedupeKey,
      };
    });
  if (values.length > 0) {
    await db.insert(notificationsTable).values(values).onConflictDoNothing();
  }
}