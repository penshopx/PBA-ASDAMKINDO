import { integer, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const programsTable = pgTable("programs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  mode: text("mode").notNull(),
  schedule: text("schedule").notNull(),
  duration: text("duration").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
  instructor: text("instructor").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("published"),
  capacity: integer("capacity").notNull().default(20),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProgramSchema = createInsertSchema(programsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertProgram = z.infer<typeof insertProgramSchema>;
export type Program = typeof programsTable.$inferSelect;