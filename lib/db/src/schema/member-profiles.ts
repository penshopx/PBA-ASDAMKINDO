import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const memberProfilesTable = pgTable("member_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id).unique(),
  phone: text("phone").notNull().default(""),
  domicile: text("domicile").notNull().default(""),
  education: text("education").notNull().default(""),
  jobTitle: text("job_title").notNull().default(""),
  expertise: text("expertise").notNull().default(""),
  skkLevel: integer("skk_level").notNull().default(0),
  experienceYears: integer("experience_years").notNull().default(0),
  primaryGoal: text("primary_goal").notNull().default("competency"),
  dataConsent: boolean("data_consent").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMemberProfileSchema = createInsertSchema(memberProfilesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertMemberProfile = z.infer<typeof insertMemberProfileSchema>;
export type MemberProfile = typeof memberProfilesTable.$inferSelect;