import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const operationalAlertDeliveriesTable = pgTable("operational_alert_deliveries", {
  deduplicationKey: text("deduplication_key").primaryKey(),
  alertName: text("alert_name").notNull(),
  status: text("status", { enum: ["pending", "delivered", "failed", "disabled"] }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  error: text("error"),
  owner: text("owner").notNull(),
  leaseUntil: timestamp("lease_until", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("operational_alert_deliveries_created_idx").on(table.createdAt),
  index("operational_alert_deliveries_lease_idx").on(table.status, table.leaseUntil),
]);

export const operationalAlertCooldownsTable = pgTable("operational_alert_cooldowns", {
  key: text("key").primaryKey(),
  reservedAt: timestamp("reserved_at", { withTimezone: true }).notNull(),
});

export const insertOperationalAlertDeliverySchema = createInsertSchema(operationalAlertDeliveriesTable);
export const insertOperationalAlertCooldownSchema = createInsertSchema(operationalAlertCooldownsTable);
export type InsertOperationalAlertDelivery = z.infer<typeof insertOperationalAlertDeliverySchema>;
export type OperationalAlertDelivery = typeof operationalAlertDeliveriesTable.$inferSelect;
export type InsertOperationalAlertCooldown = z.infer<typeof insertOperationalAlertCooldownSchema>;
