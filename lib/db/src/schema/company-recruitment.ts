import { date, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const companyRequirementsTable = pgTable("company_requirements", {
  id: text("id").primaryKey(),
  companyUserId: text("company_user_id").notNull().references(() => usersTable.id),
  kind: text("kind").notNull().default("talent"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  location: text("location").notNull(),
  competencies: text("competencies").array().notNull().default([]),
  minimumExperience: integer("minimum_experience").notNull().default(0),
  headcount: integer("headcount").notNull().default(1),
  deadline: date("deadline", { mode: "string" }).notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCompanyRequirementSchema = createInsertSchema(companyRequirementsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertCompanyRequirement = z.infer<typeof insertCompanyRequirementSchema>;
export type CompanyRequirement = typeof companyRequirementsTable.$inferSelect;