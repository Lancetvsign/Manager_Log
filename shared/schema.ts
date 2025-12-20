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
import { pgTable, text, varchar, numeric, date, timestamp, serial, integer, boolean, jsonb } from "drizzle-orm/pg-core";
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
 * CLUBS TABLE
 * -----------
 * Stores club configuration for Social Club Pro integration.
 * Each club can have custom notification list assignments.
 */
export const clubs = pgTable("clubs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prepChecklistNotificationListId: integer("prep_checklist_notification_list_id"),
  aiOverviewEnabled: boolean("ai_overview_enabled").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * MANAGER_LOGS TABLE
 * ------------------
 * The primary table storing daily restaurant log entries.
 * Each entry represents one day's operations, including sales data, weather, and notes.
 * 
 * Key Design Decisions:
 * - clubId + logDate is UNIQUE to ensure only one entry per club per day
 * - Uses serial ID for better database performance vs UUIDs
 * - Timestamps track when records were created/updated
 * 
 * MULTI-CLUB SUPPORT:
 * - clubId isolates data between different clubs in Social Club Pro
 * - All queries should filter by clubId to ensure data isolation
 * 
 * Fields:
 * - id: Auto-incrementing primary key
 * - clubId: Identifier for the club this log belongs to (from Social Club Pro)
 * - logDate: The date this log is for (YYYY-MM-DD format)
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
  clubId: text("club_id").notNull().default("default"),
  logDate: date("log_date").notNull(),
  dayOfWeek: text("day_of_week").notNull(),
  managerName: text("manager_name").notNull(),
  // Additional manager tracking fields
  amManagerName: text("am_manager_name"),
  pmManagerName: text("pm_manager_name"),
  kitchenManagerName: text("kitchen_manager_name"),
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
  // Rollover tracking fields
  carriedOverFromId: integer("carried_over_from_id"), // Original item ID if this was rolled over
  rolledOverToDate: date("rolled_over_to_date"), // Date this item was rolled to (prevents duplicate rollover)
  // Photo attachment
  photoUrl: text("photo_url"), // URL to photo of damage/issue
});

/**
 * RUNNING_MAINTENANCE_LIST TABLE
 * ------------------------------
 * Standalone maintenance tracking not tied to specific log entries.
 * Provides a global list of open maintenance items for the club.
 * 
 * Key Design Decisions:
 * - clubId scopes data to each club (multi-tenant)
 * - status: 'open' or 'completed'
 * - dateAdded: auto-set on creation, used for oldest-first sorting
 * - relatedLogDate: optional link to a specific log date (for reference)
 * 
 * Fields:
 * - id: Auto-incrementing primary key
 * - clubId: Club identifier for data isolation
 * - title: Short description of the maintenance item
 * - description: Optional longer description/details
 * - status: 'open' or 'completed'
 * - dateAdded: When the item was created
 * - dateCompleted: When the item was marked complete
 * - createdBy: Optional name of who created the item
 * - relatedLogDate: Optional reference to a log date (YYYY-MM-DD)
 */
