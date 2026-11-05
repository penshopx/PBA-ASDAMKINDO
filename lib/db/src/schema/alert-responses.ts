import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const alertResponsesTable = pgTable("alert_responses", {
  id: text("id").primaryKey(),
  alertName: text("alert_name").notNull(),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull(),
  responseDueAt: timestamp("response_due_at", { withTimezone: true }).notNull(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  acknowledgedBy: text("acknowledged_by").references(() => usersTable.id, { onDelete: "set null" }),
  overdueAt: timestamp("overdue_at", { withTimezone: true }),
}, (table) => [index("alert_responses_due_idx").on(table.responseDueAt)]);

export const insertAlertResponseSchema = createInsertSchema(alertResponsesTable);
export type InsertAlertResponse = z.infer<typeof insertAlertResponseSchema>;
export type AlertResponseRow = typeof alertResponsesTable.$inferSelect;
