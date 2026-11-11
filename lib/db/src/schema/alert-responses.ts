import { pgTable, text, timestamp, index, integer, boolean } from "drizzle-orm/pg-core";
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
  incidentStatus: text("incident_status", { enum: ["open", "resolved"] }).notNull().default("open"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: text("resolved_by").references(() => usersTable.id, { onDelete: "set null" }),
  overdueAt: timestamp("overdue_at", { withTimezone: true }),
  ackReminderEnabled: boolean("ack_reminder_enabled").notNull().default(false),
  ackReminderStatus: text("ack_reminder_status", {
    enum: ["not_sent", "pending", "delivered", "failed", "interrupted", "stopped"],
  }).notNull().default("not_sent"),
  ackReminderAttempts: integer("ack_reminder_attempts").notNull().default(0),
  ackReminderLastAttemptAt: timestamp("ack_reminder_last_attempt_at", { withTimezone: true }),
  ackReminderLastDeliveredAt: timestamp("ack_reminder_last_delivered_at", { withTimezone: true }),
  ackReminderNextAttemptAt: timestamp("ack_reminder_next_attempt_at", { withTimezone: true }),
  ackReminderDeliveryKey: text("ack_reminder_delivery_key"),
  ackReminderError: text("ack_reminder_error"),
}, (table) => [index("alert_responses_due_idx").on(table.responseDueAt)]);

export const insertAlertResponseSchema = createInsertSchema(alertResponsesTable);
export type InsertAlertResponse = z.infer<typeof insertAlertResponseSchema>;
export type AlertResponseRow = typeof alertResponsesTable.$inferSelect;
