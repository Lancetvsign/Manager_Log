import { type User, type InsertUser, type ManagerLog, type InsertManagerLog, users, managerLogs } from "@shared/schema";
import { db } from "./db";
import { eq, desc, gte, lte, and } from "drizzle-orm";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Manager log methods
  createManagerLog(log: InsertManagerLog): Promise<ManagerLog>;
  getManagerLog(id: string): Promise<ManagerLog | undefined>;
  getAllManagerLogs(): Promise<ManagerLog[]>;
  getManagerLogsByDateRange(startDate: string, endDate: string): Promise<ManagerLog[]>;
  updateManagerLog(id: string, updates: Partial<InsertManagerLog>): Promise<ManagerLog | undefined>;
  deleteManagerLog(id: string): Promise<boolean>;
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

  // Manager log methods
  async createManagerLog(insertLog: InsertManagerLog): Promise<ManagerLog> {
    const [log] = await db
      .insert(managerLogs)
      .values({
        ...insertLog,
        lastYearFoodSales: insertLog.lastYearFoodSales ?? null,
        lastYearBarSales: insertLog.lastYearBarSales ?? null,
        lastYearGamingSales: insertLog.lastYearGamingSales ?? null,
        currentWeather: insertLog.currentWeather ?? null,
        historicalWeather: insertLog.historicalWeather ?? null
      })
      .returning();
    return log;
  }

  async getManagerLog(id: string): Promise<ManagerLog | undefined> {
    const [log] = await db.select().from(managerLogs).where(eq(managerLogs.id, id));
    return log || undefined;
  }

  async getAllManagerLogs(): Promise<ManagerLog[]> {
    return await db.select().from(managerLogs).orderBy(desc(managerLogs.date));
  }

  async getManagerLogsByDateRange(startDate: string, endDate: string): Promise<ManagerLog[]> {
    return await db
      .select()
      .from(managerLogs)
      .where(
        and(
          gte(managerLogs.date, startDate),
          lte(managerLogs.date, endDate)
        )
      )
      .orderBy(desc(managerLogs.date));
  }

  async updateManagerLog(id: string, updates: Partial<InsertManagerLog>): Promise<ManagerLog | undefined> {
    const [updatedLog] = await db
      .update(managerLogs)
      .set(updates)
      .where(eq(managerLogs.id, id))
      .returning();
    return updatedLog || undefined;
  }

  async deleteManagerLog(id: string): Promise<boolean> {
    const result = await db
      .delete(managerLogs)
      .where(eq(managerLogs.id, id));
    return (result.rowCount ?? 0) > 0;
  }
}

export const storage = new DatabaseStorage();
