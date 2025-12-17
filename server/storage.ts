/**
 * DATABASE STORAGE LAYER
 * ======================
 * This file implements the data access layer using the Repository Pattern.
 * It provides an abstraction between the API routes and the database,
 * making it easier to test and maintain the application.
 * 
 * MULTI-CLUB SUPPORT:
 * ------------------
 * All manager log operations now require a clubId parameter to ensure
 * data isolation between different clubs in Social Club Pro.
 * Each club only sees and modifies its own data.
 * 
 * Data Flow:
 * API Routes (routes.ts) → Storage Interface (IStorage) → Database (PostgreSQL via Drizzle)
 */

import { 
  type User, type InsertUser, 
  type ManagerLog, type InsertManagerLog,
  type MaintenanceItem, type InsertMaintenanceItem,
  type MaintenanceItemWithLog,
  type LogAttachment, type InsertLogAttachment,
  type PrepChecklistItem, type InsertPrepChecklistItem,
  type RunningMaintenanceItem, type InsertRunningMaintenanceItem,
  type NotePhoto, type InsertNotePhoto, type NoteType,
  users, managerLogs, maintenanceItems, logAttachments, prepChecklistItems, runningMaintenanceList, notePhotos 
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, gte, lte, and, asc } from "drizzle-orm";

/**
 * Storage Interface
 * -----------------
 * Defines all available database operations.
 * Manager log operations require clubId for multi-tenant data isolation.
 */
export interface IStorage {
  // User operations (for future authentication)
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Manager Log operations (all scoped to clubId)
  createManagerLog(log: InsertManagerLog): Promise<ManagerLog>;
  getManagerLog(id: number, clubId: string): Promise<ManagerLog | undefined>;
  getManagerLogByDate(logDate: string, clubId: string): Promise<ManagerLog | undefined>;
  getAllManagerLogs(clubId: string): Promise<ManagerLog[]>;
  getManagerLogsByDateRange(startDate: string, endDate: string, clubId: string): Promise<ManagerLog[]>;
  updateManagerLog(id: number, updates: Partial<InsertManagerLog>, clubId: string): Promise<ManagerLog | undefined>;
  deleteManagerLog(id: number, clubId: string): Promise<boolean>;
  upsertManagerLog(log: InsertManagerLog): Promise<ManagerLog>;
  
  // Maintenance Item operations (indirectly scoped via managerLogId)
  createMaintenanceItem(item: InsertMaintenanceItem): Promise<MaintenanceItem>;
  getMaintenanceItemsByLogId(logId: number): Promise<MaintenanceItem[]>;
  getAllMaintenanceItems(clubId: string, filters?: { status?: string; startDate?: string; endDate?: string }): Promise<MaintenanceItemWithLog[]>;
  updateMaintenanceItem(id: number, updates: Partial<InsertMaintenanceItem>): Promise<MaintenanceItem | undefined>;
  deleteMaintenanceItem(id: number): Promise<boolean>;

  // Log Attachment operations
  createLogAttachment(attachment: InsertLogAttachment): Promise<LogAttachment>;
  getLogAttachmentsByLogId(logId: number, clubId: string): Promise<LogAttachment[]>;
  getLogAttachment(id: number, clubId: string): Promise<LogAttachment | undefined>;
  deleteLogAttachment(id: number, clubId: string): Promise<boolean>;

  // Prep Checklist operations
  createPrepChecklistItem(item: InsertPrepChecklistItem): Promise<PrepChecklistItem>;
  getPrepChecklistItemsByDate(targetDate: string, clubId: string): Promise<PrepChecklistItem[]>;
  getPrepChecklistItem(id: number, clubId: string): Promise<PrepChecklistItem | undefined>;
  updatePrepChecklistItem(id: number, updates: Partial<PrepChecklistItem>, clubId: string): Promise<PrepChecklistItem | undefined>;
  deletePrepChecklistItem(id: number, clubId: string): Promise<boolean>;
  rolloverPrepChecklistItems(fromDate: string, toDate: string, clubId: string): Promise<number>;
  
  // Running Maintenance List operations
  createRunningMaintenanceItem(item: InsertRunningMaintenanceItem): Promise<RunningMaintenanceItem>;
  getRunningMaintenanceItems(clubId: string, status?: string): Promise<RunningMaintenanceItem[]>;
  updateRunningMaintenanceItem(id: number, clubId: string, updates: Partial<RunningMaintenanceItem>): Promise<RunningMaintenanceItem | undefined>;
  deleteRunningMaintenanceItem(id: number, clubId: string): Promise<boolean>;