export const runningMaintenanceList = pgTable("running_maintenance_list", {
  id: serial("id").primaryKey(),
  clubId: text("club_id").notNull().default("default"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("open"),
  dateAdded: timestamp("date_added").defaultNow().notNull(),
  dateCompleted: timestamp("date_completed"),
  createdBy: text("created_by"),
  relatedLogDate: date("related_log_date"),
});

/**
 * NOTIFICATION_LOGS TABLE
 * -----------------------
 * Stores a history of notification emails sent for manager logs.
 * Tracks both real sends and simulated sends (when SMTP not configured).
 * 
 * Fields:
 * - id: Auto-incrementing primary key
 * - logId: Foreign key linking to the parent ManagerLog
 * - clubId: Club identifier for data isolation
 * - reason: Type of notification (Maintenance, Behavior, Other)
 * - subject: Email subject line
 * - message: Custom message included in the email
 * - listIds: JSON array of notification list IDs that were selected
 * - recipients: JSON array of email addresses that received the notification
 * - simulated: Whether the email was simulated (SMTP not configured) or actually sent
 * - createdAt: When the notification was sent
 */
export const notificationLogs = pgTable("notification_logs", {
  id: serial("id").primaryKey(),
  logId: integer("log_id").references(() => managerLogs.id, { onDelete: "cascade" }).notNull(),
  clubId: text("club_id").notNull(),
  reason: text("reason").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  listIds: jsonb("list_ids").notNull().$type<number[]>(),
  recipients: jsonb("recipients").notNull().$type<string[]>(),
  simulated: boolean("simulated").notNull().default(true),
  autoTriggered: boolean("auto_triggered").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * NOTIFICATION_LISTS TABLE
 * ------------------------
 * Stores notification list definitions for each club.
 * Lists group recipients who should receive certain types of notifications.
 * 
 * Fields:
 * - id: Auto-incrementing primary key
 * - clubId: The club this list belongs to
 * - name: Display name for the list (e.g., "Core Team", "Maintenance Staff")
 * - description: Optional description of the list's purpose
 * - isDefault: Whether this list is auto-selected for new notifications
 * - roleKey: Optional role assignment for automation targeting (core_team, maintenance, ownership, kitchen_staff, custom)
 */
export const notificationLists = pgTable("notification_lists", {
  id: serial("id").primaryKey(),
  clubId: varchar("club_id", { length: 64 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  isDefault: boolean("is_default").notNull().default(false),
  roleKey: varchar("role_key", { length: 32 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * NOTIFICATION_RECIPIENTS TABLE
 * -----------------------------
 * Stores individual recipients who belong to notification lists.
 * Each recipient is linked to a specific list via foreign key.
 * 
 * Fields:
 * - id: Auto-incrementing primary key
 * - listId: Foreign key to the parent notification list
 * - name: Optional display name for the recipient
 * - email: Email address to send notifications to
 */
export const notificationRecipients = pgTable("notification_recipients", {
  id: serial("id").primaryKey(),
  listId: integer("list_id").notNull().references(() => notificationLists.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }),
  email: varchar("email", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * ESCALATION_RULES TABLE
 * ----------------------
 * Stores automated escalation rules for each club.
 * Rules can trigger notifications based on:
 * - reason: When a specific notification reason is selected (maintenance, behavior, other)
 * - metric: When a metric condition is met (e.g., sales drop > 20%)
 * - flag: When a specific flag is set (e.g., gaming outage)
 * 
 * Fields:
 * - triggerType: "reason" | "metric" | "flag"
 * - triggerReason: For reason type - which reason triggers this rule
 * - metricKey/metricOperator/metricValue: For metric type - the condition to check
 * - flagKey: For flag type - which flag triggers this rule
 * - autoSend: If true, sends immediately without user clicking send
 */
export const escalationRules = pgTable("escalation_rules", {
  id: serial("id").primaryKey(),
  clubId: varchar("club_id", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  triggerType: varchar("trigger_type", { length: 24 }).notNull(), // "reason" | "metric" | "flag"
  triggerReason: varchar("trigger_reason", { length: 24 }), // For triggerType = "reason"
  metricKey: varchar("metric_key", { length: 64 }), // For triggerType = "metric"
  metricThreshold: numeric("metric_threshold", { precision: 10, scale: 2 }),
  flagKey: varchar("flag_key", { length: 64 }), // For triggerType = "flag"
  enabled: boolean("enabled").notNull().default(true),
  autoSend: boolean("auto_send").notNull().default(false),
  presetKey: varchar("preset_key", { length: 64 }), // Links to AUTOMATION_PRESETS
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * ESCALATION_RULE_TARGETS TABLE
 * -----------------------------
 * Many-to-many relationship between escalation rules and notification lists.
 * When a rule matches, notifications are sent to all target lists.
 */
export const escalationRuleTargets = pgTable("escalation_rule_targets", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").notNull().references(() => escalationRules.id, { onDelete: "cascade" }),
  listId: integer("list_id").notNull().references(() => notificationLists.id, { onDelete: "cascade" }),
});

/**
 * PREP_CHECKLIST_ITEMS TABLE
 * --------------------------
 * Stores "Tomorrow's Prep Checklist" items with auto-rollover support.
 * Uncompleted items automatically roll forward to the next day.
 * 
 * Fields:
 * - id: Auto-incrementing primary key
 * - clubId: Club identifier for data isolation
 * - description: What needs to be prepared
 * - status: "pending" or "completed"
 * - targetDate: The date this item should appear on (rolls forward if not completed)
 * - originalDate: When this item was originally created (tracks rollover history)
 * - rolledOverCount: Number of times this item has been rolled forward
 * - completedAt: Timestamp when the item was marked completed
 * - completedBy: Name of person who completed the item
 * - createdAt: Timestamp when item was created
 */
export const prepChecklistItems = pgTable("prep_checklist_items", {
  id: serial("id").primaryKey(),
  clubId: varchar("club_id", { length: 64 }).notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("pending"),
  priority: varchar("priority", { length: 24 }).notNull().default("medium"),
  assignedTo: varchar("assigned_to", { length: 120 }),
  targetDate: date("target_date").notNull(),
  originalDate: date("original_date").notNull(),
  rolledOverCount: integer("rolled_over_count").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: varchar("completed_by", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * LOG_ATTACHMENTS TABLE
 * ---------------------
 * Stores file attachments linked to manager logs.
 * Each attachment references a specific manager log entry.
 * 
 * Fields:
 * - id: Auto-incrementing primary key
 * - clubId: Club identifier for data isolation
 * - logId: Foreign key to manager_logs table
 * - fileName: Original filename of the uploaded file
 * - fileType: MIME type of the file
 * - fileSize: Size of the file in bytes
 * - storageKey: Key/path used in storage system (S3/Blob)
 * - publicUrl: URL to view/download the file
 * - createdAt: Timestamp when attachment was uploaded
 */
export const logAttachments = pgTable("log_attachments", {
  id: serial("id").primaryKey(),
  clubId: varchar("club_id", { length: 64 }).notNull(),
  logId: integer("log_id").notNull().references(() => managerLogs.id, { onDelete: "cascade" }),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileType: varchar("file_type", { length: 128 }).notNull(),
  fileSize: integer("file_size").notNull(),
  storageKey: varchar("storage_key", { length: 512 }).notNull(),
  publicUrl: varchar("public_url", { length: 1024 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * LOG_MAINTENANCE_SNAPSHOTS TABLE
 * --------------------------------
 * Captures a snapshot of maintenance items when a log is saved.
 * This ensures Log History shows accurate data even if items are edited later.
 * 
 * Fields:
 * - id: Auto-incrementing primary key
 * - logId: Foreign key to manager_logs table
 * - itemId: Foreign key to maintenance_items table
 * - statusAtTime: The item's status when the snapshot was captured
 * - notesAtTime: The item's notes when the snapshot was captured
 * - capturedAt: When this snapshot was taken
 * - carriedOverFromLogId: Optional reference to the log where item originated
 */
export const logMaintenanceSnapshots = pgTable("log_maintenance_snapshots", {
  id: serial("id").primaryKey(),
  logId: integer("log_id").notNull().references(() => managerLogs.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => maintenanceItems.id, { onDelete: "cascade" }),
  statusAtTime: text("status_at_time").notNull(),
  notesAtTime: text("notes_at_time").default(""),
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
  carriedOverFromLogId: integer("carried_over_from_log_id"),
});

/**
 * RUNNING_MAINTENANCE_SNAPSHOTS TABLE
 * ------------------------------------
 * Captures a daily snapshot of running maintenance items when a log is saved.
 * Powers the Insights page with historical trend data for open items over time.
 * 
 * Fields:
 * - id: Auto-incrementing primary key
 * - clubId: Club identifier for data isolation
 * - logId: Foreign key to manager_logs table (the day's log)
 * - runningItemId: Foreign key to running_maintenance_list table
 * - title: Denormalized title at snapshot time
 * - description: Denormalized description at snapshot time
 * - status: open/completed at snapshot time
 * - daysOpen: How many days this item has been open at snapshot time
 * - createdAt: When this snapshot was taken
 */
export const runningMaintenanceSnapshots = pgTable("running_maintenance_snapshots", {
  id: serial("id").primaryKey(),
  clubId: varchar("club_id", { length: 64 }).notNull(),
  logId: integer("log_id").notNull().references(() => managerLogs.id, { onDelete: "cascade" }),
  runningItemId: integer("running_item_id").notNull().references(() => runningMaintenanceList.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull(),
  daysOpen: integer("days_open").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * NOTE_PHOTOS TABLE
 * -----------------
 * Stores photo attachments for operational notes and maintenance notes.
 * Each photo is linked to a specific manager log and categorized by note type.
 * 
 * Fields:
 * - id: Auto-generated UUID primary key
 * - clubId: Club identifier for data isolation
 * - logId: Foreign key to manager_logs table
 * - noteType: Either 'operational' or 'maintenance'
 * - url: URL where the image is stored
 * - uploadedAt: Timestamp when photo was uploaded
 */
export const notePhotos = pgTable("note_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id", { length: 64 }).notNull(),
  logId: integer("log_id").notNull().references(() => managerLogs.id, { onDelete: "cascade" }),
  noteType: varchar("note_type", { length: 24 }).notNull(), // 'operational' or 'maintenance'
  url: varchar("url", { length: 1024 }).notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * EMAIL_SETTINGS TABLE
 * --------------------
 * Stores default email content settings per club.
 * Controls which sections are included when composing email notifications.
 * 
 * Fields:
 * - id: Auto-incrementing primary key
 * - clubId: Unique club identifier (one settings row per club)
 * - includeHeader: Include date/day/managers section
 * - includeWeather: Include weather data
 * - includeSales: Include sales figures
 * - includeDrawing: Include daily/weekly drawing numbers
 * - includeOperationalNotes: Include operational notes
 * - includeMaintenanceNotes: Include maintenance notes
 * - includeMaintenanceList: Include running maintenance list
 * - includePhotos: Include photo links
 * - listDefaults: JSON storing per-list preset defaults (e.g., {"Core Team": "full", "Kitchen Staff": "ops_only"})
 * - updatedAt: When settings were last updated
 */
export const emailSettings = pgTable("email_settings", {
  id: serial("id").primaryKey(),
  clubId: varchar("club_id", { length: 64 }).notNull().unique(),
  includeHeader: boolean("include_header").notNull().default(true),
  includeWeather: boolean("include_weather").notNull().default(true),
  includeSales: boolean("include_sales").notNull().default(true),
  includeDrawing: boolean("include_drawing").notNull().default(true),
  includeOperationalNotes: boolean("include_operational_notes").notNull().default(true),
  includeMaintenanceNotes: boolean("include_maintenance_notes").notNull().default(true),
  includeMaintenanceList: boolean("include_maintenance_list").notNull().default(true),
  includePhotos: boolean("include_photos").notNull().default(true),
  listDefaults: jsonb("list_defaults").$type<Record<string, string>>().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  notificationLogs: many(notificationLogs),
  attachments: many(logAttachments),
  notePhotos: many(notePhotos),
}));

export const logAttachmentsRelations = relations(logAttachments, ({ one }) => ({
  managerLog: one(managerLogs, {
    fields: [logAttachments.logId],
    references: [managerLogs.id],
  }),
}));

export const notePhotosRelations = relations(notePhotos, ({ one }) => ({
  managerLog: one(managerLogs, {
    fields: [notePhotos.logId],
    references: [managerLogs.id],
  }),
}));

export const maintenanceItemsRelations = relations(maintenanceItems, ({ one }) => ({
  managerLog: one(managerLogs, {
    fields: [maintenanceItems.managerLogId],
    references: [managerLogs.id],
  }),
}));

export const notificationLogsRelations = relations(notificationLogs, ({ one }) => ({
  managerLog: one(managerLogs, {
    fields: [notificationLogs.logId],
    references: [managerLogs.id],
  }),
}));

export const notificationListsRelations = relations(notificationLists, ({ many }) => ({
  recipients: many(notificationRecipients),
}));

export const notificationRecipientsRelations = relations(notificationRecipients, ({ one }) => ({
  list: one(notificationLists, {
    fields: [notificationRecipients.listId],
    references: [notificationLists.id],
  }),
}));

export const escalationRulesRelations = relations(escalationRules, ({ many }) => ({
  targets: many(escalationRuleTargets),
}));

export const escalationRuleTargetsRelations = relations(escalationRuleTargets, ({ one }) => ({
  rule: one(escalationRules, {
    fields: [escalationRuleTargets.ruleId],
    references: [escalationRules.id],
  }),
  list: one(notificationLists, {
    fields: [escalationRuleTargets.listId],
    references: [notificationLists.id],
  }),
}));

export const logMaintenanceSnapshotsRelations = relations(logMaintenanceSnapshots, ({ one }) => ({
  managerLog: one(managerLogs, {
    fields: [logMaintenanceSnapshots.logId],
    references: [managerLogs.id],
  }),
  maintenanceItem: one(maintenanceItems, {
    fields: [logMaintenanceSnapshots.itemId],
    references: [maintenanceItems.id],
  }),
}));

export const runningMaintenanceSnapshotsRelations = relations(runningMaintenanceSnapshots, ({ one }) => ({
  managerLog: one(managerLogs, {
    fields: [runningMaintenanceSnapshots.logId],
    references: [managerLogs.id],
  }),
  runningItem: one(runningMaintenanceList, {
    fields: [runningMaintenanceSnapshots.runningItemId],
    references: [runningMaintenanceList.id],
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
  clubId: z.string().min(1, "Club ID is required"),
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

// RunningMaintenanceList insert schema
export const insertRunningMaintenanceItemSchema = createInsertSchema(runningMaintenanceList).omit({
  id: true,            // Auto-generated
  dateAdded: true,     // Auto-generated
  dateCompleted: true, // Set when status changes to completed
}).extend({
  status: z.enum(["open", "completed"]).default("open"),
  clubId: z.string().min(1, "Club ID is required"),
  title: z.string().min(1, "Title is required"),
});

// NotificationLog insert schema
export const insertNotificationLogSchema = createInsertSchema(notificationLogs).omit({
  id: true,        // Auto-generated
  createdAt: true, // Auto-generated
}).extend({
  listIds: z.array(z.number()),
  recipients: z.array(z.string().email()),
});

// NotificationList insert schema
export const insertNotificationListSchema = createInsertSchema(notificationLists).omit({
  id: true,        // Auto-generated
  createdAt: true, // Auto-generated
});

// NotificationRecipient insert schema
export const insertNotificationRecipientSchema = createInsertSchema(notificationRecipients).omit({
  id: true,        // Auto-generated
  createdAt: true, // Auto-generated
});

// EscalationRule insert schema
export const insertEscalationRuleSchema = createInsertSchema(escalationRules).omit({
  id: true,        // Auto-generated
  createdAt: true, // Auto-generated
});

// EscalationRuleTarget insert schema
export const insertEscalationRuleTargetSchema = createInsertSchema(escalationRuleTargets).omit({
  id: true,        // Auto-generated
});

// LogAttachment insert schema
export const insertLogAttachmentSchema = createInsertSchema(logAttachments).omit({
  id: true,        // Auto-generated
  createdAt: true, // Auto-generated
});

// NotePhoto insert schema
export const insertNotePhotoSchema = createInsertSchema(notePhotos).omit({
  id: true,          // Auto-generated UUID
  uploadedAt: true,  // Auto-generated
}).extend({
  noteType: z.enum(["operational", "maintenance"]),
});

// PrepChecklistItem insert schema
export const insertPrepChecklistItemSchema = createInsertSchema(prepChecklistItems).omit({
  id: true,           // Auto-generated
  createdAt: true,    // Auto-generated
  rolledOverCount: true, // Defaults to 0
  completedAt: true,  // Set when completed
  completedBy: true,  // Set when completed
  priority: true,     // Has default value
}).extend({
  priority: z.string().optional(),
  assignedTo: z.string().nullable().optional(),
});

export const insertClubSchema = createInsertSchema(clubs).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertClub = z.infer<typeof insertClubSchema>;
export type Club = typeof clubs.$inferSelect;

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
export type InsertRunningMaintenanceItem = z.infer<typeof insertRunningMaintenanceItemSchema>;
export type RunningMaintenanceItem = typeof runningMaintenanceList.$inferSelect;
export type InsertNotificationLog = z.infer<typeof insertNotificationLogSchema>;
export type NotificationLog = typeof notificationLogs.$inferSelect;
export type InsertNotificationList = z.infer<typeof insertNotificationListSchema>;
export type NotificationList = typeof notificationLists.$inferSelect;
export type InsertNotificationRecipient = z.infer<typeof insertNotificationRecipientSchema>;
export type NotificationRecipient = typeof notificationRecipients.$inferSelect;
export type InsertEscalationRule = z.infer<typeof insertEscalationRuleSchema>;
export type EscalationRule = typeof escalationRules.$inferSelect;
export type InsertEscalationRuleTarget = z.infer<typeof insertEscalationRuleTargetSchema>;
export type EscalationRuleTarget = typeof escalationRuleTargets.$inferSelect;
export type InsertLogAttachment = z.infer<typeof insertLogAttachmentSchema>;
export type LogAttachment = typeof logAttachments.$inferSelect;
export type InsertNotePhoto = z.infer<typeof insertNotePhotoSchema>;
export type NotePhoto = typeof notePhotos.$inferSelect;
export type NoteType = "operational" | "maintenance";
export type EmailSettings = typeof emailSettings.$inferSelect;
export type LogMaintenanceSnapshot = typeof logMaintenanceSnapshots.$inferSelect;
export type RunningMaintenanceSnapshot = typeof runningMaintenanceSnapshots.$inferSelect;
export type InsertPrepChecklistItem = z.infer<typeof insertPrepChecklistItemSchema>;
export type PrepChecklistItem = typeof prepChecklistItems.$inferSelect;

/**
 * Extended type for maintenance items with their related log data
 * Used in the Maintenance Overview page to display items with their log dates
 */
export type MaintenanceItemWithLog = MaintenanceItem & {
  logDate: string;
  dayOfWeek: string;
  managerName: string;
};

/**
 * METRICS TYPES
 * =============
 * Types for the Insights/Analytics page metrics.
 * These types are used by both the backend API and frontend components.
 * 
 * All metrics are scoped by clubId and date range to ensure:
 * - Data isolation between clubs
 * - Efficient queries for the selected time period
 */

/**
 * Summary metrics for the selected date range
 */
export interface MetricsSummary {
  daysWithLogs: number;
  totalSales: number;
  averageDailySales: number;
  openToDo: number;
  completedToDo: number;
}

/**
 * Daily sales data point for the sales trend chart
 * Includes category breakdown for detailed analysis
 */
export interface DailySalesData {
  date: string;
  totalSales: number;
  dayOfWeek: string;
  foodSales: number;
  barSales: number;
  gamingSales: number;
}

/**
 * Sales breakdown by category for pie/donut charts
 */
export interface SalesByCategory {
  food: number;
  bar: number;
  gaming: number;
  total: number;
}

/**
 * Granularity options for sales trend aggregation
 * - daily: Show each day individually
 * - weekly: Aggregate by week (Sunday start)
 * - monthly: Aggregate by month
 */
export type GranularityType = "daily" | "weekly" | "monthly";

/**
 * Chart type options for sales trend visualization
 */
export type ChartType = "line" | "bar" | "area";

/**
 * To-Do item status counts
 */
export interface ToDoStatus {
  open: number;
  completed: number;
}

/**
 * Top performing days with sales and notes snippet
 */
export interface TopDayData {
  date: string;
  dayOfWeek: string;
  totalSales: number;
  narrativeSnippet: string;
  logId: number;
}

/**
 * Complete metrics response from the API
 * Used by the Insights page to display all analytics
 * 
 * HOW TO ADD NEW METRICS:
 * 1. Add the new field type here
 * 2. Compute the metric in server/routes.ts metrics endpoint
 * 3. Display in client/src/components/InsightsPage.tsx
 */
export interface MetricsResponse {
  summary: MetricsSummary;
  dailySales: DailySalesData[];
  toDoStatus: ToDoStatus;
  topDays: TopDayData[];
  salesByCategory: SalesByCategory;
}

/**
 * ADVANCED INSIGHTS TYPES
 * =======================
 * Types for advanced analytics features including chart customization,
 * comparison mode, heatmap visualization, and export functionality.
 */

/**
 * Color theme options for chart customization
 * - default: Social Club Pro teal theme
 * - monochrome: Grayscale for printing or accessibility
 * - multicolor: Vibrant multi-color palette
 * - highContrast: High contrast for accessibility compliance
 * 
 * HOW TO ADD NEW THEMES:
 * 1. Add the theme name to this type
 * 2. Add color definitions in ChartColorThemes object (InsightsPage.tsx)
 * 3. Update theme selector UI
 */
export type ChartColorTheme = "default" | "monochrome" | "multicolor" | "highContrast";

/**
 * Line/area chart smoothing options
 * - curved: Smooth bezier curves between points (monotone)
 * - straight: Direct lines between points (linear)
 */
export type ChartSmoothing = "curved" | "straight";

/**
 * Bar/area chart corner style
 * - rounded: Rounded corners on bars
 * - straight: Sharp corners on bars
 */
export type ChartCornerStyle = "rounded" | "straight";

/**
 * Chart customization options
 * Each chart can have its own independent settings stored in React state.
 * 
 * HOW TO ADD NEW OPTIONS:
 * 1. Add the option type here
 * 2. Add default value in DEFAULT_CHART_OPTIONS constant
 * 3. Add UI control in ChartOptionsPopover component
 * 4. Apply the option in the relevant chart component
 */
export interface ChartOptions {
  showGridlines: boolean;
  showDataLabels: boolean;
  enableAnimations: boolean;
  cornerStyle: ChartCornerStyle;
  smoothing: ChartSmoothing;
  colorTheme: ChartColorTheme;
}

/**
 * Comparison period presets
 * - previousPeriod: Same number of days before the current range
 * - previousMonth: Same date range in the previous month
 * - previousYear: Same date range in the previous year
 * - custom: User-defined custom date range
 * 
 * HOW TO EXTEND COMPARISON MODE:
 * 1. Add new preset to this type
 * 2. Add date calculation logic in getComparisonDateRange function
 * 3. Update UI selector
 */
export type ComparisonPeriod = "none" | "previousPeriod" | "previousMonth" | "previousYear" | "custom";

/**
 * Metrics for comparing two periods
 * All values are percentages showing change from comparison period to current period.
 * Positive = increase, Negative = decrease
 */
export interface ComparisonMetrics {
  totalSalesChange: number;
  averageDailySalesChange: number;
  openToDoChange: number;
  completedToDoChange: number;
  daysWithLogsChange: number;
}

/**
 * Complete comparison data structure
 * Contains both the raw metrics and calculated changes
 */
export interface ComparisonData {
  period: ComparisonPeriod;
  startDate: string;
  endDate: string;
  metrics: MetricsSummary;
  dailySales: DailySalesData[];
  changes: ComparisonMetrics;
}

/**
 * Heatmap data point representing a single day
 * Used in the GitHub-style sales heatmap calendar
 * 
 * HOW THE HEATMAP IS GENERATED:
 * 1. Daily sales data is fetched from the metrics API
 * 2. Each day is assigned an intensity level (0-4) based on sales
 * 3. Intensity thresholds are calculated: [0, 25%, 50%, 75%, 100%] of max sales
 * 4. Days are rendered in a calendar grid with colors based on intensity
 * 
 * Intensity levels:
 * - 0: No data (gray)
 * - 1: Low sales (light teal)
 * - 2: Below average (medium teal)
 * - 3: Above average (dark teal)
 * - 4: Peak sales (saturated teal)
 */
export interface HeatmapDay {
  date: string;
  totalSales: number;
  intensity: 0 | 1 | 2 | 3 | 4;
  hasData: boolean;
  dayOfWeek: string;
  weekNumber: number;
}

/**
 * Sales aggregated by weekday
 * Used in the "Sales by Weekday" bar chart
 */
export interface WeekdaySalesData {
  dayOfWeek: string;
  dayIndex: number; // 0=Sunday, 6=Saturday
  totalSales: number;
  averageSales: number;
  count: number;
}

/**
 * Export configuration options
 * Used when exporting charts to PNG or PDF
 * 
 * HOW EXPORT FUNCTIONS WORK:
 * 1. html2canvas captures the chart DOM element as a canvas
 * 2. For PNG: Canvas is converted to base64 and downloaded
 * 3. For PDF: jsPDF creates a document and adds the canvas as an image
 * 4. Metadata (title, date range, club name) is added to the export
 */
export interface ChartExportConfig {
  format: "png" | "pdf";
  includeTitle: boolean;
  includeDateRange: boolean;
  includeClubName: boolean;
  quality: number; // 0-1, for PNG compression
  scale: number; // Resolution multiplier (1-3)
}

/**
 * Collapsible section state
 * Stored in localStorage for persistence across sessions
 */
export interface InsightsSectionState {
  summaryCards: boolean;
  salesTrend: boolean;
  toDoInsights: boolean;
  salesBreakdown: boolean;
  heatmap: boolean;
  weekdayAnalysis: boolean;
}
