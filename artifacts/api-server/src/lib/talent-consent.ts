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
  actor: { id: string | null; role: string },
  values: {
    action: string;
    entityId: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    note?: string | null;
    consentVersion?: number;
  },
) {
  const { consentVersion, ...columns } = values;
  await executor.insert(auditLogsTable).values({
    id: randomUUID(),
    actorUserId: actor.id,
    actorRole: actor.role,
    entityType: "company_talent_consent",
    ...columns,
    metadata: consentVersion ? { consentVersion } : {},
  });
}

export async function lockCompanyTalentConsentPair(executor: any, memberUserId: string, companyUserId: string) {
  await executor.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${memberUserId}:${companyUserId}`}, 0))`);
}

async function recordExpirySideEffects(executor: any, consent: typeof companyTalentConsentsTable.$inferSelect) {
  await recordConsentAudit(
    executor,
    { id: null, role: "system" },
    {
      action: "talent_consent.expired",
      entityId: consent.id,
      fromStatus: "active",
      toStatus: "expired",
      note: "Masa berlaku consent berakhir otomatis.",
      consentVersion: consent.consentVersion,
    },
  );
  await executor.insert(notificationsTable).values([
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

export async function expireCompanyTalentConsent(executor: any, consent: typeof companyTalentConsentsTable.$inferSelect, now = new Date()) {
  if (consent.status !== "active" || !consent.expiresAt || consent.expiresAt > now) return consent;
  const [expired] = await executor
    .update(companyTalentConsentsTable)
    .set({
      status: "expired",
      expiredAt: now,
      decisionNote: "Masa berlaku consent berakhir otomatis.",
      consentVersion: consent.consentVersion + 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(companyTalentConsentsTable.id, consent.id),
        eq(companyTalentConsentsTable.status, "active"),
        eq(companyTalentConsentsTable.consentVersion, consent.consentVersion),
        lte(companyTalentConsentsTable.expiresAt, now),
      ),
    )
    .returning();
  if (!expired) return consent;
  await recordExpirySideEffects(executor, expired);
  return expired;
}

export async function expireCompanyTalentConsents(now = new Date()) {
  return db.transaction(async (tx) => {
    const expired = await tx
      .update(companyTalentConsentsTable)
      .set({
        status: "expired",
        expiredAt: now,
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
      await recordExpirySideEffects(tx, consent);
    }
    return expired;
  });
}