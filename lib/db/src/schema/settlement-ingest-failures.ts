import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const settlementIngestFailuresTable = pgTable(
  "settlement_ingest_failures",
  {
    id: text("id").primaryKey(),
    failureCode: text("failure_code").notNull(),
    identifierType: text("identifier_type").notNull(),
    identifierHint: text("identifier_hint").notNull(),
    status: text("status").notNull().default("open"),
    attemptCount: integer("attempt_count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: text("resolved_by_user_id").references(() => usersTable.id),
  },
  (table) => ({
    queueIdx: index("settlement_ingest_failures_queue_idx").on(table.status, table.lastSeenAt),
  }),
);

export const insertSettlementIngestFailureSchema = createInsertSchema(
  settlementIngestFailuresTable,
).omit({
  firstSeenAt: true,
  lastSeenAt: true,
});
export type InsertSettlementIngestFailure = z.infer<typeof insertSettlementIngestFailureSchema>;
export type SettlementIngestFailure = typeof settlementIngestFailuresTable.$inferSelect;