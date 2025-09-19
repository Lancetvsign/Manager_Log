import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const managerLogs = pgTable("manager_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: date("date").notNull(),
  dayOfWeek: text("day_of_week").notNull(),
  managerName: text("manager_name").notNull(),
  foodSales: decimal("food_sales", { precision: 10, scale: 2 }).notNull(),
  barSales: decimal("bar_sales", { precision: 10, scale: 2 }).notNull(),
  gamingSales: decimal("gaming_sales", { precision: 10, scale: 2 }).notNull(),
  lastYearFoodSales: decimal("last_year_food_sales", { precision: 10, scale: 2 }),
  lastYearBarSales: decimal("last_year_bar_sales", { precision: 10, scale: 2 }),
  lastYearGamingSales: decimal("last_year_gaming_sales", { precision: 10, scale: 2 }),
  currentWeather: jsonb("current_weather"),
  historicalWeather: jsonb("historical_weather"),
  dailyNotes: text("daily_notes").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertManagerLogSchema = createInsertSchema(managerLogs).omit({
  id: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertManagerLog = z.infer<typeof insertManagerLogSchema>;
export type ManagerLog = typeof managerLogs.$inferSelect;
