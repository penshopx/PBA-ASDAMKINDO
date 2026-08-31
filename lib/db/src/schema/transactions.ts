import { numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const transactionsTable = pgTable("transactions", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  referenceId: text("reference_id").notNull(),
  customerName: text("customer_name").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  invoiceNumber: text("invoice_number"),
  invoiceAmount: numeric("invoice_amount", { precision: 14, scale: 2 }),
  feeAmount: numeric("fee_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  commission: numeric("commission", { precision: 14, scale: 2 }).notNull().default("0"),
  refundAmount: numeric("refund_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  settlementAmount: numeric("settlement_amount", { precision: 14, scale: 2 }),
  settlementDueAt: timestamp("settlement_due_at", { withTimezone: true }),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  reconciliationStatus: text("reconciliation_status").notNull().default("pending"),
  reconciliationResolvedAt: timestamp("reconciliation_resolved_at", { withTimezone: true }),
  reconciliationResolvedByUserId: text("reconciliation_resolved_by_user_id").references(() => usersTable.id),
  status: text("status").notNull().default("pending"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({
  occurredAt: true,
  updatedAt: true,
});
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;