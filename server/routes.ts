/**
 * API ROUTES
 * ==========
 * This file defines all HTTP endpoints for the Restaurant Manager's Log API.
 * It handles incoming requests, validates data, and delegates to the storage layer.
 * 
 * MULTI-CLUB SUPPORT:
 * ------------------
 * All manager log routes require a `clubId` query parameter to ensure
 * data isolation between different clubs in Social Club Pro.
 * 
 * HOW TO CHANGE API BASE URL:
 * --------------------------
 * When embedding this module in Social Club Pro, you can mount these routes
 * under a different base path (e.g., /manager-log/api/...) by configuring
 * the Express router prefix in the parent application.
 * 
 * Data Flow:
 * HTTP Request → Express Route → Validation (Zod) → Storage Layer → Database → Response
 */

import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertManagerLogSchema, insertMaintenanceItemSchema, notificationLogs, managerLogs, notificationLists, notificationRecipients, logMaintenanceSnapshots, maintenanceItems, runningMaintenanceList, runningMaintenanceSnapshots } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, count, asc, gte, lte, sql } from "drizzle-orm";
import type { MetricsResponse, MetricsSummary, DailySalesData, ToDoStatus, TopDayData, SalesByCategory } from "@shared/schema";
import { sendLogNotificationEmail, isEmailConfigured } from "./email";
import { getNotificationLists, seedDefaultNotificationLists } from "./notificationLists";
import { z } from "zod";
import { escalationRules, escalationRuleTargets } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import { verifyEmbedSignature, type EmbedParams } from "./auth";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const fileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({
  storage: fileStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Default clubId for backwards compatibility when not provided
const DEFAULT_CLUB_ID = "default";

/**
 * Extracts clubId from request query params
 * Falls back to 'default' if not provided (for backwards compatibility)
 */
function getClubId(req: { query: { clubId?: string } }): string {
  return (req.query.clubId as string) || DEFAULT_CLUB_ID;
}

/**
 * Checks if a date string represents a past date (before today)
 * @param dateStr - Date in YYYY-MM-DD format
 * @returns true if the date is before today
 */
function isPastDate(dateStr: string): boolean {
  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = dateStr.split("-").map(Number);
  const logDate = new Date(y, m - 1, d);
  return logDate < todayOnly;
}

/**
 * Captures a snapshot of all open maintenance items for a log.
 * This ensures Log History shows accurate data even if items are edited later.
 * @param logId - The log ID to capture snapshot for
 * @param clubId - The club ID to filter items by
 */
async function captureMaintenanceSnapshot(logId: number, clubId: string) {
  try {
    // Get all open maintenance items for this club
    const openItems = await db
      .select({
        id: maintenanceItems.id,
        status: maintenanceItems.status,
        notes: maintenanceItems.notes,
        carriedOverFromId: maintenanceItems.carriedOverFromId,
      })
      .from(maintenanceItems)
      .innerJoin(managerLogs, eq(maintenanceItems.managerLogId, managerLogs.id))
      .where(
        and(
          eq(managerLogs.clubId, clubId),
          eq(maintenanceItems.status, "open")
        )
      )
      .orderBy(asc(maintenanceItems.createdAt));

    // Delete any previous snapshot rows for this log (so re-saving updates snapshot cleanly)
    await db.delete(logMaintenanceSnapshots).where(eq(logMaintenanceSnapshots.logId, logId));

    // Insert snapshot rows
    if (openItems.length > 0) {
      await db.insert(logMaintenanceSnapshots).values(
        openItems.map(item => ({
          logId,
          itemId: item.id,
          statusAtTime: item.status,
          notesAtTime: item.notes ?? "",
          carriedOverFromLogId: item.carriedOverFromId ?? null,
        }))
      );
    }
    
    console.log(`Captured maintenance snapshot for log ${logId}: ${openItems.length} items`);
  } catch (error) {
    console.error("Error capturing maintenance snapshot:", error);
  }
}

/**
 * Captures a snapshot of all open running maintenance items for a log.
 * Used to power Insights with historical data for trends and carryovers.
 * @param clubId - The club ID to filter items by
 * @param logId - The log ID to associate with the snapshot
 */
async function snapshotRunningMaintenanceForLog(clubId: string, logId: number) {
  try {
    // 1) Clear any existing snapshots for that log (idempotent)
    await db.delete(runningMaintenanceSnapshots).where(
      and(
        eq(runningMaintenanceSnapshots.clubId, clubId),
        eq(runningMaintenanceSnapshots.logId, logId)
      )
    );

    // 2) Load all open running maintenance items (oldest → newest)
    const openItems = await db
      .select()
      .from(runningMaintenanceList)
      .where(
        and(
          eq(runningMaintenanceList.clubId, clubId),
          eq(runningMaintenanceList.status, "open")
        )
      )
      .orderBy(asc(runningMaintenanceList.dateAdded));

    // 3) Insert snapshots
    if (openItems.length > 0) {
      await db.insert(runningMaintenanceSnapshots).values(
        openItems.map((item) => ({
          clubId,
          logId,
          runningItemId: item.id,
          title: item.title,
          description: item.description ?? null,
          status: item.status,
          daysOpen: Math.floor((Date.now() - new Date(item.dateAdded).getTime()) / 86400000),
        }))
      );
    }

    console.log(`Captured running maintenance snapshot for log ${logId}: ${openItems.length} items`);
  } catch (error) {
    console.error("Error capturing running maintenance snapshot:", error);
  }
}

// ==================
// WEATHER SERVICE
// ==================

async function getCurrentWeather(lat: number = 40.7128, lon: number = -74.0060) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Weather API request failed: ${response.status}`);
    }
    
    const data = await response.json();
    const current = data.current;
    
    return {
      temperature: Math.round(current.temperature_2m),
      condition: getWeatherCondition(current.weather_code),
      humidity: current.relative_humidity_2m,
      windSpeed: Math.round(current.wind_speed_10m),
      description: getWeatherDescription(current.weather_code)
    };
  } catch (error) {
    console.error('Error fetching current weather:', error);
    return {
      temperature: Math.floor(Math.random() * 30) + 50,
      condition: "Cloudy",
      humidity: 50,
      windSpeed: 8,
      description: "Weather data temporarily unavailable"
    };
  }
}

async function getHistoricalWeather(date: string, lat: number = 40.7128, lon: number = -74.0060) {
  try {
    const url = `https://api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&daily=temperature_2m_max,relative_humidity_2m_mean,wind_speed_10m_max,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Historical weather API request failed: ${response.status}`);
    }
    
    const data = await response.json();
    const daily = data.daily;
    
    if (!daily || !daily.temperature_2m_max || daily.temperature_2m_max.length === 0) {
      throw new Error('No historical weather data available for this date');
    }
    
    return {
      temperature: Math.round(daily.temperature_2m_max[0]),
      condition: getWeatherCondition(daily.weather_code[0]),
      humidity: Math.round(daily.relative_humidity_2m_mean[0]),
      windSpeed: Math.round(daily.wind_speed_10m_max[0]),
      description: getWeatherDescription(daily.weather_code[0])
    };
  } catch (error) {
    console.error('Error fetching historical weather:', error);
    return {
      temperature: Math.floor(Math.random() * 25) + 45,
      condition: "Cloudy",
      humidity: 55,
      windSpeed: 10,
      description: "Historical weather data temporarily unavailable"
    };
  }
}

function getWeatherCondition(weatherCode: number): string {
  if (weatherCode === 0) return "Clear";
  if (weatherCode >= 1 && weatherCode <= 3) return "Cloudy";
  if (weatherCode >= 45 && weatherCode <= 48) return "Foggy";
  if (weatherCode >= 51 && weatherCode <= 67) return "Rainy";
  if (weatherCode >= 71 && weatherCode <= 77) return "Snowy";
  if (weatherCode >= 80 && weatherCode <= 99) return "Rainy";
  return "Cloudy";
}

