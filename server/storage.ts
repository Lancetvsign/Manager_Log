import { 
  type User, type InsertUser, 
  type ManagerLog, type InsertManagerLog,
  type MaintenanceItem, type InsertMaintenanceItem,
  users, managerLogs, maintenanceItems 
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, gte, lte, and } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createManagerLog(log: InsertManagerLog): Promise<ManagerLog>;
  getManagerLog(id: number): Promise<ManagerLog | undefined>;
  getManagerLogByDate(logDate: string): Promise<ManagerLog | undefined>;
  getAllManagerLogs(): Promise<ManagerLog[]>;
  getManagerLogsByDateRange(startDate: string, endDate: string): Promise<ManagerLog[]>;
  updateManagerLog(id: number, updates: Partial<InsertManagerLog>): Promise<ManagerLog | undefined>;
  deleteManagerLog(id: number): Promise<boolean>;
  upsertManagerLog(log: InsertManagerLog): Promise<ManagerLog>;
  
  createMaintenanceItem(item: InsertMaintenanceItem): Promise<MaintenanceItem>;
  getMaintenanceItemsByLogId(logId: number): Promise<MaintenanceItem[]>;
  updateMaintenanceItem(id: number, updates: Partial<InsertMaintenanceItem>): Promise<MaintenanceItem | undefined>;
  deleteMaintenanceItem(id: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
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

  async createManagerLog(insertLog: InsertManagerLog): Promise<ManagerLog> {
    const [log] = await db
      .insert(managerLogs)
      .values(insertLog)
      .returning();
    return log;
  }

  async getManagerLog(id: number): Promise<ManagerLog | undefined> {
    const [log] = await db.select().from(managerLogs).where(eq(managerLogs.id, id));
    return log || undefined;
  }

  async getManagerLogByDate(logDate: string): Promise<ManagerLog | undefined> {
    const [log] = await db.select().from(managerLogs).where(eq(managerLogs.logDate, logDate));
    return log || undefined;
  }

  async getAllManagerLogs(): Promise<ManagerLog[]> {
    return await db.select().from(managerLogs).orderBy(desc(managerLogs.logDate));
  }

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

  async updateManagerLog(id: number, updates: Partial<InsertManagerLog>): Promise<ManagerLog | undefined> {
    const [updatedLog] = await db
      .update(managerLogs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(managerLogs.id, id))
      .returning();
    return updatedLog || undefined;
  }

  async deleteManagerLog(id: number): Promise<boolean> {
    const result = await db
      .delete(managerLogs)
      .where(eq(managerLogs.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async upsertManagerLog(insertLog: InsertManagerLog): Promise<ManagerLog> {
    const existingLog = await this.getManagerLogByDate(insertLog.logDate);
    
    if (existingLog) {
      const updatedLog = await this.updateManagerLog(existingLog.id, insertLog);
      return updatedLog!;
    } else {
      return await this.createManagerLog(insertLog);
    }
  }

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

  async updateMaintenanceItem(id: number, updates: Partial<InsertMaintenanceItem>): Promise<MaintenanceItem | undefined> {
    const updateData: any = { ...updates };
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

  async deleteMaintenanceItem(id: number): Promise<boolean> {
    const result = await db
      .delete(maintenanceItems)
      .where(eq(maintenanceItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }
}

export const storage = new DatabaseStorage();
