import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const apiRateLimitBucketsTable = pgTable(
  "api_rate_limit_buckets",
  {
    key: text("key").primaryKey(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    cleanupIdx: index("api_rate_limit_buckets_updated_at_idx").on(table.updatedAt),
  }),
);