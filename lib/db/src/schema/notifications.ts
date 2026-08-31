import { boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const notificationsTable = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => usersTable.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    type: text("type").notNull(),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    dedupeKey: text("dedupe_key"),
  },
  (table) => ({
    dedupeKeyIdx: uniqueIndex("notifications_dedupe_key_idx").on(table.dedupeKey),
  }),
);

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({
  createdAt: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;