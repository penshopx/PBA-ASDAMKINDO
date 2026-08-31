import { randomUUID } from "node:crypto";
import { and, eq, lte, sql } from "drizzle-orm";
import {
  auditLogsTable,
  companyTalentConsentsTable,
  db,
  notificationsTable,
  talentConsentSettingsTable,
} from "@workspace/db";

export const DEFAULT_CONSENT_SETTING_ID = "talent-pool-default";

export async function getTalentConsentSettings() {
  await db
    .insert(talentConsentSettingsTable)
    .values({ id: DEFAULT_CONSENT_SETTING_ID, defaultDurationDays: 90 })
    .onConflictDoNothing({ target: talentConsentSettingsTable.id });
  const [settings] = await db
    .select()
    .from(talentConsentSettingsTable)
    .where(eq(talentConsentSettingsTable.id, DEFAULT_CONSENT_SETTING_ID))
    .limit(1);
  if (!settings) throw new Error("Konfigurasi consent Talent Pool tidak tersedia.");
  return settings;
}

export function consentExpiry(defaultDurationDays: number, now = new Date()) {
  return new Date(now.getTime() + defaultDurationDays * 24 * 60 * 60 * 1000);
}

export async function recordConsentAudit(
  executor: any,
  actor: { id: string; role: string },
  values: {
    action: string;
    entityId: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    note?: string | null;
  },
) {
  await executor.insert(auditLogsTable).values({
    id: randomUUID(),
    actorUserId: actor.id,
    actorRole: actor.role,
    entityType: "company_talent_consent",
    ...values,
  });
}

export async function expireCompanyTalentConsents(now = new Date()) {
  return db.transaction(async (tx) => {
    const expired = await tx
      .update(companyTalentConsentsTable)
      .set({
        status: "expired",
        revokedAt: now,
        decisionNote: "Masa berlaku consent berakhir otomatis.",
        consentVersion: sql`${companyTalentConsentsTable.consentVersion} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(companyTalentConsentsTable.status, "active"),
          lte(companyTalentConsentsTable.expiresAt, now),
        ),
      )
      .returning();

    for (const consent of expired) {
      await recordConsentAudit(
        tx,
        { id: consent.memberUserId, role: "system" },
        {
          action: "talent_consent.expired",
          entityId: consent.id,
          fromStatus: "active",
          toStatus: "expired",
          note: `Consent perusahaan ${consent.companyUserId} kedaluwarsa otomatis.`,
        },
      );
      await tx.insert(notificationsTable).values([
        {
          id: `notification-${randomUUID()}`,
          userId: consent.memberUserId,
          title: "Akses perusahaan telah kedaluwarsa",
          description: "Masa berlaku salah satu persetujuan Talent Pool Anda telah berakhir.",
          type: "consent",
          dedupeKey: `consent-expired:${consent.id}:v${consent.consentVersion}:member`,
        },
        {
          id: `notification-${randomUUID()}`,
          userId: consent.companyUserId,
          title: "Persetujuan kandidat telah berakhir",
          description: "Akses Talent Pool untuk salah satu kandidat telah kedaluwarsa.",
          type: "consent",
          dedupeKey: `consent-expired:${consent.id}:v${consent.consentVersion}:company`,
        },
      ]);
    }
    return expired;
  });
}