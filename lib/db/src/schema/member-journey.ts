import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { programsTable } from "./programs";
import { usersTable } from "./users";

export const readinessDiagnosticsTable = pgTable("readiness_diagnostics", {
  id: text("id").primaryKey(),
  memberUserId: text("member_user_id").notNull().references(() => usersTable.id).unique(),
  score: integer("score").notNull().default(0),
  answers: jsonb("answers").notNull().default({}),
  focusAreas: jsonb("focus_areas").notNull().default([]),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberEvidenceTable = pgTable(
  "member_evidence",
  {
    id: text("id").primaryKey(),
    memberUserId: text("member_user_id").notNull().references(() => usersTable.id),
    clientRequestId: text("client_request_id"),
    evidenceType: text("evidence_type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    referenceUrl: text("reference_url"),
    status: text("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    memberRequestUniqueIdx: uniqueIndex("member_evidence_member_request_unique_idx").on(
      table.memberUserId,
      table.clientRequestId,
    ),
  }),
);

export const programProgressTable = pgTable("program_progress", {
  id: text("id").primaryKey(),
  memberUserId: text("member_user_id").notNull().references(() => usersTable.id),
  programId: text("program_id").notNull().references(() => programsTable.id),
  progress: integer("progress").notNull().default(0),
  currentMilestone: text("current_milestone").notNull().default("Orientasi"),
  milestones: jsonb("milestones").notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReadinessDiagnosticSchema = createInsertSchema(readinessDiagnosticsTable).omit({
  completedAt: true,
  updatedAt: true,
});
export const insertMemberEvidenceSchema = createInsertSchema(memberEvidenceTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertProgramProgressSchema = createInsertSchema(programProgressTable).omit({
  updatedAt: true,
});

export type ReadinessDiagnostic = typeof readinessDiagnosticsTable.$inferSelect;
export type MemberEvidence = typeof memberEvidenceTable.$inferSelect;
export type ProgramProgress = typeof programProgressTable.$inferSelect;
export type InsertReadinessDiagnostic = z.infer<typeof insertReadinessDiagnosticSchema>;
export type InsertMemberEvidence = z.infer<typeof insertMemberEvidenceSchema>;
export type InsertProgramProgress = z.infer<typeof insertProgramProgressSchema>;