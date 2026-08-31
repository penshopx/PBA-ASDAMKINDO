import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
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

export const insertProfessionalPassportSchema = createInsertSchema(professionalPassportsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertPassportConsentSchema = createInsertSchema(passportConsentsTable).omit({
  updatedAt: true,
});

export type InsertProfessionalPassport = z.infer<typeof insertProfessionalPassportSchema>;
export type ProfessionalPassport = typeof professionalPassportsTable.$inferSelect;
export type InsertPassportConsent = z.infer<typeof insertPassportConsentSchema>;
export type PassportConsent = typeof passportConsentsTable.$inferSelect;