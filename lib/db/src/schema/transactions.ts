import { numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionsTable = pgTable("transactions", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  referenceId: text("reference_id").notNull(),
  customerName: text("customer_name").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  commission: numeric("commission", { precision: 14, scale: 2 }).notNull().default("0"),
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