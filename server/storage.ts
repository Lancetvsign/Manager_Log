/**
 * DATABASE STORAGE LAYER
 * ======================
 * This file implements the data access layer using the Repository Pattern.
 * It provides an abstraction between the API routes and the database,
 * making it easier to test and maintain the application.
 * 
 * Data Flow:
 * API Routes (routes.ts) → Storage Interface (IStorage) → Database (PostgreSQL via Drizzle)
 * 
 * Key Design Decisions:
 * - IStorage interface allows for easy mocking in tests
 * - DatabaseStorage implements all CRUD operations using Drizzle ORM
 * - All database queries are centralized here for consistency
 */

import { 
  type User, type InsertUser, 
  type ManagerLog, type InsertManagerLog,
  type MaintenanceItem, type InsertMaintenanceItem,
  type MaintenanceItemWithLog,
  users, managerLogs, maintenanceItems 
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, gte, lte, and, or, sql } from "drizzle-orm";

/**
 * Storage Interface
 * -----------------
 * Defines all available database operations.
 * Any storage implementation must provide these methods.
 */
export interface IStorage {
  // User operations (for future authentication)
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Manager Log operations
  createManagerLog(log: InsertManagerLog): Promise<ManagerLog>;
  getManagerLog(id: number): Promise<ManagerLog | undefined>;
  getManagerLogByDate(logDate: string): Promise<ManagerLog | undefined>;
  getAllManagerLogs(): Promise<ManagerLog[]>;
  getManagerLogsByDateRange(startDate: string, endDate: string): Promise<ManagerLog[]>;
  updateManagerLog(id: number, updates: Partial<InsertManagerLog>): Promise<ManagerLog | undefined>;
  deleteManagerLog(id: number): Promise<boolean>;
  upsertManagerLog(log: InsertManagerLog): Promise<ManagerLog>;
  
  // Maintenance Item operations
  createMaintenanceItem(item: InsertMaintenanceItem): Promise<MaintenanceItem>;
  getMaintenanceItemsByLogId(logId: number): Promise<MaintenanceItem[]>;
  getAllMaintenanceItems(filters?: { status?: string; startDate?: string; endDate?: string }): Promise<MaintenanceItemWithLog[]>;
  updateMaintenanceItem(id: number, updates: Partial<InsertMaintenanceItem>): Promise<MaintenanceItem | undefined>;
  deleteMaintenanceItem(id: number): Promise<boolean>;
}

/**
 * Database Storage Implementation
 * -------------------------------
 * Implements IStorage using Drizzle ORM with PostgreSQL.
 * All methods interact with the database through the Drizzle query builder.
 */
export class DatabaseStorage implements IStorage {
  
  // ==================
  // USER OPERATIONS
  // ==================
  
  /**
   * Get a user by their ID
   * @param id - The user's UUID
   * @returns The user record or undefined if not found
   */
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  /**
   * Get a user by their username (for login)
   * @param username - The username to look up
   * @returns The user record or undefined if not found
   */
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  /**
   * Create a new user
   * @param insertUser - The user data to insert
   * @returns The newly created user record
   */
  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // ==================
  // MANAGER LOG OPERATIONS
  // ==================

  /**
   * Create a new manager log entry
   * Note: Use upsertManagerLog() instead if you want create-or-update behavior
   * @param insertLog - The log data to insert
   * @returns The newly created log record
   */
  async createManagerLog(insertLog: InsertManagerLog): Promise<ManagerLog> {
    const [log] = await db
      .insert(managerLogs)
      .values(insertLog)
      .returning();
    return log;
  }

  /**
   * Get a manager log by its numeric ID
   * @param id - The log's serial ID
   * @returns The log record or undefined if not found
   */
  async getManagerLog(id: number): Promise<ManagerLog | undefined> {
    const [log] = await db.select().from(managerLogs).where(eq(managerLogs.id, id));
    return log || undefined;
  }

  /**
   * Get a manager log by date
   * Since logDate is unique, this returns at most one record.
   * Used by the "Today's Log" page to load existing data for a selected date.
   * @param logDate - The date in YYYY-MM-DD format
   * @returns The log record or undefined if not found
   */
  async getManagerLogByDate(logDate: string): Promise<ManagerLog | undefined> {
    const [log] = await db.select().from(managerLogs).where(eq(managerLogs.logDate, logDate));
    return log || undefined;
  }

  /**
   * Get all manager logs, sorted by date descending (newest first)
   * Used by the History page to display all entries
   * @returns Array of all log records
   */
  async getAllManagerLogs(): Promise<ManagerLog[]> {
    return await db.select().from(managerLogs).orderBy(desc(managerLogs.logDate));
  }

  /**
   * Get manager logs within a date range
   * Used by History page filters (Last 7 Days, Last 30 Days)
   * @param startDate - Start date in YYYY-MM-DD format (inclusive)
   * @param endDate - End date in YYYY-MM-DD format (inclusive)
   * @returns Array of log records within the range
   */
  async getManagerLogsByDateRange(startDate: string, endDate: string): Promise<ManagerLog[]> {
    return await db
      .select()
      .from(managerLogs)
      .where(
        and(
          gte(managerLogs.logDate, startDate),
          lte(managerLogs.logDate, endDate)
        )
      )
      .orderBy(desc(managerLogs.logDate));
  }