  // Note Photo operations
  createNotePhoto(photo: InsertNotePhoto): Promise<NotePhoto>;
  getNotePhotosByLogId(logId: number, clubId: string, noteType?: NoteType): Promise<NotePhoto[]>;
  deleteNotePhoto(id: string, clubId: string): Promise<boolean>;
}

/**
 * Database Storage Implementation
 * -------------------------------
 * Implements IStorage using Drizzle ORM with PostgreSQL.
 * All manager log methods filter by clubId for multi-tenant isolation.
 */
export class DatabaseStorage implements IStorage {
  
  // ==================
  // USER OPERATIONS
  // ==================
  
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // ==================
  // MANAGER LOG OPERATIONS (Multi-Club Scoped)
  // ==================

  /**
   * Create a new manager log entry
   * The log's clubId is included in the insertLog data
   */
  async createManagerLog(insertLog: InsertManagerLog): Promise<ManagerLog> {
    const [log] = await db
      .insert(managerLogs)
      .values(insertLog)
      .returning();
    return log;
  }

  /**
   * Get a manager log by ID, scoped to a specific club
   * Ensures clubs cannot access each other's data
   */
  async getManagerLog(id: number, clubId: string): Promise<ManagerLog | undefined> {
    const [log] = await db
      .select()
      .from(managerLogs)
      .where(and(eq(managerLogs.id, id), eq(managerLogs.clubId, clubId)));
    return log || undefined;
  }

  /**
   * Get a manager log by date for a specific club
   * Used by the "Today's Log" page to load existing data
   */
  async getManagerLogByDate(logDate: string, clubId: string): Promise<ManagerLog | undefined> {
    const [log] = await db
      .select()
      .from(managerLogs)
      .where(and(eq(managerLogs.logDate, logDate), eq(managerLogs.clubId, clubId)));
    return log || undefined;
  }

  /**
   * Get all manager logs for a specific club, sorted by date descending
   */
  async getAllManagerLogs(clubId: string): Promise<ManagerLog[]> {
    return await db
      .select()
      .from(managerLogs)
      .where(eq(managerLogs.clubId, clubId))
      .orderBy(desc(managerLogs.logDate));
  }

  /**
   * Get manager logs within a date range for a specific club
   */
  async getManagerLogsByDateRange(startDate: string, endDate: string, clubId: string): Promise<ManagerLog[]> {
    return await db
      .select()
      .from(managerLogs)
      .where(
        and(
          eq(managerLogs.clubId, clubId),
          gte(managerLogs.logDate, startDate),
          lte(managerLogs.logDate, endDate)
        )
      )
      .orderBy(desc(managerLogs.logDate));
  }

