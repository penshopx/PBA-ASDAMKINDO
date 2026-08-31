import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { programsTable } from "./programs";
import { usersTable } from "./users";

export const enrollmentsTable = pgTable("enrollments", {
  id: text("id").primaryKey(),
  programId: text("program_id").notNull().references(() => programsTable.id),
  memberUserId: text("member_user_id").notNull().references(() => usersTable.id),
  memberName: text("member_name").notNull(),
  status: text("status").notNull().default("pending"),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEnrollmentSchema = createInsertSchema(enrollmentsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertEnrollment = z.infer<typeof insertEnrollmentSchema>;
export type Enrollment = typeof enrollmentsTable.$inferSelect;