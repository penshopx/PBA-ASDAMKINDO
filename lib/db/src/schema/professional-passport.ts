import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const professionalPassportsTable = pgTable("professional_passports", {
  id: text("id").primaryKey(),
  memberUserId: text("member_user_id").notNull().references(() => usersTable.id).unique(),
  slug: text("slug").notNull().unique(),
  isPublic: boolean("is_public").notNull().default(false),
  headline: text("headline").notNull().default(""),
  bio: text("bio").notNull().default(""),
  preferredRoles: jsonb("preferred_roles").notNull().default([]),
  preferredLocations: jsonb("preferred_locations").notNull().default([]),
  preferredWorkModes: jsonb("preferred_work_modes").notNull().default([]),
  availabilityStatus: text("availability_status").notNull().default("available"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passportConsentsTable = pgTable("passport_consents", {
  id: text("id").primaryKey(),
  memberUserId: text("member_user_id").notNull().references(() => usersTable.id).unique(),
  scope: text("scope").notNull().default("talent_pool"),
  status: text("status").notNull().default("revoked"),
  grantedAt: timestamp("granted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companyTalentConsentsTable = pgTable(
  "company_talent_consents",
  {
    id: text("id").primaryKey(),
    memberUserId: text("member_user_id").notNull().references(() => usersTable.id),
    companyUserId: text("company_user_id").notNull().references(() => usersTable.id),
    scope: text("scope").notNull().default("talent_pool"),
    status: text("status").notNull().default("requested"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    consentVersion: integer("consent_version").notNull().default(1),
    grantedBy: text("granted_by").references(() => usersTable.id),
    revokedBy: text("revoked_by").references(() => usersTable.id),
    requestNote: text("request_note"),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    memberCompanyUnique: uniqueIndex("company_talent_consents_member_company_idx").on(
      table.memberUserId,
      table.companyUserId,
    ),
    companyAccessIdx: index("company_talent_consents_company_access_idx").on(
      table.companyUserId,
      table.status,
      table.expiresAt,
    ),
    memberStatusIdx: index("company_talent_consents_member_status_idx").on(table.memberUserId, table.status),
    expiryIdx: index("company_talent_consents_expiry_idx").on(table.status, table.expiresAt),
  }),
);

export const talentConsentSettingsTable = pgTable("talent_consent_settings", {
  id: text("id").primaryKey(),
  defaultDurationDays: integer("default_duration_days").notNull().default(90),
  updatedBy: text("updated_by").references(() => usersTable.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProfessionalPassportSchema = createInsertSchema(professionalPassportsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertPassportConsentSchema = createInsertSchema(passportConsentsTable).omit({
  updatedAt: true,
});
export const insertCompanyTalentConsentSchema = createInsertSchema(companyTalentConsentsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertProfessionalPassport = z.infer<typeof insertProfessionalPassportSchema>;
export type ProfessionalPassport = typeof professionalPassportsTable.$inferSelect;
export type InsertPassportConsent = z.infer<typeof insertPassportConsentSchema>;
export type PassportConsent = typeof passportConsentsTable.$inferSelect;
export type InsertCompanyTalentConsent = z.infer<typeof insertCompanyTalentConsentSchema>;
export type CompanyTalentConsent = typeof companyTalentConsentsTable.$inferSelect;