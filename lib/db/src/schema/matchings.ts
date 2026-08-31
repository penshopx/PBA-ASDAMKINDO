import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const matchingsTable = pgTable("matchings", {
  id: text("id").primaryKey(),
  requirement: text("requirement").notNull(),
  companyName: text("company_name").notNull(),
  candidateUserId: text("candidate_user_id").references(() => usersTable.id),
  candidateName: text("candidate_name").notNull(),
  score: integer("score").notNull().default(0),
  status: text("status").notNull().default("new"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMatchingSchema = createInsertSchema(matchingsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertMatching = z.infer<typeof insertMatchingSchema>;
export type Matching = typeof matchingsTable.$inferSelect;