  /**
   * Update an existing manager log
   * Automatically updates the updatedAt timestamp
   * @param id - The log's serial ID
   * @param updates - Partial log data to update
   * @returns The updated log record or undefined if not found
   */
  async updateManagerLog(id: number, updates: Partial<InsertManagerLog>): Promise<ManagerLog | undefined> {
    const [updatedLog] = await db
      .update(managerLogs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(managerLogs.id, id))
      .returning();
    return updatedLog || undefined;
  }

  /**
   * Delete a manager log and all its maintenance items (via CASCADE)
   * @param id - The log's serial ID
   * @returns true if deleted, false if not found
   */
  async deleteManagerLog(id: number): Promise<boolean> {
    const result = await db
      .delete(managerLogs)
      .where(eq(managerLogs.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Create or update a manager log based on date
   * This is the primary method used by the "Save / Update Log Entry" button.
   * If a log exists for the given date, it updates it; otherwise creates new.
   * @param insertLog - The log data to upsert
   * @returns The created or updated log record
   */
  async upsertManagerLog(insertLog: InsertManagerLog): Promise<ManagerLog> {
    const existingLog = await this.getManagerLogByDate(insertLog.logDate);
    
    if (existingLog) {
      // Update existing log for this date
      const updatedLog = await this.updateManagerLog(existingLog.id, insertLog);
      return updatedLog!;
    } else {
      // Create new log for this date
      return await this.createManagerLog(insertLog);
    }
  }

  // ==================
  // MAINTENANCE ITEM OPERATIONS
  // ==================

  /**
   * Create a new maintenance item linked to a log
   * @param item - The maintenance item data (must include managerLogId)
   * @returns The newly created maintenance item
   */
  async createMaintenanceItem(item: InsertMaintenanceItem): Promise<MaintenanceItem> {
    const [created] = await db
      .insert(maintenanceItems)
      .values(item)
      .returning();
    return created;
  }

  /**
   * Get all maintenance items for a specific log
   * Used by both the Today's Log form and History detail view
   * @param logId - The manager log's serial ID
   * @returns Array of maintenance items, newest first
   */
  async getMaintenanceItemsByLogId(logId: number): Promise<MaintenanceItem[]> {
    return await db
      .select()
      .from(maintenanceItems)
      .where(eq(maintenanceItems.managerLogId, logId))
      .orderBy(desc(maintenanceItems.createdAt));
  }

  /**
   * Get all maintenance items with optional filters
   * Used by the Maintenance Overview page to show items across all days
   * Joins with managerLogs to include the log date with each item
   * @param filters - Optional filters for status and date range
   * @returns Array of maintenance items with their log information
   */
  async getAllMaintenanceItems(filters?: { 
    status?: string; 
    startDate?: string; 
    endDate?: string 
  }): Promise<MaintenanceItemWithLog[]> {
    // Build the query with a JOIN to get log date information
    let query = db
      .select({
        id: maintenanceItems.id,
        managerLogId: maintenanceItems.managerLogId,
        description: maintenanceItems.description,
        status: maintenanceItems.status,
        notes: maintenanceItems.notes,
        createdAt: maintenanceItems.createdAt,
        resolvedAt: maintenanceItems.resolvedAt,
        logDate: managerLogs.logDate,
        dayOfWeek: managerLogs.dayOfWeek,
        managerName: managerLogs.managerName,
      })
      .from(maintenanceItems)
      .innerJoin(managerLogs, eq(maintenanceItems.managerLogId, managerLogs.id))
      .orderBy(desc(managerLogs.logDate), desc(maintenanceItems.createdAt));

    // Apply filters if provided
    const conditions = [];
    
    if (filters?.status && filters.status !== 'all') {
      conditions.push(eq(maintenanceItems.status, filters.status));
    }
    
    if (filters?.startDate) {
      conditions.push(gte(managerLogs.logDate, filters.startDate));
    }
    
    if (filters?.endDate) {
      conditions.push(lte(managerLogs.logDate, filters.endDate));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    return await query;
  }

  /**
   * Update a maintenance item
   * Automatically sets resolvedAt when status changes to "completed"
   * @param id - The maintenance item's serial ID
   * @param updates - Partial item data to update
   * @returns The updated item or undefined if not found
   */
  async updateMaintenanceItem(id: number, updates: Partial<InsertMaintenanceItem>): Promise<MaintenanceItem | undefined> {
    const updateData: any = { ...updates };
    
    // Set resolvedAt timestamp when marking as completed
    if (updates.status === "completed") {
      updateData.resolvedAt = new Date();
    }
    
    const [updated] = await db
      .update(maintenanceItems)
      .set(updateData)
      .where(eq(maintenanceItems.id, id))
      .returning();
    return updated || undefined;
  }

  /**
   * Delete a maintenance item
   * @param id - The maintenance item's serial ID
   * @returns true if deleted, false if not found
   */
  async deleteMaintenanceItem(id: number): Promise<boolean> {
    const result = await db
      .delete(maintenanceItems)
      .where(eq(maintenanceItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }
}

// Export a singleton instance used throughout the application
export const storage = new DatabaseStorage();
