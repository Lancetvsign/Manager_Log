import { sql } from "drizzle-orm";
import { pgTable, text, varchar, numeric, date, timestamp, serial, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const managerLogs = pgTable("manager_logs", {
  id: serial("id").primaryKey(),
  logDate: date("log_date").notNull().unique(),
  dayOfWeek: text("day_of_week").notNull(),
  managerName: text("manager_name").notNull(),
  weather: text("weather"),
  weatherLastYear: text("weather_last_year"),
  foodSales: numeric("food_sales", { precision: 10, scale: 2 }),
  barSales: numeric("bar_sales", { precision: 10, scale: 2 }),
  gamingSales: numeric("gaming_sales", { precision: 10, scale: 2 }),
  totalSales: numeric("total_sales", { precision: 10, scale: 2 }),
  salesNotes: text("sales_notes"),
  dailyNumber: numeric("daily_number", { precision: 10, scale: 2 }),
  weeklyNumber: numeric("weekly_number", { precision: 10, scale: 2 }),
  dailyNotes: text("daily_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const maintenanceItems = pgTable("maintenance_items", {
  id: serial("id").primaryKey(),
  managerLogId: integer("manager_log_id").references(() => managerLogs.id, { onDelete: "cascade" }).notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export const managerLogsRelations = relations(managerLogs, ({ many }) => ({
  maintenanceItems: many(maintenanceItems),
}));

export const maintenanceItemsRelations = relations(maintenanceItems, ({ one }) => ({
  managerLog: one(managerLogs, {
    fields: [maintenanceItems.managerLogId],
    references: [managerLogs.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertManagerLogSchema = createInsertSchema(managerLogs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  foodSales: z.string().optional().nullable(),
  barSales: z.string().optional().nullable(),
  gamingSales: z.string().optional().nullable(),
  totalSales: z.string().optional().nullable(),
  dailyNumber: z.string().optional().nullable(),
  weeklyNumber: z.string().optional().nullable(),
});

export const insertMaintenanceItemSchema = createInsertSchema(maintenanceItems).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
}).extend({
  status: z.enum(["open", "completed"]).default("open"),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertManagerLog = z.infer<typeof insertManagerLogSchema>;
export type ManagerLog = typeof managerLogs.$inferSelect;
export type InsertMaintenanceItem = z.infer<typeof insertMaintenanceItemSchema>;
export type MaintenanceItem = typeof maintenanceItems.$inferSelect;
