import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const verificationsTable = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    subjectName: text("subject_name").notNull(),
    evidenceType: text("evidence_type").notNull(),
    status: text("status").notNull().default("pending"),
    submittedByUserId: text("submitted_by_user_id").notNull().references(() => usersTable.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedByUserId: text("reviewed_by_user_id").references(() => usersTable.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
  },
  (table) => ({
    pendingQueueIdx: index("verifications_pending_queue_idx").on(table.status, table.submittedAt),
  }),
);

export const insertVerificationSchema = createInsertSchema(verificationsTable).omit({
  submittedAt: true,
  reviewedAt: true,
});
export type InsertVerification = z.infer<typeof insertVerificationSchema>;
export type Verification = typeof verificationsTable.$inferSelect;