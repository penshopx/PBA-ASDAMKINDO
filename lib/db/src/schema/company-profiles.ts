import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const companyProfilesTable = pgTable("company_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id).unique(),
  companyName: text("company_name").notNull(),
  companyType: text("company_type").notNull(),
  phone: text("phone").notNull(),
  businessEmail: text("business_email").notNull(),
  address: text("address").notNull(),
  picName: text("pic_name").notNull(),
  picTitle: text("pic_title").notNull(),
  primaryNeed: text("primary_need").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCompanyProfileSchema = createInsertSchema(companyProfilesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertCompanyProfile = z.infer<typeof insertCompanyProfileSchema>;
export type CompanyProfile = typeof companyProfilesTable.$inferSelect;