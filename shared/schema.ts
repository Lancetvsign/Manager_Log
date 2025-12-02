/**
 * DATABASE SCHEMA DEFINITIONS
 * ==========================
 * This file defines the PostgreSQL database schema using Drizzle ORM.
 * It contains all data models and their relationships for the Restaurant Manager's Log app.
 * 
 * Data Flow:
 * - These schemas are used by both the backend (server/storage.ts) for database operations
 *   and the frontend for type safety via the exported TypeScript types.
 * - Zod schemas (insertXxxSchema) are used to validate incoming API requests.
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, numeric, date, timestamp, serial, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * USERS TABLE
 * -----------
 * Stores user authentication data (for future login functionality).
 * Currently not actively used but prepared for authentication features.
 */
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

/**
 * MANAGER_LOGS TABLE
 * ------------------
 * The primary table storing daily restaurant log entries.
 * Each entry represents one day's operations, including sales data, weather, and notes.
 * 
 * Key Design Decisions:
 * - logDate is UNIQUE to ensure only one entry per day (upsert behavior)
 * - Uses serial ID for better database performance vs UUIDs
 * - Timestamps track when records were created/updated
 * 
 * Fields:
 * - id: Auto-incrementing primary key
 * - logDate: The date this log is for (YYYY-MM-DD format, unique)
 * - dayOfWeek: Human-readable day name (e.g., "Monday")
 * - managerName: Name of the manager on duty
 * - weather: Current day's weather description
 * - weatherLastYear: Weather from the same date one year ago (for comparison)
 * - foodSales/barSales/gamingSales: Sales figures by category
 * - totalSales: Combined total of all sales categories
 * - salesNotes: Additional notes about sales
 * - dailyNumber/weeklyNumber: Optional tracking numbers
 * - dailyNotes: General narrative notes about the day's operations
 */
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

/**
 * MAINTENANCE_ITEMS TABLE
 * -----------------------
 * Stores maintenance tasks/issues for each day.
 * Each item is linked to a specific ManagerLog entry via foreign key.
 * 
 * Key Design Decisions:
 * - managerLogId has CASCADE DELETE: when a log is deleted, its maintenance items are too
 * - status defaults to "open" and can be changed to "completed"
 * - resolvedAt is set when status changes to "completed"
 * 
 * Fields:
 * - id: Auto-incrementing primary key
 * - managerLogId: Foreign key linking to the parent ManagerLog
 * - description: What needs to be done or was done
 * - status: Either "open" or "completed"
 * - notes: Additional context or details
 * - resolvedAt: Timestamp when the item was marked completed
 */
export const maintenanceItems = pgTable("maintenance_items", {
  id: serial("id").primaryKey(),
  managerLogId: integer("manager_log_id").references(() => managerLogs.id, { onDelete: "cascade" }).notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

/**
 * TABLE RELATIONSHIPS
 * -------------------
 * Defines the one-to-many relationship between ManagerLogs and MaintenanceItems.
 * - Each ManagerLog can have many MaintenanceItems
 * - Each MaintenanceItem belongs to exactly one ManagerLog
 */
export const managerLogsRelations = relations(managerLogs, ({ many }) => ({
  maintenanceItems: many(maintenanceItems),
}));

export const maintenanceItemsRelations = relations(maintenanceItems, ({ one }) => ({
  managerLog: one(managerLogs, {
    fields: [maintenanceItems.managerLogId],
    references: [managerLogs.id],
  }),
}));

/**
 * ZOD VALIDATION SCHEMAS
 * ----------------------
 * These schemas are used to validate incoming API request bodies.
 * They're derived from the Drizzle schemas but exclude auto-generated fields
 * and add custom validation rules where needed.
 */

// User insert schema (for future auth)
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// ManagerLog insert schema with custom validation
export const insertManagerLogSchema = createInsertSchema(managerLogs).omit({
  id: true,        // Auto-generated
  createdAt: true, // Auto-generated
  updatedAt: true, // Auto-generated
}).extend({
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  foodSales: z.string().optional().nullable(),
  barSales: z.string().optional().nullable(),
  gamingSales: z.string().optional().nullable(),
  totalSales: z.string().optional().nullable(),
  dailyNumber: z.string().optional().nullable(),
  weeklyNumber: z.string().optional().nullable(),
});

// MaintenanceItem insert schema with status validation
export const insertMaintenanceItemSchema = createInsertSchema(maintenanceItems).omit({
  id: true,         // Auto-generated
  createdAt: true,  // Auto-generated
  resolvedAt: true, // Set automatically when status changes to completed
}).extend({
  status: z.enum(["open", "completed"]).default("open"),
});

/**
 * TYPESCRIPT TYPE EXPORTS
 * -----------------------
 * These types are used throughout the app for type safety.
 * - InsertX types are for creating new records
 * - X types (without Insert) are for reading records from the database
 */
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertManagerLog = z.infer<typeof insertManagerLogSchema>;
export type ManagerLog = typeof managerLogs.$inferSelect;
export type InsertMaintenanceItem = z.infer<typeof insertMaintenanceItemSchema>;
export type MaintenanceItem = typeof maintenanceItems.$inferSelect;

/**
 * Extended type for maintenance items with their related log data
 * Used in the Maintenance Overview page to display items with their log dates
 */
export type MaintenanceItemWithLog = MaintenanceItem & {
  logDate: string;
  dayOfWeek: string;
  managerName: string;
};