  /**
   * Update an existing manager log, scoped to a specific club
   */
  async updateManagerLog(id: number, updates: Partial<InsertManagerLog>, clubId: string): Promise<ManagerLog | undefined> {
    const [updatedLog] = await db
      .update(managerLogs)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(managerLogs.id, id), eq(managerLogs.clubId, clubId)))
      .returning();
    return updatedLog || undefined;
  }

  /**
   * Delete a manager log, scoped to a specific club
   */
  async deleteManagerLog(id: number, clubId: string): Promise<boolean> {
    const result = await db
      .delete(managerLogs)
      .where(and(eq(managerLogs.id, id), eq(managerLogs.clubId, clubId)));
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Create or update a manager log based on date AND clubId
   * This ensures each club has at most one log per day
   */
  async upsertManagerLog(insertLog: InsertManagerLog): Promise<ManagerLog> {
    const existingLog = await this.getManagerLogByDate(insertLog.logDate, insertLog.clubId);
    
    if (existingLog) {
      const updatedLog = await this.updateManagerLog(existingLog.id, insertLog, insertLog.clubId);
      return updatedLog!;
    } else {
      return await this.createManagerLog(insertLog);
    }
  }

  // ==================
  // MAINTENANCE ITEM OPERATIONS
  // ==================

  async createMaintenanceItem(item: InsertMaintenanceItem): Promise<MaintenanceItem> {
    const [created] = await db
      .insert(maintenanceItems)
      .values(item)
      .returning();
    return created;
  }

  async getMaintenanceItemsByLogId(logId: number): Promise<MaintenanceItem[]> {
    return await db
      .select()
      .from(maintenanceItems)
      .where(eq(maintenanceItems.managerLogId, logId))
      .orderBy(desc(maintenanceItems.createdAt));
  }

  /**
   * Get all maintenance items for a specific club with optional filters
   * Joins with managerLogs to filter by clubId and include log info
   */
  async getAllMaintenanceItems(clubId: string, filters?: { 
    status?: string; 
    startDate?: string; 
    endDate?: string 
  }): Promise<MaintenanceItemWithLog[]> {
    let query = db
      .select({
        id: maintenanceItems.id,
        managerLogId: maintenanceItems.managerLogId,
        description: maintenanceItems.description,
        status: maintenanceItems.status,
        notes: maintenanceItems.notes,
        createdAt: maintenanceItems.createdAt,
        resolvedAt: maintenanceItems.resolvedAt,
        carriedOverFromId: maintenanceItems.carriedOverFromId,
        rolledOverToDate: maintenanceItems.rolledOverToDate,
        photoUrl: maintenanceItems.photoUrl,
        logDate: managerLogs.logDate,
        dayOfWeek: managerLogs.dayOfWeek,
        managerName: managerLogs.managerName,
      })
      .from(maintenanceItems)
      .innerJoin(managerLogs, eq(maintenanceItems.managerLogId, managerLogs.id))
      .orderBy(desc(managerLogs.logDate), desc(maintenanceItems.createdAt));

    // Always filter by clubId for multi-tenant isolation
    const conditions = [eq(managerLogs.clubId, clubId)];
    
    if (filters?.status && filters.status !== 'all') {
      conditions.push(eq(maintenanceItems.status, filters.status));
    }
    
    if (filters?.startDate) {
      conditions.push(gte(managerLogs.logDate, filters.startDate));
    }
    
    if (filters?.endDate) {
      conditions.push(lte(managerLogs.logDate, filters.endDate));
    }

    query = query.where(and(...conditions)) as typeof query;

    return await query;
  }

  async updateMaintenanceItem(id: number, updates: Partial<InsertMaintenanceItem>): Promise<MaintenanceItem | undefined> {
    const updateData: any = { ...updates };
    
    // For daily-reset behavior: don't change status, only set/clear resolvedAt
    if (updates.status === "completed") {
      // Mark as completed today by setting resolvedAt, but keep status as 'open'
      updateData.resolvedAt = new Date();
      delete updateData.status; // Don't change status - keep it 'open'
    } else if (updates.status === "open") {
      // Undo: clear resolvedAt to make it active again
      updateData.resolvedAt = null;
      delete updateData.status; // Don't change status - it's already 'open'
    }
    
    const [updated] = await db
      .update(maintenanceItems)
      .set(updateData)
      .where(eq(maintenanceItems.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteMaintenanceItem(id: number): Promise<boolean> {
    const result = await db
      .delete(maintenanceItems)
      .where(eq(maintenanceItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ==================
  // LOG ATTACHMENT OPERATIONS
  // ==================

  async createLogAttachment(attachment: InsertLogAttachment): Promise<LogAttachment> {
    const [created] = await db
      .insert(logAttachments)
      .values(attachment)
      .returning();
    return created;
  }

  async getLogAttachmentsByLogId(logId: number, clubId: string): Promise<LogAttachment[]> {
    return await db
      .select()
      .from(logAttachments)
      .where(and(eq(logAttachments.logId, logId), eq(logAttachments.clubId, clubId)))
      .orderBy(desc(logAttachments.createdAt));
  }

  async getLogAttachment(id: number, clubId: string): Promise<LogAttachment | undefined> {
    const [attachment] = await db
      .select()
      .from(logAttachments)
      .where(and(eq(logAttachments.id, id), eq(logAttachments.clubId, clubId)));
    return attachment || undefined;
  }

  async deleteLogAttachment(id: number, clubId: string): Promise<boolean> {
    const result = await db
      .delete(logAttachments)
      .where(and(eq(logAttachments.id, id), eq(logAttachments.clubId, clubId)));
    return (result.rowCount ?? 0) > 0;
  }

  // ==================
  // PREP CHECKLIST OPERATIONS
  // ==================

  async createPrepChecklistItem(item: InsertPrepChecklistItem): Promise<PrepChecklistItem> {
    const [created] = await db
      .insert(prepChecklistItems)
      .values(item)
      .returning();
    return created;
  }

  async getPrepChecklistItemsByDate(targetDate: string, clubId: string): Promise<PrepChecklistItem[]> {
    return await db
      .select()
      .from(prepChecklistItems)
      .where(and(
        eq(prepChecklistItems.targetDate, targetDate),
        eq(prepChecklistItems.clubId, clubId)
      ))
      .orderBy(desc(prepChecklistItems.createdAt));
  }

  async getPrepChecklistItem(id: number, clubId: string): Promise<PrepChecklistItem | undefined> {
    const [item] = await db
      .select()
      .from(prepChecklistItems)
      .where(and(eq(prepChecklistItems.id, id), eq(prepChecklistItems.clubId, clubId)));
    return item || undefined;
  }

  async updatePrepChecklistItem(id: number, updates: Partial<PrepChecklistItem>, clubId: string): Promise<PrepChecklistItem | undefined> {
    const [updated] = await db
      .update(prepChecklistItems)
      .set(updates)
      .where(and(eq(prepChecklistItems.id, id), eq(prepChecklistItems.clubId, clubId)))
      .returning();
    return updated || undefined;
  }

  async deletePrepChecklistItem(id: number, clubId: string): Promise<boolean> {
    const result = await db
      .delete(prepChecklistItems)
      .where(and(eq(prepChecklistItems.id, id), eq(prepChecklistItems.clubId, clubId)));
    return (result.rowCount ?? 0) > 0;
  }

  async rolloverPrepChecklistItems(fromDate: string, toDate: string, clubId: string): Promise<number> {
    // Find all pending items for fromDate
    const pendingItems = await db
      .select()
      .from(prepChecklistItems)
      .where(and(
        eq(prepChecklistItems.targetDate, fromDate),
        eq(prepChecklistItems.clubId, clubId),
        eq(prepChecklistItems.status, "pending")
      ));

    // Roll each item forward to toDate
    for (const item of pendingItems) {
      await db
        .update(prepChecklistItems)
        .set({
          targetDate: toDate,
          rolledOverCount: (item.rolledOverCount || 0) + 1,
        })
        .where(eq(prepChecklistItems.id, item.id));
    }

    return pendingItems.length;
  }

  // ==================
  // RUNNING MAINTENANCE LIST OPERATIONS
  // ==================

  async createRunningMaintenanceItem(item: InsertRunningMaintenanceItem): Promise<RunningMaintenanceItem> {
    const [created] = await db
      .insert(runningMaintenanceList)
      .values(item)
      .returning();
    return created;
  }

  async getRunningMaintenanceItems(clubId: string, status?: string): Promise<RunningMaintenanceItem[]> {
    if (status) {
      return db
        .select()
        .from(runningMaintenanceList)
        .where(and(
          eq(runningMaintenanceList.clubId, clubId),
          eq(runningMaintenanceList.status, status)
        ))
        .orderBy(asc(runningMaintenanceList.dateAdded));
    }
    return db
      .select()
      .from(runningMaintenanceList)
      .where(eq(runningMaintenanceList.clubId, clubId))
      .orderBy(asc(runningMaintenanceList.dateAdded));
  }

  async updateRunningMaintenanceItem(id: number, clubId: string, updates: Partial<RunningMaintenanceItem>): Promise<RunningMaintenanceItem | undefined> {
    const [updated] = await db
      .update(runningMaintenanceList)
      .set(updates)
      .where(and(
        eq(runningMaintenanceList.id, id),
        eq(runningMaintenanceList.clubId, clubId)
      ))
      .returning();
    return updated || undefined;
  }

  async deleteRunningMaintenanceItem(id: number, clubId: string): Promise<boolean> {
    const result = await db
      .delete(runningMaintenanceList)
      .where(and(
        eq(runningMaintenanceList.id, id),
        eq(runningMaintenanceList.clubId, clubId)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  // ==================
  // NOTE PHOTO OPERATIONS
  // ==================

  async createNotePhoto(photo: InsertNotePhoto): Promise<NotePhoto> {
    const [created] = await db
      .insert(notePhotos)
      .values(photo)
      .returning();
    return created;
  }

  async getNotePhotosByLogId(logId: number, clubId: string, noteType?: NoteType): Promise<NotePhoto[]> {
    if (noteType) {
      return db
        .select()
        .from(notePhotos)
        .where(and(
          eq(notePhotos.logId, logId),
          eq(notePhotos.clubId, clubId),
          eq(notePhotos.noteType, noteType)
        ))
        .orderBy(desc(notePhotos.uploadedAt));
    }
    return db
      .select()
      .from(notePhotos)
      .where(and(
        eq(notePhotos.logId, logId),
        eq(notePhotos.clubId, clubId)
      ))
      .orderBy(desc(notePhotos.uploadedAt));
  }

  async deleteNotePhoto(id: string, clubId: string): Promise<boolean> {
    const result = await db
      .delete(notePhotos)
      .where(and(
        eq(notePhotos.id, id),
        eq(notePhotos.clubId, clubId)
      ));
    return (result.rowCount ?? 0) > 0;
  }
}

export const storage = new DatabaseStorage();
