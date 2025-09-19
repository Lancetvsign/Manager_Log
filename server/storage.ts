import { type User, type InsertUser, type ManagerLog, type InsertManagerLog } from "@shared/schema";
import { randomUUID } from "crypto";

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

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private managerLogs: Map<string, ManagerLog>;

  constructor() {
    this.users = new Map();
    this.managerLogs = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Manager log methods
  async createManagerLog(insertLog: InsertManagerLog): Promise<ManagerLog> {
    const id = randomUUID();
    const log: ManagerLog = { 
      ...insertLog,
      id,
      lastYearFoodSales: insertLog.lastYearFoodSales ?? null,
      lastYearBarSales: insertLog.lastYearBarSales ?? null,
      lastYearGamingSales: insertLog.lastYearGamingSales ?? null,
      currentWeather: insertLog.currentWeather ?? null,
      historicalWeather: insertLog.historicalWeather ?? null
    };
    this.managerLogs.set(id, log);
    return log;
  }

  async getManagerLog(id: string): Promise<ManagerLog | undefined> {
    return this.managerLogs.get(id);
  }

  async getAllManagerLogs(): Promise<ManagerLog[]> {
    return Array.from(this.managerLogs.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  async getManagerLogsByDateRange(startDate: string, endDate: string): Promise<ManagerLog[]> {
    return Array.from(this.managerLogs.values()).filter(log => {
      const logDate = new Date(log.date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return logDate >= start && logDate <= end;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async updateManagerLog(id: string, updates: Partial<InsertManagerLog>): Promise<ManagerLog | undefined> {
    const existingLog = this.managerLogs.get(id);
    if (!existingLog) return undefined;
    
    const updatedLog: ManagerLog = { ...existingLog, ...updates };
    this.managerLogs.set(id, updatedLog);
    return updatedLog;
  }

  async deleteManagerLog(id: string): Promise<boolean> {
    return this.managerLogs.delete(id);
  }
}

export const storage = new MemStorage();