function getWeatherDescription(weatherCode: number): string {
  const descriptions: { [key: number]: string } = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy", 
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers"
  };
  
  return descriptions[weatherCode] || "Unknown conditions";
}

function formatWeatherString(weather: { temperature: number; condition: string; humidity: number; windSpeed: number; description: string }): string {
  return `${weather.temperature}°F, ${weather.description}, Humidity: ${weather.humidity}%, Wind: ${weather.windSpeed} mph`;
}

// ==================
// ROUTE REGISTRATION
// ==================

export async function registerRoutes(app: Express): Promise<Server> {
  
  // ==================
  // MANAGER LOGS API
  // ==================

  /**
   * GET /api/manager-logs
   * Retrieves all manager log entries for a club, sorted by date descending.
   * @query clubId - The club identifier (required for proper data isolation)
   */
  app.get("/api/manager-logs", async (req, res) => {
    try {
      const clubId = getClubId(req);
      const logs = await storage.getAllManagerLogs(clubId);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching manager logs:", error);
      res.status(500).json({ error: "Failed to fetch manager logs" });
    }
  });

  /**
   * GET /api/manager-logs/by-date/:date
   * Retrieves a single log entry by its date for a specific club.
   * @param date - The date in YYYY-MM-DD format
   * @query clubId - The club identifier
   */
  app.get("/api/manager-logs/by-date/:date", async (req, res) => {
    try {
      const { date } = req.params;
      const clubId = getClubId(req);
      const log = await storage.getManagerLogByDate(date, clubId);
      if (!log) {
        return res.status(404).json({ error: "No log found for this date" });
      }
      res.json(log);
    } catch (error) {
      console.error("Error fetching manager log by date:", error);
      res.status(500).json({ error: "Failed to fetch manager log" });
    }
  });

  /**
   * GET /api/manager-logs/:id
   * Retrieves a single log entry by its numeric ID.
   * @param id - The log's serial ID
   * @query clubId - The club identifier
   */
  app.get("/api/manager-logs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const clubId = getClubId(req);
      const log = await storage.getManagerLog(id, clubId);
      if (!log) {
        return res.status(404).json({ error: "Manager log not found" });
      }
      res.json(log);
    } catch (error) {
      console.error("Error fetching manager log:", error);
      res.status(500).json({ error: "Failed to fetch manager log" });
    }
  });

  /**
   * POST /api/manager-logs
   * Creates a new log entry or updates an existing one for the same date+club.
   * Uses upsert behavior: if a log for the date exists, it updates; otherwise creates.
   * Requires clubId in the request body.
   */
  app.post("/api/manager-logs", async (req, res) => {
    try {
      const validatedData = insertManagerLogSchema.parse(req.body);
      
      // Block creating/updating logs for past dates
      if (validatedData.logDate && isPastDate(validatedData.logDate)) {
        return res.status(403).json({
          error: "Past logs are read-only. You cannot create or modify logs for past dates.",
        });
      }
      
      const log = await storage.upsertManagerLog(validatedData);
      
      // Capture maintenance snapshot for this log (stores current state of open items)
      await captureMaintenanceSnapshot(log.id, validatedData.clubId);
      // Capture running maintenance snapshot for insights
      await snapshotRunningMaintenanceForLog(validatedData.clubId, log.id);
      
      res.status(201).json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: error.errors 
        });
      }
      console.error("Error creating/updating manager log:", error);
      res.status(500).json({ error: "Failed to save manager log" });
    }
  });

  /**
   * POST /api/logs/ensure
   * Ensures a log entry exists for a given club+date.
   * If it exists, returns the logId. If not, creates a minimal log and returns the new logId.
   * This is useful for ensuring a log exists before sending notifications.
   */
  app.post("/api/logs/ensure", async (req, res) => {
    try {
      const { clubId, date, managerName } = req.body as {
        clubId: string;
        date: string;
        managerName?: string;
      };

      if (!clubId || !date) {
        return res.status(400).json({ error: "clubId and date are required" });
      }

      // Try to find existing log for that club + date
      const [existing] = await db
        .select()
        .from(managerLogs)
        .where(
          and(
            eq(managerLogs.clubId, clubId),
            eq(managerLogs.logDate, date)
          )
        )
        .limit(1);

      if (existing) {
        return res.json({ logId: existing.id });
      }

      // Create minimal log - need dayOfWeek for the schema
      const dateObj = new Date(date);
      const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

      const [inserted] = await db
        .insert(managerLogs)
        .values({
          clubId,
          logDate: date,
          dayOfWeek,
          managerName: managerName || "Unassigned",
        })
        .returning({ id: managerLogs.id });

      res.json({ logId: inserted.id });
    } catch (error) {
      console.error("Error ensuring log exists:", error);
      res.status(500).json({ error: "Failed to ensure log exists" });
    }
  });

  /**
   * PATCH /api/manager-logs/:id
   * Partially updates an existing log entry.
   * @param id - The log's serial ID
   * @query clubId - The club identifier
   */
  app.patch("/api/manager-logs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const clubId = getClubId(req);
      
      // Fetch existing log to check date
      const existing = await storage.getManagerLog(id, clubId);
      if (!existing) {
        return res.status(404).json({ error: "Manager log not found" });
      }
      
      // Block updating logs for past dates
      if (existing.logDate && isPastDate(existing.logDate)) {
        return res.status(403).json({
          error: "Past logs are read-only and cannot be edited.",
        });
      }
      
      const updates = insertManagerLogSchema.partial().parse(req.body);
      const updatedLog = await storage.updateManagerLog(id, updates, clubId);
      
      if (!updatedLog) {
        return res.status(404).json({ error: "Manager log not found" });
      }
      
      res.json(updatedLog);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: error.errors 
        });
      }
      console.error("Error updating manager log:", error);
      res.status(500).json({ error: "Failed to update manager log" });
    }
  });

  /**
   * DELETE /api/manager-logs/:id
   * Deletes a log entry and all its associated maintenance items (CASCADE).
   * @param id - The log's serial ID
   * @query clubId - The club identifier
   */
  app.delete("/api/manager-logs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const clubId = getClubId(req);
      const deleted = await storage.deleteManagerLog(id, clubId);
      if (!deleted) {
        return res.status(404).json({ error: "Manager log not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting manager log:", error);
      res.status(500).json({ error: "Failed to delete manager log" });
    }
  });

  /**
   * GET /api/manager-logs/range/:startDate/:endDate
   * Retrieves logs within a date range for a specific club.
   * @param startDate - Start date in YYYY-MM-DD format
   * @param endDate - End date in YYYY-MM-DD format
   * @query clubId - The club identifier
   */
  app.get("/api/manager-logs/range/:startDate/:endDate", async (req, res) => {
    try {
      const { startDate, endDate } = req.params;
      const clubId = getClubId(req);
      const logs = await storage.getManagerLogsByDateRange(startDate, endDate, clubId);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching manager logs by date range:", error);
      res.status(500).json({ error: "Failed to fetch manager logs" });
    }
  });

  // ==================
  // MAINTENANCE ITEMS API
  // ==================

  /**
   * GET /api/maintenance-items
   * Retrieves all maintenance items for a club with optional filters.
   * 
   * @query clubId - The club identifier (required)
   * @query status - Filter by status ('all', 'open', 'completed')
   * @query startDate - Start date for date range filter (YYYY-MM-DD)
   * @query endDate - End date for date range filter (YYYY-MM-DD)
   */
  app.get("/api/maintenance-items", async (req, res) => {
    try {
      const clubId = getClubId(req);
      const { status, startDate, endDate } = req.query;
      
      const filters: { status?: string; startDate?: string; endDate?: string } = {};
      
      if (status && typeof status === 'string') {
        filters.status = status;
      }
      if (startDate && typeof startDate === 'string') {
        filters.startDate = startDate;
      }
      if (endDate && typeof endDate === 'string') {
        filters.endDate = endDate;
      }
      
      const items = await storage.getAllMaintenanceItems(clubId, filters);
      res.json(items);
    } catch (error) {
      console.error("Error fetching all maintenance items:", error);
      res.status(500).json({ error: "Failed to fetch maintenance items" });
    }
  });

  /**
   * GET /api/manager-logs/:logId/maintenance
   * Retrieves all maintenance items for a specific log entry.
   */
  app.get("/api/manager-logs/:logId/maintenance", async (req, res) => {
    try {
      const logId = parseInt(req.params.logId, 10);
      if (isNaN(logId)) {
        return res.status(400).json({ error: "Invalid log ID" });
      }
      const items = await storage.getMaintenanceItemsByLogId(logId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching maintenance items:", error);
      res.status(500).json({ error: "Failed to fetch maintenance items" });
    }
  });

  /**
   * GET /api/manager-logs/:logId/maintenance-snapshot
   * Retrieves the maintenance snapshot for a specific log entry.
   * This returns the state of open maintenance items as they were when the log was saved.
   * Used for Log History view to show accurate historical data.
   */
  app.get("/api/manager-logs/:logId/maintenance-snapshot", async (req, res) => {
    try {
      const logId = parseInt(req.params.logId, 10);
      if (isNaN(logId)) {
        return res.status(400).json({ error: "Invalid log ID" });
      }
      
      // Get snapshot items joined with maintenance item details
      const snapshotItems = await db
        .select({
          id: logMaintenanceSnapshots.id,
          itemId: logMaintenanceSnapshots.itemId,
          status: logMaintenanceSnapshots.statusAtTime,
          notes: logMaintenanceSnapshots.notesAtTime,
          capturedAt: logMaintenanceSnapshots.capturedAt,
          description: maintenanceItems.description,
          createdAt: maintenanceItems.createdAt,
          photoUrl: maintenanceItems.photoUrl,
        })
        .from(logMaintenanceSnapshots)
        .innerJoin(maintenanceItems, eq(logMaintenanceSnapshots.itemId, maintenanceItems.id))
        .where(eq(logMaintenanceSnapshots.logId, logId))
        .orderBy(asc(maintenanceItems.createdAt));
      
      res.json(snapshotItems);
    } catch (error) {
      console.error("Error fetching maintenance snapshot:", error);
      res.status(500).json({ error: "Failed to fetch maintenance snapshot" });
    }
  });

  /**
   * POST /api/maintenance-items
   * Creates a new maintenance item linked to a log entry.
   */
  app.post("/api/maintenance-items", async (req, res) => {
    try {
      const validatedData = insertMaintenanceItemSchema.parse(req.body);
      const item = await storage.createMaintenanceItem(validatedData);
      
      // Update the maintenance snapshot for the associated log
      if (item.managerLogId) {
        const [log] = await db.select().from(managerLogs).where(eq(managerLogs.id, item.managerLogId)).limit(1);
        if (log) {
          await captureMaintenanceSnapshot(log.id, log.clubId);
          await snapshotRunningMaintenanceForLog(log.clubId, log.id);
        }
      }
      
      res.status(201).json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: error.errors 
        });
      }
      console.error("Error creating maintenance item:", error);
      res.status(500).json({ error: "Failed to create maintenance item" });
    }
  });

  /**
   * PATCH /api/maintenance-items/:id
   * Updates a maintenance item.
   */
  app.patch("/api/maintenance-items/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const updates = insertMaintenanceItemSchema.partial().parse(req.body);
      const item = await storage.updateMaintenanceItem(id, updates);
      
      if (!item) {
        return res.status(404).json({ error: "Maintenance item not found" });
      }
      
      // Update the maintenance snapshot for the associated log
      if (item.managerLogId) {
        const [log] = await db.select().from(managerLogs).where(eq(managerLogs.id, item.managerLogId)).limit(1);
        if (log) {
          await captureMaintenanceSnapshot(log.id, log.clubId);
          await snapshotRunningMaintenanceForLog(log.clubId, log.id);
        }
      }
      
      res.json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: error.errors 
        });
      }
      console.error("Error updating maintenance item:", error);
      res.status(500).json({ error: "Failed to update maintenance item" });
    }
  });

  /**
   * DELETE /api/maintenance-items/:id
   * Deletes a maintenance item.
   */
  app.delete("/api/maintenance-items/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const deleted = await storage.deleteMaintenanceItem(id);
      if (!deleted) {
        return res.status(404).json({ error: "Maintenance item not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting maintenance item:", error);
      res.status(500).json({ error: "Failed to delete maintenance item" });
    }
  });

  /**
   * POST /api/maintenance-items/rollover
   * Rolls over open to-do items from one date to another.
   * Creates copies of open items on the target date's log and marks originals as rolled.
   */
  app.post("/api/maintenance-items/rollover", async (req, res) => {
    try {
      const clubId = getClubId(req);
      const { fromDate, toDate } = req.body;

      if (!fromDate || !toDate) {
        return res.status(400).json({ error: "fromDate and toDate are required" });
      }

      // Validate date formats
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(fromDate) || !dateRegex.test(toDate)) {
        return res.status(400).json({ error: "Dates must be in YYYY-MM-DD format" });
      }

      const { rollOpenTodosForDate } = await import("./todoRollover");
      const result = await rollOpenTodosForDate(clubId, fromDate, toDate);
      res.json(result);
    } catch (error) {
      console.error("Error rolling over maintenance items:", error);
      res.status(500).json({ error: "Failed to rollover maintenance items" });
    }
  });

  /**
   * GET /api/maintenance/open
   * Retrieves all open maintenance items for a club with their log dates.
   * Returns items sorted oldest to newest.
   * @query clubId - The club identifier (required)
   */
  app.get("/api/maintenance/open", async (req, res) => {
    try {
      const clubId = getClubId(req);
      if (!clubId) {
        return res.status(400).json({ error: "clubId is required" });
      }

      const { maintenanceItems } = await import("@shared/schema");
      const items = await db
        .select({
          id: maintenanceItems.id,
          description: maintenanceItems.description,
          status: maintenanceItems.status,
          notes: maintenanceItems.notes,
          createdAt: maintenanceItems.createdAt,
          logDate: managerLogs.logDate,
          photoUrl: maintenanceItems.photoUrl,
          managerLogId: maintenanceItems.managerLogId,
        })
        .from(maintenanceItems)
        .innerJoin(
          managerLogs,
          eq(maintenanceItems.managerLogId, managerLogs.id)
        )
        .where(
          and(
            eq(managerLogs.clubId, clubId),
            eq(maintenanceItems.status, "open")
          )
        )
        .orderBy(maintenanceItems.createdAt);

      res.json(items);
    } catch (error) {
      console.error("Error fetching open maintenance items:", error);
      res.status(500).json({ error: "Failed to fetch open maintenance items" });
    }
  });

  /**
   * POST /api/maintenance/:id/photo
   * Uploads a photo for a specific maintenance item.
   * @param id - The maintenance item ID
   */
  app.post("/api/maintenance/:id/photo", upload.single("photo"), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Generate public URL for the uploaded file
      const publicUrl = `/uploads/${file.filename}`;

      const { maintenanceItems } = await import("@shared/schema");
      await db
        .update(maintenanceItems)
        .set({ photoUrl: publicUrl })
        .where(eq(maintenanceItems.id, id));

      res.json({ photoUrl: publicUrl });
    } catch (error) {
      console.error("Error uploading maintenance photo:", error);
      res.status(500).json({ error: "Failed to upload photo" });
    }
  });

  // ==================
  // WEATHER API
  // ==================

  app.get("/api/weather/current", async (req, res) => {
    try {
      const { lat, lon } = req.query;
      const weather = await getCurrentWeather(
        lat ? parseFloat(lat as string) : undefined,
        lon ? parseFloat(lon as string) : undefined
      );
      res.json(weather);
    } catch (error) {
      console.error("Error fetching current weather:", error);
      res.status(500).json({ error: "Failed to fetch current weather" });
    }
  });

  app.get("/api/weather/current/formatted", async (req, res) => {
    try {
      const { lat, lon } = req.query;
      const weather = await getCurrentWeather(
        lat ? parseFloat(lat as string) : undefined,
        lon ? parseFloat(lon as string) : undefined
      );
      res.json({ weather: formatWeatherString(weather) });
    } catch (error) {
      console.error("Error fetching current weather:", error);
      res.status(500).json({ error: "Failed to fetch current weather" });
    }
  });

  app.get("/api/weather/historical", async (req, res) => {
    try {
      const { date, lat, lon } = req.query;
      
      if (!date) {
        return res.status(400).json({ error: "Date parameter is required" });
      }
      
      const targetDate = new Date(date as string);
      // Use 52 weeks (364 days) before for year-over-year comparison (same day of week)
      const comparisonDate = new Date(targetDate);
      comparisonDate.setDate(comparisonDate.getDate() - 364);
      
      const weather = await getHistoricalWeather(
        comparisonDate.toISOString().split('T')[0],
        lat ? parseFloat(lat as string) : undefined,
        lon ? parseFloat(lon as string) : undefined
      );
      
      res.json(weather);
    } catch (error) {
      console.error("Error fetching historical weather:", error);
      res.status(500).json({ error: "Failed to fetch historical weather" });
    }
  });

  app.get("/api/weather/historical/formatted", async (req, res) => {
    try {
      const { date, lat, lon } = req.query;
      
      if (!date) {
        return res.status(400).json({ error: "Date parameter is required" });
      }
      
      const targetDate = new Date(date as string);
      // Use 52 weeks (364 days) before for year-over-year comparison (same day of week)
      const comparisonDate = new Date(targetDate);
      comparisonDate.setDate(comparisonDate.getDate() - 364);
      
      const weather = await getHistoricalWeather(
        comparisonDate.toISOString().split('T')[0],
        lat ? parseFloat(lat as string) : undefined,
        lon ? parseFloat(lon as string) : undefined
      );
      
      res.json({ weather: formatWeatherString(weather) });
    } catch (error) {
      console.error("Error fetching historical weather:", error);
      res.status(500).json({ error: "Failed to fetch historical weather" });
    }
  });

  // ==================
  // METRICS API
  // ==================
  /**
   * GET /api/metrics
   * Returns aggregated metrics for the Insights page
   * 
   * Query Parameters:
   * - clubId: Required - filters data to a specific club
   * - startDate: Required - start of date range (YYYY-MM-DD)
   * - endDate: Required - end of date range (YYYY-MM-DD)
   * 
   * Response: MetricsResponse object containing:
   * - summary: Aggregate stats (total days, sales, averages, to-do counts)
   * - dailySales: Array of daily sales for charting
   * - toDoStatus: Open vs completed to-do item counts
   * - topDays: Top 5 highest sales days with notes snippets
   * 
   * HOW TO ADD NEW METRICS:
   * 1. Add the new field to the appropriate interface in shared/schema.ts
   * 2. Compute the metric in this endpoint using the logs array
   * 3. Include it in the response object
   * 4. Update the Insights page component to display it
   */
  app.get("/api/metrics", async (req, res) => {
    try {
      const clubId = getClubId(req);
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ 
          error: "startDate and endDate query parameters are required" 
        });
      }

      const startDateStr = startDate as string;
      const endDateStr = endDate as string;

      // Fetch logs and to-do items for the date range
      const logs = await storage.getManagerLogsByDateRange(startDateStr, endDateStr, clubId);
      const toDoItems = await storage.getAllMaintenanceItems(clubId, {
        startDate: startDateStr,
        endDate: endDateStr
      });

      // Calculate summary metrics
      const daysWithLogs = logs.length;
      const totalSales = logs.reduce((sum, log) => {
        return sum + (parseFloat(log.totalSales || "0") || 0);
      }, 0);
      const averageDailySales = daysWithLogs > 0 ? totalSales / daysWithLogs : 0;
      
      // Count to-do items by status
      const openToDo = toDoItems.filter(item => item.status === "open").length;
      const completedToDo = toDoItems.filter(item => item.status === "completed").length;

      const summary: MetricsSummary = {
        daysWithLogs,
        totalSales: Math.round(totalSales * 100) / 100,
        averageDailySales: Math.round(averageDailySales * 100) / 100,
        openToDo,
        completedToDo
      };

      // Build daily sales array for chart (sorted by date ascending)
      // Includes category breakdown for detailed analysis
      const dailySales: DailySalesData[] = logs
        .map(log => ({
          date: log.logDate,
          totalSales: parseFloat(log.totalSales || "0") || 0,
          dayOfWeek: log.dayOfWeek,
          foodSales: parseFloat(log.foodSales || "0") || 0,
          barSales: parseFloat(log.barSales || "0") || 0,
          gamingSales: parseFloat(log.gamingSales || "0") || 0
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Calculate sales by category for pie/donut charts
      const salesByCategory: SalesByCategory = logs.reduce(
        (acc, log) => ({
          food: acc.food + (parseFloat(log.foodSales || "0") || 0),
          bar: acc.bar + (parseFloat(log.barSales || "0") || 0),
          gaming: acc.gaming + (parseFloat(log.gamingSales || "0") || 0),
          total: acc.total + (parseFloat(log.totalSales || "0") || 0)
        }),
        { food: 0, bar: 0, gaming: 0, total: 0 }
      );
      // Round to 2 decimal places
      salesByCategory.food = Math.round(salesByCategory.food * 100) / 100;
      salesByCategory.bar = Math.round(salesByCategory.bar * 100) / 100;
      salesByCategory.gaming = Math.round(salesByCategory.gaming * 100) / 100;
      salesByCategory.total = Math.round(salesByCategory.total * 100) / 100;

      // To-do status breakdown
      const toDoStatus: ToDoStatus = {
        open: openToDo,
        completed: completedToDo
      };

      // Top 5 days by sales (with notes snippets)
      const topDays: TopDayData[] = logs
        .filter(log => log.totalSales && parseFloat(log.totalSales) > 0)
        .sort((a, b) => (parseFloat(b.totalSales || "0") || 0) - (parseFloat(a.totalSales || "0") || 0))
        .slice(0, 5)
        .map(log => ({
          date: log.logDate,
          dayOfWeek: log.dayOfWeek,
          totalSales: parseFloat(log.totalSales || "0") || 0,
          narrativeSnippet: log.dailyNotes 
            ? log.dailyNotes.substring(0, 100) + (log.dailyNotes.length > 100 ? "..." : "")
            : "",
          logId: log.id
        }));

      const response: MetricsResponse = {
        summary,
        dailySales,
        toDoStatus,
        topDays,
        salesByCategory
      };

      res.json(response);
    } catch (error) {
      console.error("Error fetching metrics:", error);
      res.status(500).json({ error: "Failed to fetch metrics" });
    }
  });

  /**
   * GET /api/insights/maintenance
   * Returns detailed maintenance insights powered by:
   * - Running Maintenance Items (live table) for "Open Now / Oldest Open"
   * - Daily Maintenance Snapshots for trends + carryovers + "open over time"
   * 
   * Query Parameters:
   * - clubId: Required - filters data to a specific club
   * - start: Required - start of date range (ISO date)
   * - end: Required - end of date range (ISO date)
   */
  app.get("/api/insights/maintenance", async (req, res) => {
    try {
      const clubId = String(req.query.clubId || "");
      const start = String(req.query.start || "");
      const end = String(req.query.end || "");

      if (!clubId || !start || !end) {
        return res.status(400).json({ error: "clubId, start, end are required" });
      }

      const startDate = new Date(start);
      const endDate = new Date(end);

      // 1) OPEN NOW (live)
      const openNowRow = await db
        .select({ c: count() })
        .from(runningMaintenanceList)
        .where(
          and(
            eq(runningMaintenanceList.clubId, clubId),
            eq(runningMaintenanceList.status, "open")
          )
        );
      const openNow = Number(openNowRow?.[0]?.c ?? 0);

      // 2) COMPLETED IN RANGE (live, based on dateCompleted)
      const completedRow = await db
        .select({ c: count() })
        .from(runningMaintenanceList)
        .where(
          and(
            eq(runningMaintenanceList.clubId, clubId),
            sql`${runningMaintenanceList.dateCompleted} is not null`,
            gte(runningMaintenanceList.dateCompleted, startDate),
            lte(runningMaintenanceList.dateCompleted, endDate)
          )
        );
      const completedInRange = Number(completedRow?.[0]?.c ?? 0);

      // 3) AVG DAYS OPEN (for currently open items)
      const avgDaysOpenRow = await db
        .select({
          avgDays: sql<number>`avg(extract(epoch from (now() - ${runningMaintenanceList.dateAdded})) / 86400)`,
        })
        .from(runningMaintenanceList)
        .where(
          and(
            eq(runningMaintenanceList.clubId, clubId),
            eq(runningMaintenanceList.status, "open")
          )
        );
      const avgDaysOpen = Number(avgDaysOpenRow?.[0]?.avgDays ?? 0);

      // 4) DAILY OPEN COUNTS (snapshots grouped by log date)
      const dailyOpenCounts = await db
        .select({
          date: managerLogs.logDate,
          count: count(),
        })
        .from(runningMaintenanceSnapshots)
        .innerJoin(managerLogs, eq(managerLogs.id, runningMaintenanceSnapshots.logId))
        .where(
          and(
            eq(runningMaintenanceSnapshots.clubId, clubId),
            gte(managerLogs.logDate, start.split("T")[0]),
            lte(managerLogs.logDate, end.split("T")[0])
          )
        )
        .groupBy(managerLogs.logDate)
        .orderBy(managerLogs.logDate);

      // 5) DAILY COMPLETIONS (by dateCompleted date)
      const dailyCompletions = await db
        .select({
          date: sql<string>`date(${runningMaintenanceList.dateCompleted})`,
          count: count(),
        })
        .from(runningMaintenanceList)
        .where(
          and(
            eq(runningMaintenanceList.clubId, clubId),
            sql`${runningMaintenanceList.dateCompleted} is not null`,
            gte(runningMaintenanceList.dateCompleted, startDate),
            lte(runningMaintenanceList.dateCompleted, endDate)
          )
        )
        .groupBy(sql`date(${runningMaintenanceList.dateCompleted})`)
        .orderBy(sql`date(${runningMaintenanceList.dateCompleted})`);

      // 6) TOP OLDEST OPEN
      const oldestOpen = await db
        .select({
          id: runningMaintenanceList.id,
          title: runningMaintenanceList.title,
          dateAdded: runningMaintenanceList.dateAdded,
        })
        .from(runningMaintenanceList)
        .where(
          and(
            eq(runningMaintenanceList.clubId, clubId),
            eq(runningMaintenanceList.status, "open")
          )
        )
        .orderBy(asc(runningMaintenanceList.dateAdded))
        .limit(5);

      const topOldestOpen = oldestOpen.map((item) => ({
        id: item.id,
        title: item.title,
        daysOpen: Math.floor((Date.now() - new Date(item.dateAdded).getTime()) / 86400000),
      }));

      // 7) REPEATED CARRYOVERS (items that appear in snapshots multiple days in range)
      const repeated = await db
        .select({
          runningItemId: runningMaintenanceSnapshots.runningItemId,
          title: sql<string>`max(${runningMaintenanceSnapshots.title})`,
          daysAppeared: count(),
        })
        .from(runningMaintenanceSnapshots)
        .innerJoin(managerLogs, eq(managerLogs.id, runningMaintenanceSnapshots.logId))
        .where(
          and(
            eq(runningMaintenanceSnapshots.clubId, clubId),
            gte(managerLogs.logDate, start.split("T")[0]),
            lte(managerLogs.logDate, end.split("T")[0])
          )
        )
        .groupBy(runningMaintenanceSnapshots.runningItemId)
        .having(sql`count(*) > 1`)
        .orderBy(sql`count(*) desc`)
        .limit(10);

      return res.json({
        openNow,
        completedInRange,
        avgDaysOpen: Number.isFinite(avgDaysOpen) ? avgDaysOpen : 0,
        dailyOpenCounts: dailyOpenCounts.map(d => ({
          date: d.date,
          count: Number(d.count),
        })),
        dailyCompletions: dailyCompletions.map(d => ({
          date: d.date,
          count: Number(d.count),
        })),
        topOldestOpen,
        repeatedCarryovers: repeated.map((r) => ({
          id: r.runningItemId,
          title: r.title,
          daysAppeared: Number(r.daysAppeared),
        })),
      });
    } catch (error) {
      console.error("Error fetching maintenance insights:", error);
      res.status(500).json({ error: "Failed to load maintenance insights" });
    }
  });

  // ==========================================
  // EMAIL NOTIFICATION ENDPOINTS
  // ==========================================

  /**
   * GET /api/notifications/status
   * Check if email notifications are configured
   * Returns: { configured: boolean }
   */
  app.get("/api/notifications/status", (_req, res) => {
    res.json({ configured: isEmailConfigured() });
  });

  /**
   * GET /api/notifications/lists
   * Get notification lists for a club
   * Query: ?clubId=xxx
   * Returns: Array of notification lists with recipients
   * 
   * Note: In production, this would be provided by Social Club Pro.
   * For development, returns mock data.
   */
  app.get("/api/notifications/lists", async (req, res) => {
    const clubId = (req.query.clubId as string) || DEFAULT_CLUB_ID;
    
    await seedDefaultNotificationLists(clubId);
    
    const rows = await db
      .select({
        id: notificationLists.id,
        clubId: notificationLists.clubId,
        name: notificationLists.name,
        description: notificationLists.description,
        isDefault: notificationLists.isDefault,
        roleKey: notificationLists.roleKey,
        recipientCount: count(notificationRecipients.id),
      })
      .from(notificationLists)
      .leftJoin(
        notificationRecipients,
        eq(notificationRecipients.listId, notificationLists.id)
      )
      .where(eq(notificationLists.clubId, clubId))
      .groupBy(notificationLists.id);

    res.json(rows);
  });

  /**
   * POST /api/notifications/lists
   * Create a new notification list for a club
   */
  app.post("/api/notifications/lists", async (req, res) => {
    const { clubId, name, description, isDefault, roleKey } = req.body as {
      clubId?: string;
      name?: string;
      description?: string;
      isDefault?: boolean;
      roleKey?: string;
    };

    if (!clubId || !name) {
      return res.status(400).json({ error: "clubId and name required" });
    }

    // If setting as default, clear existing defaults for this club
    if (isDefault) {
      await db
        .update(notificationLists)
        .set({ isDefault: false })
        .where(eq(notificationLists.clubId, clubId));
    }

    const [inserted] = await db
      .insert(notificationLists)
      .values({
        clubId,
        name,
        description: description ?? null,
        isDefault: !!isDefault,
        roleKey: roleKey ?? null,
      })
      .returning();

    res.status(201).json(inserted);
  });

  /**
   * PATCH /api/notifications/lists/:id
   * Update an existing notification list
   */
  app.patch("/api/notifications/lists/:id", async (req, res) => {
    const id = Number(req.params.id);
    const { name, description, isDefault, clubId, roleKey } = req.body as {
      name?: string;
      description?: string;
      isDefault?: boolean;
      clubId: string;
      roleKey?: string | null;
    };

    if (!clubId) {
      return res.status(400).json({ error: "clubId required" });
    }

    // If setting as default, clear existing defaults for this club
    if (isDefault) {
      await db
        .update(notificationLists)
        .set({ isDefault: false })
        .where(eq(notificationLists.clubId, clubId));
    }

    const [updated] = await db
      .update(notificationLists)
      .set({
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(isDefault !== undefined ? { isDefault } : {}),
        ...(roleKey !== undefined ? { roleKey } : {}),
      })
      .where(
        and(
          eq(notificationLists.id, id),
          eq(notificationLists.clubId, clubId)
        )
      )
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "List not found" });
    }

    res.json(updated);
  });

  /**
   * DELETE /api/notifications/lists/:id
   * Delete a notification list (cascades to recipients)
   */
  app.delete("/api/notifications/lists/:id", async (req, res) => {
    const id = Number(req.params.id);
    await db
      .delete(notificationLists)
      .where(eq(notificationLists.id, id));
    res.json({ success: true });
  });

  /**
   * POST /api/notifications/lists/:id/recipients
   * Add a recipient to a notification list
   */
  app.post("/api/notifications/lists/:id/recipients", async (req, res) => {
    const listId = Number(req.params.id);
    const { name, email } = req.body as { name?: string; email: string };

    if (!email) {
      return res.status(400).json({ error: "email required" });
    }

    const [inserted] = await db
      .insert(notificationRecipients)
      .values({
        listId,
        name: name ?? null,
        email,
      })
      .returning();

    res.status(201).json(inserted);
  });

  /**
   * GET /api/notifications/lists/:id/recipients
   * Get all recipients for a notification list
   */
  app.get("/api/notifications/lists/:id/recipients", async (req, res) => {
    const listId = Number(req.params.id);
    
    const recipients = await db
      .select()
      .from(notificationRecipients)
      .where(eq(notificationRecipients.listId, listId));

    res.json(recipients);
  });

  /**
   * DELETE /api/notifications/recipients/:id
   * Delete a recipient from a notification list
   */
  app.delete("/api/notifications/recipients/:id", async (req, res) => {
    const id = Number(req.params.id);
    await db
      .delete(notificationRecipients)
      .where(eq(notificationRecipients.id, id));
    res.json({ success: true });
  });

  /**
   * GET /api/logs/:logId/notifications
   * Get notification history for a manager log
   * Returns: Array of recent notifications for this log
   */
  app.get("/api/logs/:logId/notifications", async (req, res) => {
    try {
      const logId = Number(req.params.logId);
      
      const notifications = await db
        .select({
          id: notificationLogs.id,
          reason: notificationLogs.reason,
          subject: notificationLogs.subject,
          createdAt: notificationLogs.createdAt,
          simulated: notificationLogs.simulated,
          recipients: notificationLogs.recipients,
        })
        .from(notificationLogs)
        .where(eq(notificationLogs.logId, logId))
        .orderBy(desc(notificationLogs.createdAt))
        .limit(5);

      // Add recipient count to each notification
      const result = notifications.map(n => ({
        ...n,
        recipientCount: (n.recipients as string[]).length,
      }));

      res.json(result);
    } catch (error) {
      console.error("Error fetching notification history:", error);
      res.status(500).json({ error: "Failed to fetch notification history" });
    }
  });

  /**
   * POST /api/logs/:logId/notify
   * Send a notification email for a manager log
   * Body: { 
   *   reason: string,           // e.g., "Urgent", "FYI", "Action Required"
   *   listIds: number[],        // Notification list IDs
   *   subject?: string,         // Custom subject line
   *   message?: string,         // Additional message
   *   clubId?: string           // Club ID for data isolation
   * }
   */
  app.post("/api/logs/:logId/notify", async (req, res) => {
    try {
      const logId = Number(req.params.logId);
      const schema = z.object({
        reason: z.string().default("Urgent"),
        listIds: z.array(z.number()).min(1),
        subject: z.string().optional(),
        message: z.string().optional(),
        clubId: z.string().default(DEFAULT_CLUB_ID)
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: parsed.error.issues 
        });
      }

      const { reason, listIds, subject, message, clubId } = parsed.data;

      // Fetch the log
      const log = await storage.getManagerLog(logId, clubId);
      if (!log) {
        return res.status(404).json({ error: "Log not found" });
      }

      // Fetch attachments for this log
      const attachments = await storage.getLogAttachmentsByLogId(logId, clubId);

      // Fetch lists from database
      const allLists = await getNotificationLists(clubId);
      const selectedLists = allLists.filter(l => listIds.includes(l.id));

      // Collect unique emails from selected lists
      const recipients = Array.from(
        new Set(
          selectedLists.flatMap(l => l.recipients.map(r => r.email))
        )
      );

      if (!recipients.length) {
        return res.status(400).json({ error: "No recipients configured for selected lists" });
      }

      // Build log URL
      const logUrl = `${req.protocol}://${req.get("host")}/logs/${log.id}`;

      // Build attachments HTML section
      let attachmentsHtml = "";
      if (attachments.length > 0) {
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const links = attachments
          .map(
            (a) =>
              `<li><a href="${baseUrl}${a.publicUrl}">${a.fileName}</a> (${Math.round(
                (a.fileSize || 0) / 1024
              )} KB)</li>`
          )
          .join("");

        attachmentsHtml = `
          <h4>Attachments</h4>
          <ul>${links}</ul>
        `;
      }

      // Build HTML body matching Social Club Pro pattern
      const htmlBody = `
        <p><strong>Reason:</strong> ${reason}</p>
        <p><strong>Date:</strong> ${log.logDate}</p>
        <p><strong>Manager:</strong> ${log.managerName || 'Not specified'}</p>
        <p><strong>Total Sales:</strong> $${log.totalSales || 0}</p>
        ${message ? `<p>${message.replace(/\n/g, '<br>')}</p>` : ''}
        ${attachmentsHtml}
        <hr />
        <p>View this entry in the Manager's Log: <a href="${logUrl}">${logUrl}</a></p>
      `;

      // Build subject if not provided
      const emailSubject = subject || `Urgent issue - ${reason}`;

      const smtpConfigured = isEmailConfigured();

      // Record notification in database (audit trail)
      await db.insert(notificationLogs).values({
        logId,
        clubId,
        reason,
        subject: emailSubject,
        message: message || '',
        listIds,
        recipients,
        simulated: !smtpConfigured,
      });

      if (smtpConfigured) {
        // Real send
        const result = await sendLogNotificationEmail(emailSubject, htmlBody, recipients);
        if (result.success) {
          res.json({ success: true, sentTo: recipients.length, simulated: false });
        } else {
          res.status(500).json({ success: false, error: result.message });
        }
      } else {
        // Simulate send - log to console
        console.log("[Notification simulate]", emailSubject, "→", recipients.join(", "));
        console.log("[Notification body]", htmlBody);
        res.json({ success: true, sentTo: recipients.length, simulated: true });
      }
    } catch (error) {
      console.error("Error sending notification:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  // ==================
  // ESCALATION RULES ENDPOINTS
  // ==================

  // Get escalation rules for a club
  app.get("/api/escalation-rules", async (req, res) => {
    try {
      const clubId = getClubId(req);
      const rules = await db
        .select()
        .from(escalationRules)
        .where(eq(escalationRules.clubId, clubId))
        .orderBy(desc(escalationRules.createdAt));

      // Get targets for each rule with list names
      const rulesWithTargets = await Promise.all(
        rules.map(async (rule) => {
          const targets = await db
            .select({ 
              listId: escalationRuleTargets.listId,
              listName: notificationLists.name,
            })
            .from(escalationRuleTargets)
            .innerJoin(notificationLists, eq(escalationRuleTargets.listId, notificationLists.id))
            .where(eq(escalationRuleTargets.ruleId, rule.id));
          return {
            ...rule,
            targetListIds: targets.map((t) => t.listId),
            targetLists: targets.map((t) => t.listName),
          };
        })
      );

      res.json(rulesWithTargets);
    } catch (error) {
      console.error("Error fetching escalation rules:", error);
      res.status(500).json({ error: "Failed to fetch escalation rules" });
    }
  });

  // Create escalation rule
  app.post("/api/escalation-rules", async (req, res) => {
    try {
      const {
        clubId,
        name,
        triggerType,
        triggerReason,
        metricKey,
        metricThreshold,
        flagKey,
        autoSend,
        enabled,
        presetKey,
        targetListIds,
      } = req.body;

      if (!clubId || !name || !triggerType) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const [rule] = await db
        .insert(escalationRules)
        .values({
          clubId,
          name,
          triggerType,
          triggerReason: triggerType === "reason" ? triggerReason : null,
          metricKey: triggerType === "metric" ? metricKey : null,
          metricThreshold: triggerType === "metric" ? metricThreshold : null,
          flagKey: triggerType === "flag" ? flagKey : null,
          autoSend: autoSend ?? false,
          enabled: enabled ?? true,
          presetKey: presetKey ?? null,
        })
        .returning();

      // Add targets
      if (targetListIds && targetListIds.length > 0) {
        await db.insert(escalationRuleTargets).values(
          targetListIds.map((listId: number) => ({
            ruleId: rule.id,
            listId,
          }))
        );
      }

      res.status(201).json(rule);
    } catch (error) {
      console.error("Error creating escalation rule:", error);
      res.status(500).json({ error: "Failed to create escalation rule" });
    }
  });

  // Update escalation rule
  app.patch("/api/escalation-rules/:id", async (req, res) => {
    try {
      const ruleId = Number(req.params.id);
      const { autoSend, enabled, name, metricThreshold, presetKey, targetListIds } = req.body;

      const updates: any = {};
      if (autoSend !== undefined) updates.autoSend = autoSend;
      if (enabled !== undefined) updates.enabled = enabled;
      if (name !== undefined) updates.name = name;
      if (metricThreshold !== undefined) updates.metricThreshold = metricThreshold;
      if (presetKey !== undefined) updates.presetKey = presetKey;

      if (Object.keys(updates).length > 0) {
        await db
          .update(escalationRules)
          .set(updates)
          .where(eq(escalationRules.id, ruleId));
      }

      // Update targets if provided
      if (targetListIds !== undefined) {
        await db
          .delete(escalationRuleTargets)
          .where(eq(escalationRuleTargets.ruleId, ruleId));
        if (targetListIds.length > 0) {
          await db.insert(escalationRuleTargets).values(
            targetListIds.map((listId: number) => ({
              ruleId,
              listId,
            }))
          );
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating escalation rule:", error);
      res.status(500).json({ error: "Failed to update escalation rule" });
    }
  });

  // Delete escalation rule
  app.delete("/api/escalation-rules/:id", async (req, res) => {
    try {
      const ruleId = Number(req.params.id);
      await db.delete(escalationRules).where(eq(escalationRules.id, ruleId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting escalation rule:", error);
      res.status(500).json({ error: "Failed to delete escalation rule" });
    }
  });

  // ==================
  // FILE ATTACHMENTS API
  // ==================

  // Upload file attachment with FormData
  app.post("/api/logs/:logId/attachments", upload.single("file"), async (req, res) => {
    try {
      const logId = Number(req.params.logId);
      const clubId = req.body.clubId || getClubId(req);

      if (isNaN(logId)) {
        return res.status(400).json({ error: "Invalid log ID" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = req.file;
      const storageKey = `/uploads/${file.filename}`;
      const publicUrl = storageKey;

      const attachment = await storage.createLogAttachment({
        clubId,
        logId,
        fileName: file.originalname,
        fileType: file.mimetype || "application/octet-stream",
        fileSize: file.size,
        storageKey,
        publicUrl,
      });

      res.status(201).json(attachment);
    } catch (error) {
      console.error("Error uploading attachment:", error);
      res.status(500).json({ error: "Failed to upload attachment" });
    }
  });

  // List attachments for a log
  app.get("/api/logs/:logId/attachments", async (req, res) => {
    try {
      const logId = Number(req.params.logId);
      const clubId = getClubId(req);

      if (isNaN(logId)) {
        return res.status(400).json({ error: "Invalid log ID" });
      }

      const attachments = await storage.getLogAttachmentsByLogId(logId, clubId);
      res.json(attachments);
    } catch (error) {
      console.error("Error fetching attachments:", error);
      res.status(500).json({ error: "Failed to fetch attachments" });
    }
  });

  // Delete attachment
  app.delete("/api/attachments/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const clubId = getClubId(req);

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid attachment ID" });
      }

      const attachment = await storage.getLogAttachment(id, clubId);
      if (!attachment) {
        return res.status(404).json({ error: "Attachment not found" });
      }

      // Delete file from disk
      const filePath = path.join(uploadDir, path.basename(attachment.storageKey));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Delete from database
      const deleted = await storage.deleteLogAttachment(id, clubId);
      if (!deleted) {
        return res.status(404).json({ error: "Attachment not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting attachment:", error);
      res.status(500).json({ error: "Failed to delete attachment" });
    }
  });

  // Serve uploaded files from disk
  app.get("/uploads/:filename", async (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join(uploadDir, filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
      }

      res.sendFile(filePath);
    } catch (error) {
      console.error("Error serving file:", error);
      res.status(500).json({ error: "Failed to serve file" });
    }
  });

  // ==================
  // NOTE PHOTOS API
  // ==================

  // Upload a photo for operational or maintenance notes
  app.post("/api/logs/:logId/note-photos", upload.single("file"), async (req, res) => {
    try {
      const logId = Number(req.params.logId);
      const clubId = getClubId(req);
      const noteType = req.body.noteType as string;

      if (isNaN(logId)) {
        return res.status(400).json({ error: "Invalid log ID" });
      }

      if (!noteType || !["operational", "maintenance"].includes(noteType)) {
        return res.status(400).json({ error: "noteType must be 'operational' or 'maintenance'" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Verify the log exists and belongs to this club
      const log = await storage.getManagerLog(logId, clubId);
      if (!log) {
        return res.status(404).json({ error: "Log not found" });
      }

      // Create the photo record
      const photo = await storage.createNotePhoto({
        clubId,
        logId,
        noteType: noteType as "operational" | "maintenance",
        url: `/uploads/${req.file.filename}`,
      });

      res.status(201).json(photo);
    } catch (error) {
      console.error("Error uploading note photo:", error);
      res.status(500).json({ error: "Failed to upload photo" });
    }
  });

  // List photos for a log (optionally filter by noteType)
  app.get("/api/logs/:logId/note-photos", async (req, res) => {
    try {
      const logId = Number(req.params.logId);
      const clubId = getClubId(req);
      const noteType = req.query.noteType as string | undefined;

      if (isNaN(logId)) {
        return res.status(400).json({ error: "Invalid log ID" });
      }

      if (noteType && !["operational", "maintenance"].includes(noteType)) {
        return res.status(400).json({ error: "noteType must be 'operational' or 'maintenance'" });
      }

      const photos = await storage.getNotePhotosByLogId(
        logId,
        clubId,
        noteType as "operational" | "maintenance" | undefined
      );
      res.json(photos);
    } catch (error) {
      console.error("Error fetching note photos:", error);
      res.status(500).json({ error: "Failed to fetch photos" });
    }
  });

  // Delete a note photo
  app.delete("/api/note-photos/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const clubId = getClubId(req);

      if (!id) {
        return res.status(400).json({ error: "Invalid photo ID" });
      }

      const deleted = await storage.deleteNotePhoto(id, clubId);
      if (!deleted) {
        return res.status(404).json({ error: "Photo not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting note photo:", error);
      res.status(500).json({ error: "Failed to delete photo" });
    }
  });

  // ==================
  // PREP CHECKLIST API
  // ==================

  // Get prep checklist items for a date
  app.get("/api/prep-checklist", async (req, res) => {
    try {
      const clubId = getClubId(req);
      const targetDate = req.query.targetDate as string;

      if (!targetDate) {
        return res.status(400).json({ error: "targetDate is required" });
      }

      const items = await storage.getPrepChecklistItemsByDate(targetDate, clubId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching prep checklist:", error);
      res.status(500).json({ error: "Failed to fetch prep checklist" });
    }
  });

  // Create prep checklist item
  app.post("/api/prep-checklist", async (req, res) => {
    try {
      const clubId = getClubId(req);
      const { description, targetDate, priority, assignedTo } = req.body;

      if (!description || !targetDate) {
        return res.status(400).json({ error: "description and targetDate are required" });
      }

      const item = await storage.createPrepChecklistItem({
        clubId,
        description,
        targetDate,
        originalDate: targetDate,
        priority: priority || "medium",
        assignedTo: assignedTo || null,
        status: "pending",
      });

      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating prep checklist item:", error);
      res.status(500).json({ error: "Failed to create prep checklist item" });
    }
  });

  // Update prep checklist item (toggle complete, edit, etc.)
  app.patch("/api/prep-checklist/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const clubId = getClubId(req);

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid item ID" });
      }

      // Only allow specific fields to be updated (prevent clubId, originalDate, etc. tampering)
      const allowedFields = ["description", "status", "priority", "assignedTo"];
      const updates: Record<string, any> = {};
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      // If completing, set completedAt and completedBy
      if (updates.status === "completed") {
        updates.completedAt = new Date();
        updates.completedBy = req.body.completedBy || "Manager";
      } else if (updates.status === "pending") {
        // If uncompleting, clear completion fields
        updates.completedAt = null;
        updates.completedBy = null;
      }

      const updated = await storage.updatePrepChecklistItem(id, updates, clubId);
      if (!updated) {
        return res.status(404).json({ error: "Item not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating prep checklist item:", error);
      res.status(500).json({ error: "Failed to update prep checklist item" });
    }
  });

  // Delete prep checklist item
  app.delete("/api/prep-checklist/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const clubId = getClubId(req);

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid item ID" });
      }

      const deleted = await storage.deletePrepChecklistItem(id, clubId);
      if (!deleted) {
        return res.status(404).json({ error: "Item not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting prep checklist item:", error);
      res.status(500).json({ error: "Failed to delete prep checklist item" });
    }
  });

  // Rollover uncompleted items to a new date
  app.post("/api/prep-checklist/rollover", async (req, res) => {
    try {
      const clubId = getClubId(req);
      const { fromDate, toDate } = req.body;

      if (!fromDate || !toDate) {
        return res.status(400).json({ error: "fromDate and toDate are required" });
      }

      const rolledOver = await storage.rolloverPrepChecklistItems(fromDate, toDate, clubId);
      res.json({ success: true, rolledOverCount: rolledOver });
    } catch (error) {
      console.error("Error rolling over prep checklist:", error);
      res.status(500).json({ error: "Failed to rollover prep checklist items" });
    }
  });

  // ========================================
  // RUNNING MAINTENANCE LIST ENDPOINTS
  // ========================================

  // GET /api/running-maintenance - Get all maintenance items (optionally filtered by status)
  app.get("/api/running-maintenance", async (req, res) => {
    try {
      const clubId = getClubId(req);
      const status = req.query.status as string | undefined;
      
      const items = await storage.getRunningMaintenanceItems(clubId, status);
      res.json(items);
    } catch (error) {
      console.error("Error fetching running maintenance items:", error);
      res.status(500).json({ error: "Failed to fetch maintenance items" });
    }
  });

  // POST /api/running-maintenance - Create a new maintenance item
  app.post("/api/running-maintenance", async (req, res) => {
    try {
      const clubId = getClubId(req);
      const { title, description, relatedLogDate, createdBy } = req.body;

      if (!title || title.trim() === "") {
        return res.status(400).json({ error: "Title is required" });
      }

      const item = await storage.createRunningMaintenanceItem({
        clubId,
        title: title.trim(),
        description: description?.trim() || null,
        relatedLogDate: relatedLogDate || null,
        createdBy: createdBy || null,
        status: "open",
      });

      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating running maintenance item:", error);
      res.status(500).json({ error: "Failed to create maintenance item" });
    }
  });

  // PATCH /api/running-maintenance/:id - Update a maintenance item (e.g., mark complete)
  app.patch("/api/running-maintenance/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const clubId = getClubId(req);
      const { status, title, description } = req.body;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid item ID" });
      }

      const updates: Record<string, any> = {};
      
      if (status !== undefined) {
        if (status !== "open" && status !== "completed") {
          return res.status(400).json({ error: "Status must be 'open' or 'completed'" });
        }
        updates.status = status;
        // Set dateCompleted when marking as completed
        if (status === "completed") {
          updates.dateCompleted = new Date();
        } else {
          updates.dateCompleted = null;
        }
      }
      
      if (title !== undefined) updates.title = title.trim();
      if (description !== undefined) updates.description = description?.trim() || null;

      const updated = await storage.updateRunningMaintenanceItem(id, clubId, updates);
      if (!updated) {
        return res.status(404).json({ error: "Maintenance item not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating running maintenance item:", error);
      res.status(500).json({ error: "Failed to update maintenance item" });
    }
  });

  // DELETE /api/running-maintenance/:id - Delete a maintenance item
  app.delete("/api/running-maintenance/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const clubId = getClubId(req);

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid item ID" });
      }

      const deleted = await storage.deleteRunningMaintenanceItem(id, clubId);
      if (!deleted) {
        return res.status(404).json({ error: "Maintenance item not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting running maintenance item:", error);
      res.status(500).json({ error: "Failed to delete maintenance item" });
    }
  });

  // POST /api/auth/verify-embed - Verify SSO embed signature (no auth required)
  // This endpoint verifies the signature from the embed URL and returns user data
  app.post("/api/auth/verify-embed", async (req, res) => {
    try {
      const params = req.body as EmbedParams;
      
      // Validate required fields are present
      const requiredFields = ['clubId', 'userId', 'userRole', 'clubName', 'firstName', 'lastName', 'membershipNumber', 'timestamp', 'signature'];
      const missingFields = requiredFields.filter(f => !params[f as keyof EmbedParams]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({ 
          error: "Missing required fields",
          missing: missingFields
        });
      }

      const secret = process.env.MANAGER_LOG_SECRET;
      
      // In development without secret, return params directly (bypass verification)
      if (process.env.NODE_ENV === "development" && !secret) {
        console.warn("[Auth] Development mode: Embed verification bypassed");
        return res.json({
          valid: true,
          user: {
            clubId: params.clubId,
            userId: params.userId,
            userRole: params.userRole,
            clubName: params.clubName,
            firstName: params.firstName,
            lastName: params.lastName,
            membershipNumber: params.membershipNumber,
            fullName: `${params.firstName} ${params.lastName}`.trim()
          }
        });
      }

      if (!secret) {
        return res.status(500).json({ error: "Server authentication not configured" });
      }

      const user = verifyEmbedSignature(params, secret);
      
      if (!user) {
        return res.status(401).json({ error: "Invalid or expired signature" });
      }

      res.json({ valid: true, user });
    } catch (error) {
      console.error("Error verifying embed signature:", error);
      res.status(500).json({ error: "Failed to verify embed signature" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
