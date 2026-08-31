import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, like } from "drizzle-orm";
import {
  companyTalentConsentsTable,
  db,
  notificationsTable,
  talentConsentSettingsTable,
  usersTable,
} from "@workspace/db";
import {
  consentReminderDue,
  getTalentConsentSettings,
  remindCompanyTalentConsentExpiries,
} from "../src/lib/talent-consent";

const suffix = randomUUID();
const memberId = `consent-reminder-member-${suffix}`;
const outsideWindowMemberId = `consent-reminder-outside-member-${suffix}`;
const expiredMemberId = `consent-reminder-expired-member-${suffix}`;
const companyId = `consent-reminder-company-${suffix}`;
const soonConsentId = `consent-reminder-soon-${suffix}`;
const outsideWindowConsentId = `consent-reminder-outside-${suffix}`;
const expiredConsentId = `consent-reminder-expired-${suffix}`;
const now = new Date("2026-08-31T00:00:00.000Z");
const day = 24 * 60 * 60 * 1000;
const reminderKeyPrefix = `consent-expiry-reminder:`;

const [existingSettings] = await db
  .select()
  .from(talentConsentSettingsTable)
  .where(eq(talentConsentSettingsTable.id, "talent-pool-default"))
  .limit(1);

try {
  await getTalentConsentSettings();
  await db.transaction(async (tx) => {
    await tx
      .update(talentConsentSettingsTable)
      .set({ reminderDaysBeforeExpiry: 7 })
      .where(eq(talentConsentSettingsTable.id, "talent-pool-default"));
    await tx.insert(usersTable).values([
      {
        id: memberId,
        clerkUserId: memberId,
        name: "Anggota Pengingat",
        email: `${memberId}@example.test`,
        role: "member",
        onboardingComplete: true,
      },
      {
        id: companyId,
        clerkUserId: companyId,
        name: "Perusahaan Pengingat",
        email: `${companyId}@example.test`,
        role: "company",
        onboardingComplete: true,
        organization: "PT Pengingat",
      },
      {
        id: outsideWindowMemberId,
        clerkUserId: outsideWindowMemberId,
        name: "Anggota Di Luar Jendela",
        email: `${outsideWindowMemberId}@example.test`,
        role: "member",
        onboardingComplete: true,
      },
      {
        id: expiredMemberId,
        clerkUserId: expiredMemberId,
        name: "Anggota Kedaluwarsa",
        email: `${expiredMemberId}@example.test`,
        role: "member",
        onboardingComplete: true,
      },
    ]);
    await tx.insert(companyTalentConsentsTable).values([
      {
        id: soonConsentId,
        memberUserId: memberId,
        companyUserId: companyId,
        status: "active",
        grantedAt: now,
        expiresAt: new Date(now.getTime() + 5 * day),
      },
      {
        id: outsideWindowConsentId,
        memberUserId: outsideWindowMemberId,
        companyUserId: companyId,
        status: "active",
        grantedAt: now,
        expiresAt: new Date(now.getTime() + 8 * day),
      },
      {
        id: expiredConsentId,
        memberUserId: expiredMemberId,
        companyUserId: companyId,
        status: "active",
        grantedAt: now,
        expiresAt: new Date(now.getTime() - day),
      },
    ]);
  });

  assert.equal(
    consentReminderDue(new Date(now.getTime() + 7 * day), 7, now),
    true,
    "the exact reminder boundary is included",
  );
  assert.equal(
    consentReminderDue(new Date(now.getTime() + 7 * day + 1), 7, now),
    false,
    "consents outside the reminder window are excluded",
  );
  assert.equal(
    consentReminderDue(now, 7, now),
    false,
    "an already expired consent is not reminded",
  );

  const firstRun = await remindCompanyTalentConsentExpiries(now);
  assert.equal(firstRun.eligibleConsents, 1);
  assert.equal(firstRun.remindersCreated, 2);

  const [soonConsentAfterReminder] = await db
    .select()
    .from(companyTalentConsentsTable)
    .where(eq(companyTalentConsentsTable.id, soonConsentId))
    .limit(1);
  assert.equal(soonConsentAfterReminder.status, "active");
  assert.equal(soonConsentAfterReminder.consentVersion, 1);

  const secondRun = await remindCompanyTalentConsentExpiries(now);
  assert.equal(secondRun.eligibleConsents, 1);
  assert.equal(secondRun.remindersCreated, 0);

  const reminders = await db
    .select()
    .from(notificationsTable)
    .where(
      and(
        like(notificationsTable.dedupeKey, `${reminderKeyPrefix}${soonConsentId}:%`),
        inArray(notificationsTable.userId, [memberId, companyId]),
      ),
    );
  assert.equal(reminders.length, 2);
  assert.deepEqual(
    reminders.map((notification) => notification.userId).sort(),
    [companyId, memberId].sort(),
  );

  const outsideWindowReminders = await db
    .select()
    .from(notificationsTable)
    .where(like(notificationsTable.dedupeKey, `${reminderKeyPrefix}${outsideWindowConsentId}:%`));
  assert.equal(outsideWindowReminders.length, 0);

  const expiredReminders = await db
    .select()
    .from(notificationsTable)
    .where(like(notificationsTable.dedupeKey, `${reminderKeyPrefix}${expiredConsentId}:%`));
  assert.equal(expiredReminders.length, 0);

  console.log("consent expiry reminder integration tests passed");
} finally {
  await db.transaction(async (tx) => {
    await tx
      .delete(notificationsTable)
      .where(like(notificationsTable.dedupeKey, `${reminderKeyPrefix}%${suffix}%`));
    await tx
      .delete(companyTalentConsentsTable)
      .where(inArray(companyTalentConsentsTable.id, [
        soonConsentId,
        outsideWindowConsentId,
        expiredConsentId,
      ]));
    await tx
      .delete(usersTable)
      .where(inArray(usersTable.id, [
        memberId,
        outsideWindowMemberId,
        expiredMemberId,
        companyId,
      ]));
    if (existingSettings) {
      await tx
        .update(talentConsentSettingsTable)
        .set({
          defaultDurationDays: existingSettings.defaultDurationDays,
          reminderDaysBeforeExpiry: existingSettings.reminderDaysBeforeExpiry,
          updatedBy: existingSettings.updatedBy,
          updatedAt: existingSettings.updatedAt,
        })
        .where(eq(talentConsentSettingsTable.id, existingSettings.id));
    } else {
      await tx
        .delete(talentConsentSettingsTable)
        .where(eq(talentConsentSettingsTable.id, "talent-pool-default"));
    }
  });
}