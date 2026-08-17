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
import { insertManagerLogSchema, insertMaintenanceItemSchema, notificationLogs, managerLogs, notificationLists, notificationRecipients, logMaintenanceSnapshots, maintenanceItems, runningMaintenanceList, runningMaintenanceSnapshots, emailSettings, clubs } from "@shared/schema";
import OpenAI from "openai";
import { db } from "./db";
import { eq, desc, and, count, asc, gte, lte, gt, sql, or, isNull, isNotNull } from "drizzle-orm";
import type { MetricsResponse, MetricsSummary, DailySalesData, ToDoStatus, TopDayData, SalesByCategory } from "@shared/schema";
import { sendLogNotificationEmail, isEmailConfigured, logEmailConfigStatus } from "./email";
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

// Rate limiting for email notifications (per clubId)
// Max 10 emails per hour per club
const emailRateLimits = new Map<string, { count: number; resetTime: number }>();
const EMAIL_RATE_LIMIT = 10;
const EMAIL_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkEmailRateLimit(clubId: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const key = clubId;
  const record = emailRateLimits.get(key);

  if (!record || now > record.resetTime) {
    // Reset or initialize
    emailRateLimits.set(key, { count: 1, resetTime: now + EMAIL_RATE_WINDOW_MS });
    return { allowed: true, remaining: EMAIL_RATE_LIMIT - 1, resetIn: EMAIL_RATE_WINDOW_MS };
  }

  if (record.count >= EMAIL_RATE_LIMIT) {
    const resetIn = record.resetTime - now;
    return { allowed: false, remaining: 0, resetIn };
  }

  record.count++;
  return { allowed: true, remaining: EMAIL_RATE_LIMIT - record.count, resetIn: record.resetTime - now };
}

/**
 * Extracts clubId from request query params
 * Falls back to 'default' if not provided (for backwards compatibility)
 */
function getClubId(req: { query: { clubId?: string } }): string {
  return (req.query.clubId as string) || DEFAULT_CLUB_ID;
}

/**
 * Checks if a date string is too old to edit (more than 1 day in the past)
 * Allows editing today AND yesterday (grace window for restaurants)
 * @param dateStr - Date in YYYY-MM-DD format
 * @returns true if the date is more than 1 day before today
 */
function isPastDate(dateStr: string): boolean {
  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = dateStr.split("-").map(Number);
  const logDate = new Date(y, m - 1, d);
  const diffMs = todayOnly.getTime() - logDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return diffDays > 1;
}

/**
 * HISTORICAL COMPARISON HELPERS
 * =============================
 * These functions support year-over-year comparison by finding the same
 * weekday from last year and checking if historical data exists.
 */

/**
 * Gets the comparison date for year-over-year analysis.
 * Uses 364-day offset (52 weeks exactly) to ensure same weekday.
 * This matches the frontend logic in ManagerLogForm for consistency.
 * 
 * @param today - The reference date (typically today)
 * @returns Date string in YYYY-MM-DD format for comparison
 */
function getCompareDate(today: Date): string {
  // Use 364-day offset (52 weeks exactly) to ensure same weekday
  // This matches the frontend comparison logic
  const compareDate = new Date(today);
  compareDate.setDate(compareDate.getDate() - 364);
  
  // Format as YYYY-MM-DD
  const yyyy = compareDate.getFullYear();
  const mm = String(compareDate.getMonth() + 1).padStart(2, '0');
  const dd = String(compareDate.getDate()).padStart(2, '0');
  
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Checks if historical data exists for a given date and club.
 * Returns true if ANY data exists in the manager_logs table for that date.
 * 
 * @param compareDate - Date string in YYYY-MM-DD format
 * @param clubId - Club identifier for data isolation
 * @returns Promise<boolean> - true if historical data exists
 */
async function historicalDataExists(compareDate: string, clubId: string): Promise<boolean> {
  try {
    const result = await db
      .select({ count: count() })
      .from(managerLogs)
      .where(
        and(
          eq(managerLogs.logDate, compareDate),
          eq(managerLogs.clubId, clubId)
        )
      );
    
    return (result[0]?.count ?? 0) > 0;
  } catch (error) {
    // Fail gracefully if table doesn't exist yet
    console.error('Error checking historical data:', error);
    return false;
  }
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
 * @param logDate - Optional date string (YYYY-MM-DD) to determine historical open status.
 *                  When provided, captures items that were open *on that date*
 *                  (dateAdded <= logDate AND dateCompleted IS NULL OR dateCompleted > logDate).
 *                  When omitted, captures currently open items.
 */
async function snapshotRunningMaintenanceForLog(clubId: string, logId: number, logDate?: string) {
  try {
    // 1) Clear any existing snapshots for that log (idempotent)
    await db.delete(runningMaintenanceSnapshots).where(
      and(
        eq(runningMaintenanceSnapshots.clubId, clubId),
        eq(runningMaintenanceSnapshots.logId, logId)
      )
    );

    let openItems;
    let referenceTime: number;

    if (logDate) {
      // Historical: find items that were open at end-of-day on logDate.
      // Use an explicit UTC end-of-day so the boundary is deterministic regardless
      // of the server's local timezone (logDate is always a YYYY-MM-DD date string).
      const logDateEnd = new Date(logDate + "T23:59:59.999Z");
      referenceTime = logDateEnd.getTime();

      openItems = await db
        .select()
        .from(runningMaintenanceList)
        .where(
          and(
            eq(runningMaintenanceList.clubId, clubId),
            lte(runningMaintenanceList.dateAdded, logDateEnd),
            or(
              isNull(runningMaintenanceList.dateCompleted),
              gt(runningMaintenanceList.dateCompleted, logDateEnd)
            )
          )
        )
        .orderBy(asc(runningMaintenanceList.dateAdded));
    } else {
      // Current: find items currently marked as open
      referenceTime = Date.now();

      openItems = await db
        .select()
        .from(runningMaintenanceList)
        .where(
          and(
            eq(runningMaintenanceList.clubId, clubId),
            eq(runningMaintenanceList.status, "open")
          )
        )
        .orderBy(asc(runningMaintenanceList.dateAdded));
    }

    // 2) Insert snapshots
    if (openItems.length > 0) {
      await db.insert(runningMaintenanceSnapshots).values(
        openItems.map((item) => ({
          clubId,
          logId,
          runningItemId: item.id,
          title: item.title,
          description: item.description ?? null,
          status: "open",
          daysOpen: Math.max(1, Math.floor((referenceTime - new Date(item.dateAdded).getTime()) / 86400000)),
        }))
      );
    }

    console.log(`Captured running maintenance snapshot for log ${logId}: ${openItems.length} items`);
  } catch (error) {
    console.error("Error capturing running maintenance snapshot:", error);
  }
}

/**
 * Backfills running maintenance snapshots for all logs that don't yet have one.
 * Uses each log's date to determine which items were open at that point in time.
 * Safe to run multiple times (idempotent per log).
 */
async function backfillRunningMaintenanceSnapshots() {
  try {
    // Find all logs that have no running maintenance snapshots
    const logsWithoutSnapshots = await db
      .select({
        id: managerLogs.id,
        clubId: managerLogs.clubId,
        logDate: managerLogs.logDate,
      })
      .from(managerLogs)
      .leftJoin(
        runningMaintenanceSnapshots,
        eq(runningMaintenanceSnapshots.logId, managerLogs.id)
      )
      .where(isNull(runningMaintenanceSnapshots.logId))
      .orderBy(managerLogs.logDate);

    if (logsWithoutSnapshots.length === 0) {
      console.log("Backfill: All logs already have running maintenance snapshots.");
      return;
    }

    console.log(`Backfill: Found ${logsWithoutSnapshots.length} log(s) without running maintenance snapshots. Backfilling...`);

    for (const log of logsWithoutSnapshots) {
      await snapshotRunningMaintenanceForLog(log.clubId, log.id, log.logDate);
    }

    console.log(`Backfill: Completed running maintenance snapshot backfill for ${logsWithoutSnapshots.length} log(s).`);
  } catch (error) {
    console.error("Error during running maintenance snapshot backfill:", error);
  }
}

/**
 * Re-snapshots all manager logs for a club logged on or after `fromDate` (YYYY-MM-DD).
 * Called when a running maintenance item's status changes so existing snapshots reflect
 * whether the item was open or closed at each log's date.
 * Safe to run multiple times (each call deletes then rebuilds snapshots for each log).
 */
async function reSnapshotLogsFromDate(clubId: string, fromDate: string) {
  try {
    const affectedLogs = await db
      .select({
        id: managerLogs.id,
        clubId: managerLogs.clubId,
        logDate: managerLogs.logDate,
      })
      .from(managerLogs)
      .where(
        and(
          eq(managerLogs.clubId, clubId),
          gte(managerLogs.logDate, fromDate)
        )
      )
      .orderBy(managerLogs.logDate);

    if (affectedLogs.length === 0) return;

    console.log(`Re-snapshotting ${affectedLogs.length} log(s) from ${fromDate} for club ${clubId} after maintenance item edit`);
    for (const log of affectedLogs) {
      await snapshotRunningMaintenanceForLog(log.clubId, log.id, log.logDate);
    }
    console.log(`Re-snapshot complete: ${affectedLogs.length} log(s) updated.`);
  } catch (error) {
    console.error("Error re-snapshotting logs after maintenance item edit:", error);
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
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&daily=temperature_2m_max,relative_humidity_2m_mean,wind_speed_10m_max,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph`;
    
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
  // Log email configuration status at startup
  logEmailConfigStatus();
  
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
   * GET /api/drawing-numbers
   * Proxies the Drawings app to fetch daily/weekly drawing numbers for a club+date.
   * The shared secret (DRAWING_API_SECRET) stays server-side and is never exposed to clients.
   * Always fails safe: any upstream problem returns found:false rather than another club's data.
   * @query date - The log date in YYYY-MM-DD format
   * @query clubId - The club identifier (resolved to the club name for the Drawings app)
   */
  app.get("/api/drawing-numbers", async (req, res) => {
    const empty = { found: false, daily: null, weekly: null };
    try {
      const clubId = getClubId(req);
      const date = (req.query.date as string) || "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "date query param must be yyyy-mm-dd" });
      }

      const secret = process.env.DRAWING_APP_SECRET || process.env.DRAWING_API_SECRET;
      if (!secret) {
        // Integration not configured yet — degrade gracefully
        return res.json(empty);
      }

      const [club] = await db
        .select()
        .from(clubs)
        .where(eq(clubs.id, clubId))
        .limit(1);
      if (!club) {
        return res.json(empty);
      }

      const baseUrl = (process.env.DRAWINGS_API_URL || "https://draw.socialclubpro.com").replace(/\/$/, "");
      const url = `${baseUrl}/api/drawing-numbers?club=${encodeURIComponent(club.name)}&date=${encodeURIComponent(date)}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let upstream: Response;
      try {
        upstream = await fetch(url, {
          headers: { Authorization: `Bearer ${secret}` },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!upstream.ok) {
        // 404 (no numbers for this club/date), 401, or anything else — never surface wrong data
        return res.json(empty);
      }

      const data = await upstream.json().catch(() => null);
      // Fail closed: the upstream MUST echo a non-empty club matching what we asked for
      // (normalized), otherwise we cannot trust which club the numbers belong to.
      const normalize = (s: unknown) => (typeof s === "string" ? s.trim().toLowerCase() : "");
      const toNum = (v: unknown): number | null => {
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
        return null;
      };
      if (
        !data || typeof data !== "object" ||
        typeof data.club !== "string" || data.club.trim() === "" ||
        normalize(data.club) !== normalize(club.name)
      ) {
        console.warn(`[drawing-numbers] invalid or mismatched club echo: asked "${club.name}", got ${JSON.stringify(data?.club ?? null)}`);
        return res.json(empty);
      }

      return res.json({
        found: true,
        daily: toNum(data.daily),
        weekly: toNum(data.weekly),
      });
    } catch (error) {
      console.error("Error fetching drawing numbers:", error);
      return res.json(empty);
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
   * POST /api/manager-logs/historical
   * Creates or updates a historical log entry for comparison/insights purposes.
   * This endpoint bypasses the "past logs are read-only" constraint specifically
   * for populating historical data needed for comparison visualizations.
   * Requires clubId in the request body.
   */
  app.post("/api/manager-logs/historical", async (req, res) => {
    try {
      const validatedData = insertManagerLogSchema.parse(req.body);
      
      const log = await storage.upsertManagerLog(validatedData);
      
      // Capture maintenance snapshot for this log, using logDate for historical accuracy
      await captureMaintenanceSnapshot(log.id, validatedData.clubId);
      await snapshotRunningMaintenanceForLog(validatedData.clubId, log.id, validatedData.logDate ?? undefined);
      
      res.status(201).json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: error.errors 
        });
      }
      console.error("Error creating/updating historical log:", error);
      res.status(500).json({ error: "Failed to save historical manager log" });
    }
  });

  /**
   * POST /api/manager-logs/bulk-historical
   * Bulk imports multiple historical log entries at once.
   * Accepts an array of entries in the request body.
   */
  app.post("/api/manager-logs/bulk-historical", async (req, res) => {
    try {
      const { entries } = req.body;
      
      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ 
          error: "Request must include an 'entries' array with at least one entry" 
        });
      }

      if (entries.length > 2000) {
        return res.status(400).json({ 
          error: "Maximum 2000 entries per bulk import" 
        });
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        try {
          const validatedData = insertManagerLogSchema.parse(entry);
          const log = await storage.upsertManagerLog(validatedData);
          
          // Capture maintenance snapshot for this log, using logDate for historical accuracy
          await captureMaintenanceSnapshot(log.id, validatedData.clubId);
          await snapshotRunningMaintenanceForLog(validatedData.clubId, log.id, validatedData.logDate ?? undefined);
          
          results.success++;
        } catch (error) {
          results.failed++;
          if (error instanceof z.ZodError) {
            results.errors.push(`Row ${i + 1} (${entry.logDate || 'unknown date'}): ${error.errors.map(e => e.message).join(', ')}`);
          } else {
            results.errors.push(`Row ${i + 1} (${entry.logDate || 'unknown date'}): Failed to save`);
          }
        }
      }

      res.status(200).json(results);
    } catch (error) {
      console.error("Error in bulk historical import:", error);
      res.status(500).json({ error: "Failed to process bulk import" });
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
   * DELETE /api/manager-logs/bulk
   * Deletes multiple log entries by ID, scoped to the club.
   * Must be registered BEFORE /:id to avoid Express matching "bulk" as an ID.
   * @body ids - Array of log IDs to delete
   */
  app.delete("/api/manager-logs/bulk", async (req, res) => {
    try {
      const clubId = getClubId(req);
      const { ids } = req.body as { ids: unknown };
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids must be a non-empty array" });
      }
      const numericIds = ids.map(Number).filter((n) => !isNaN(n) && n > 0);
      if (numericIds.length === 0) {
        return res.status(400).json({ error: "No valid IDs provided" });
      }
      const deleted = await storage.bulkDeleteManagerLogs(numericIds, clubId);
      res.json({ deleted });
    } catch (error) {
      console.error("Error bulk deleting manager logs:", error);
      res.status(500).json({ error: "Failed to bulk delete manager logs" });
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
   * Creates a new maintenance item linked to a log entry (with optional photo upload).
   */
  app.post("/api/maintenance-items", upload.single("photo"), async (req, res) => {
    try {
      // Handle photo upload
      let photoUrl: string | null = null;
      if (req.file) {
        photoUrl = `/uploads/${req.file.filename}`;
      }

      const validatedData = insertMaintenanceItemSchema.parse({
        ...req.body,
        photoUrl,
      });
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
   * Retrieves maintenance items for the Running Maintenance List.
   * Shows all open items + only items completed on the given date.
   * @query clubId - The club identifier (required)
   * @query date - The selected date (YYYY-MM-DD) to filter completed items (defaults to today)
   */
  app.get("/api/maintenance/open", async (req, res) => {
    try {
      const clubId = getClubId(req);
      if (!clubId) {
        return res.status(400).json({ error: "clubId is required" });
      }

      // Default to today's date if not provided (backwards compatibility)
      const selectedDate = (req.query.date as string) || new Date().toISOString().slice(0, 10);

      const { maintenanceItems } = await import("@shared/schema");
      
      // Filter: show all open items (resolvedAt is null) OR items completed on selectedDate
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
          resolvedAt: maintenanceItems.resolvedAt,
        })
        .from(maintenanceItems)
        .innerJoin(
          managerLogs,
          eq(maintenanceItems.managerLogId, managerLogs.id)
        )
        .where(
          and(
            eq(managerLogs.clubId, clubId),
            or(
              // Open items (never completed) always show
              isNull(maintenanceItems.resolvedAt),
              // Completed items only if resolvedAt is on selectedDate
              and(
                isNotNull(maintenanceItems.resolvedAt),
                sql`${maintenanceItems.resolvedAt}::date = ${selectedDate}::date`
              )
            )
          )
        )
        .orderBy(
          // Open items first, then completed-on-date
          sql`CASE WHEN ${maintenanceItems.resolvedAt} IS NULL THEN 0 ELSE 1 END`,
          maintenanceItems.createdAt
        );

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

  const geocodeCache = new Map<string, { lat: number; lon: number }>();

  /**
   * Resolves weather coordinates for a club from its stored weatherZipCode.
   * Zip code is the sole location source — no lat/lon fallback.
   * Returns null when no zip is configured; callers must return 422.
   */
  async function resolveWeatherCoords(
    clubId: string
  ): Promise<{ lat: number; lon: number } | null> {
    try {
      const [club] = await db
        .select({ weatherZipCode: clubs.weatherZipCode })
        .from(clubs)
        .where(eq(clubs.id, clubId))
        .limit(1);

      const zip = club?.weatherZipCode?.trim();
      if (!zip) return null;

      const cacheKey = `zip|${zip}`.toLowerCase();
      const cached = geocodeCache.get(cacheKey);
      if (cached) return cached;

      const url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zip)}&format=json&limit=1`;
      const response = await fetch(url, { headers: { "User-Agent": "ManagerLog/1.0" } });
      if (response.ok) {
        const results = await response.json() as Array<{ lat: string; lon: string }>;
        if (results && results.length > 0) {
          const coords = { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
          geocodeCache.set(cacheKey, coords);
          return coords;
        }
      }
    } catch (err) {
      console.warn("Failed to resolve weather coords from zip:", err);
    }

    // No zip configured or geocoding failed — caller must return 422
    return null;
  }

  app.get("/api/weather/geocode", async (req, res) => {
    try {
      const { city, province, country, zip } = req.query;

      if (!city && !zip) {
        return res.status(400).json({ error: "Either city or zip parameter is required" });
      }

      let cacheKey: string;
      let url: string;

      if (zip) {
        cacheKey = `zip|${zip}`.toLowerCase();
        const cached = geocodeCache.get(cacheKey);
        if (cached) return res.json(cached);
        url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zip as string)}&format=json&limit=1`;
      } else {
        cacheKey = `${city}|${province || ""}|${country || ""}`.toLowerCase();
        const cached = geocodeCache.get(cacheKey);
        if (cached) return res.json(cached);
        const queryParts = [city as string];
        if (province) queryParts.push(province as string);
        if (country) queryParts.push(country as string);
        url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryParts.join(", "))}&format=json&limit=1`;
      }

      const response = await fetch(url, {
        headers: { "User-Agent": "ManagerLog/1.0" },
      });

      if (!response.ok) {
        throw new Error(`Geocoding API request failed: ${response.status}`);
      }

      const results = await response.json() as Array<{ lat: string; lon: string }>;
      if (!results || results.length === 0) {
        return res.status(404).json({ error: "Location not found" });
      }

      const coords = {
        lat: parseFloat(results[0].lat),
        lon: parseFloat(results[0].lon),
      };

      geocodeCache.set(cacheKey, coords);
      res.json(coords);
    } catch (error) {
      console.error("Error geocoding address:", error);
      res.status(500).json({ error: "Failed to geocode address" });
    }
  });

  app.get("/api/weather/current", async (req, res) => {
    try {
      const { clubId: qClubId } = req.query;
      const clubId = qClubId as string;
      if (!clubId) return res.status(400).json({ error: "clubId is required" });
      const coords = await resolveWeatherCoords(clubId);
      if (!coords) {
        return res.status(422).json({ error: "No weather location configured for this club. Please set a zip code in settings." });
      }
      const weather = await getCurrentWeather(coords.lat, coords.lon);
      res.json(weather);
    } catch (error) {
      console.error("Error fetching current weather:", error);
      res.status(500).json({ error: "Failed to fetch current weather" });
    }
  });

  app.get("/api/weather/current/formatted", async (req, res) => {
    try {
      const { clubId: qClubId } = req.query;
      const clubId = qClubId as string;
      if (!clubId) return res.status(400).json({ error: "clubId is required" });
      const coords = await resolveWeatherCoords(clubId);
      if (!coords) {
        return res.status(422).json({ error: "No weather location configured for this club. Please set a zip code in settings." });
      }
      const weather = await getCurrentWeather(coords.lat, coords.lon);
      res.json({ weather: formatWeatherString(weather) });
    } catch (error) {
      console.error("Error fetching current weather:", error);
      res.status(500).json({ error: "Failed to fetch current weather" });
    }
  });

  app.get("/api/weather/historical", async (req, res) => {
    try {
      const { date, clubId: qClubId } = req.query;
      
      if (!date) {
        return res.status(400).json({ error: "Date parameter is required" });
      }
      
      const clubId = qClubId as string;
      if (!clubId) return res.status(400).json({ error: "clubId is required" });
      const coords = await resolveWeatherCoords(clubId);
      if (!coords) {
        return res.status(422).json({ error: "No weather location configured for this club. Please set a zip code in settings." });
      }

      const targetDate = new Date(date as string);
      // Use 52 weeks (364 days) before for year-over-year comparison (same day of week)
      const comparisonDate = new Date(targetDate);
      comparisonDate.setDate(comparisonDate.getDate() - 364);
      
      const weather = await getHistoricalWeather(
        comparisonDate.toISOString().split('T')[0],
        coords.lat,
        coords.lon
      );
      
      res.json(weather);
    } catch (error) {
      console.error("Error fetching historical weather:", error);
      res.status(500).json({ error: "Failed to fetch historical weather" });
    }
  });

  app.get("/api/weather/historical/formatted", async (req, res) => {
    try {
      const { date, clubId: qClubId } = req.query;
      
      if (!date) {
        return res.status(400).json({ error: "Date parameter is required" });
      }

      const clubId = qClubId as string;
      if (!clubId) return res.status(400).json({ error: "clubId is required" });
      const coords = await resolveWeatherCoords(clubId);
      if (!coords) {
        return res.status(422).json({ error: "No weather location configured for this club. Please set a zip code in settings." });
      }

      const targetDate = new Date(date as string);
      // Use 52 weeks (364 days) before for year-over-year comparison (same day of week)
      const comparisonDate = new Date(targetDate);
      comparisonDate.setDate(comparisonDate.getDate() - 364);
      
      const weather = await getHistoricalWeather(
        comparisonDate.toISOString().split('T')[0],
        coords.lat,
        coords.lon
      );
      
      res.json({ weather: formatWeatherString(weather) });
    } catch (error) {
      console.error("Error fetching historical weather:", error);
      res.status(500).json({ error: "Failed to fetch historical weather" });
    }
  });

  // ==================
  // HISTORICAL COMPARISON STATUS
  // ==================
  /**
   * GET /api/historical-status
   * Returns information about historical data availability for year-over-year comparison.
   * 
   * Query Parameters:
   * - clubId: Required - filters data to a specific club
   * - date: Optional - the reference date (defaults to today)
   * 
   * Response:
   * - today: The reference date (YYYY-MM-DD)
   * - compareDate: The comparison date from last year (same weekday)
   * - hasHistoricalData: Whether a log entry exists for the compare date
   * - compareDayOfWeek: Human-readable day name for comparison date
   */
  app.get("/api/historical-status", async (req, res) => {
    try {
      const clubId = getClubId(req);
      const { date } = req.query;
      
      // Parse date safely - handle YYYY-MM-DD format explicitly to avoid timezone issues
      let referenceDate: Date;
      if (date && typeof date === 'string') {
        const [year, month, day] = date.split('-').map(Number);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          referenceDate = new Date(year, month - 1, day);
        } else {
          referenceDate = new Date();
        }
      } else {
        referenceDate = new Date();
      }
      
      // Validate the date is valid
      if (isNaN(referenceDate.getTime())) {
        referenceDate = new Date();
      }
      
      // Get the comparison date (same weekday last year)
      const compareDate = getCompareDate(referenceDate);
      
      // Check if historical data exists
      const hasHistoricalData = await historicalDataExists(compareDate, clubId);
      
      // Get day of week name for display
      const [cYear, cMonth, cDay] = compareDate.split('-').map(Number);
      const compareDateObj = new Date(cYear, cMonth - 1, cDay);
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const compareDayOfWeek = dayNames[compareDateObj.getDay()];
      
      // Format today's date as YYYY-MM-DD
      const yyyy = referenceDate.getFullYear();
      const mm = String(referenceDate.getMonth() + 1).padStart(2, '0');
      const dd = String(referenceDate.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;
      
      // Debug logging in development
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Historical Status Debug]', {
          today: todayStr,
          compareDate,
          compareDayOfWeek,
          clubId,
          hasHistoricalData
        });
      }
      
      res.json({
        today: todayStr,
        compareDate,
        compareDayOfWeek,
        hasHistoricalData
      });
    } catch (error) {
      console.error("Error fetching historical status:", error);
      res.status(500).json({ error: "Failed to fetch historical status" });
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

      // Fetch logs for the date range
      const logs = await storage.getManagerLogsByDateRange(startDateStr, endDateStr, clubId);
      
      // Query running_maintenance_list for accurate counts (this is what managers use daily)
      // Items are considered "open" if status = 'open'
      const openToDoRow = await db
        .select({ c: count() })
        .from(runningMaintenanceList)
        .where(
          and(
            eq(runningMaintenanceList.clubId, clubId),
            eq(runningMaintenanceList.status, "open")
          )
        );
      const openToDo = Number(openToDoRow?.[0]?.c ?? 0);
      
      // Count items completed within the date range (based on dateCompleted)
      const startDateObj = new Date(startDateStr);
      const endDateObj = new Date(endDateStr);
      endDateObj.setHours(23, 59, 59, 999); // Include the full end day
      
      const completedToDoRow = await db
        .select({ c: count() })
        .from(runningMaintenanceList)
        .where(
          and(
            eq(runningMaintenanceList.clubId, clubId),
            eq(runningMaintenanceList.status, "completed"),
            isNotNull(runningMaintenanceList.dateCompleted),
            gte(runningMaintenanceList.dateCompleted, startDateObj),
            lte(runningMaintenanceList.dateCompleted, endDateObj)
          )
        );
      const completedToDo = Number(completedToDoRow?.[0]?.c ?? 0);

      // Calculate summary metrics
      const daysWithLogs = logs.length;
      const totalSales = logs.reduce((sum, log) => {
        return sum + (parseFloat(log.totalSales || "0") || 0);
      }, 0);
      const averageDailySales = daysWithLogs > 0 ? totalSales / daysWithLogs : 0;

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

      // Count total manager logs + oldest/newest dates for this club (not date-filtered)
      // Used by the frontend to show a contextual hint when no logs match the date range
      const totalLogsRow = await db
        .select({ c: count() })
        .from(managerLogs)
        .where(eq(managerLogs.clubId, clubId));
      const totalLogsInDb = Number(totalLogsRow?.[0]?.c ?? 0);

      // Fetch oldest and newest log dates so the frontend can navigate to "all available data"
      let oldestLogDate: string | undefined;
      let newestLogDate: string | undefined;
      if (totalLogsInDb > 0) {
        const dateRangeRow = await db
          .select({
            oldest: sql<string>`min(${managerLogs.logDate})`,
            newest: sql<string>`max(${managerLogs.logDate})`,
          })
          .from(managerLogs)
          .where(eq(managerLogs.clubId, clubId));
        oldestLogDate = dateRangeRow?.[0]?.oldest ?? undefined;
        newestLogDate = dateRangeRow?.[0]?.newest ?? undefined;
      }

      const response: MetricsResponse = {
        summary,
        dailySales,
        toDoStatus,
        topDays,
        salesByCategory,
        totalLogsInDb,
        oldestLogDate,
        newestLogDate,
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
      // Make end date inclusive: set to 23:59:59.999 of the end day
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);

      // 1) OPEN AT END OF PERIOD — items that existed by endDate and were not completed before endDate
      // This makes the metric meaningful for comparison: count items open at the end of each period.
      // For the primary period (endDate = today), this equals the current open count.
      // For past comparison periods, this returns the historical open count at that point in time.
      const openNowRow = await db
        .select({ c: count() })
        .from(runningMaintenanceList)
        .where(
          and(
            eq(runningMaintenanceList.clubId, clubId),
            lte(runningMaintenanceList.dateAdded, endDate),
            or(
              isNull(runningMaintenanceList.dateCompleted),
              gt(runningMaintenanceList.dateCompleted, endDate)
            )
          )
        );
      const openNow = Number(openNowRow?.[0]?.c ?? 0);

      // 2) COMPLETED IN RANGE (based on dateCompleted timestamp)
      const completedRow = await db
        .select({ c: count() })
        .from(runningMaintenanceList)
        .where(
          and(
            eq(runningMaintenanceList.clubId, clubId),
            eq(runningMaintenanceList.status, "completed"),
            isNotNull(runningMaintenanceList.dateCompleted),
            gte(runningMaintenanceList.dateCompleted, startDate),
            lte(runningMaintenanceList.dateCompleted, endDate)
          )
        );
      const completedInRange = Number(completedRow?.[0]?.c ?? 0);

      // 3) AVG DAYS OPEN (for currently open items in running_maintenance_list)
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
          itemNames: sql<string[]>`array_agg(${runningMaintenanceSnapshots.title} ORDER BY ${runningMaintenanceSnapshots.title})`,
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

      // 5) DAILY COMPLETIONS (by dateCompleted date from running_maintenance_list)
      const dailyCompletions = await db
        .select({
          date: sql<string>`date(${runningMaintenanceList.dateCompleted})`,
          count: count(),
        })
        .from(runningMaintenanceList)
        .where(
          and(
            eq(runningMaintenanceList.clubId, clubId),
            eq(runningMaintenanceList.status, "completed"),
            isNotNull(runningMaintenanceList.dateCompleted),
            gte(runningMaintenanceList.dateCompleted, startDate),
            lte(runningMaintenanceList.dateCompleted, endDate)
          )
        )
        .groupBy(sql`date(${runningMaintenanceList.dateCompleted})`)
        .orderBy(sql`date(${runningMaintenanceList.dateCompleted})`);

      // 6) TOP OLDEST OPEN (from running_maintenance_list)
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
        daysOpen: Math.max(1, Math.floor((Date.now() - new Date(item.dateAdded).getTime()) / 86400000)),
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
          itemNames: d.itemNames ?? [],
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
  // EMAIL SETTINGS ENDPOINTS
  // ==========================================

  /**
   * GET /api/email-settings
   * Get email content settings for a club
   * Query: ?clubId=xxx
   * Returns: EmailSettings object with toggle values
   */
  app.get("/api/email-settings", async (req, res) => {
    const clubId = (req.query.clubId as string) || DEFAULT_CLUB_ID;

    const row = await db
      .select()
      .from(emailSettings)
      .where(eq(emailSettings.clubId, clubId))
      .limit(1);

    if (row.length === 0) {
      // Return defaults if not yet created
      return res.json({
        clubId,
        includeOperationalNotes: true,
        includeMaintenanceNotes: true,
        includeMaintenanceList: true,
        listDefaults: {},
      });
    }

    res.json({
      clubId,
      includeOperationalNotes: row[0].includeOperationalNotes,
      includeMaintenanceNotes: row[0].includeMaintenanceNotes,
      includeMaintenanceList: row[0].includeMaintenanceList,
      listDefaults: row[0].listDefaults || {},
    });
  });

  /**
   * PUT /api/email-settings
   * Update email content settings for a club
   * Body: { clubId, includeOperationalNotes, includeMaintenanceNotes, includeMaintenanceList, listDefaults }
   */
  app.put("/api/email-settings", async (req, res) => {
    const {
      clubId,
      includeOperationalNotes,
      includeMaintenanceNotes,
      includeMaintenanceList,
      listDefaults,
    } = req.body || {};

    if (!clubId) {
      return res.status(400).json({ error: "clubId required" });
    }

    // Upsert: insert or update on conflict
    // Deprecated fields are set to their fixed values (header/sales/drawing always true, weather/photos managed via notes)
    await db
      .insert(emailSettings)
      .values({
        clubId,
        includeHeader: true,
        includeWeather: false,
        includeSales: true,
        includeDrawing: true,
        includeOperationalNotes: includeOperationalNotes ?? true,
        includeMaintenanceNotes: includeMaintenanceNotes ?? true,
        includeMaintenanceList: includeMaintenanceList ?? true,
        includePhotos: true,
        listDefaults: listDefaults || {},
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: emailSettings.clubId,
        set: {
          includeHeader: true,
          includeWeather: false,
          includeSales: true,
          includeDrawing: true,
          includeOperationalNotes: includeOperationalNotes ?? true,
          includeMaintenanceNotes: includeMaintenanceNotes ?? true,
          includeMaintenanceList: includeMaintenanceList ?? true,
          includePhotos: true,
          listDefaults: listDefaults || {},
          updatedAt: new Date(),
        },
      });

    res.json({ ok: true });
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
   *   clubId?: string,          // Club ID for data isolation
   *   contentSettings?: object  // Optional toggles for email sections
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
        clubId: z.string().default(DEFAULT_CLUB_ID),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: parsed.error.issues 
        });
      }

      const { reason, listIds, subject, message, clubId } = parsed.data;

      // Check rate limit
      const rateLimit = checkEmailRateLimit(clubId);
      if (!rateLimit.allowed) {
        const resetMinutes = Math.ceil(rateLimit.resetIn / 60000);
        return res.status(429).json({ 
          error: `Rate limit exceeded. Try again in ${resetMinutes} minutes.`,
          resetIn: rateLimit.resetIn
        });
      }

      // Fetch the log
      const log = await storage.getManagerLog(logId, clubId);
      if (!log) {
        return res.status(404).json({ error: "Log not found" });
      }

      // Fetch attachments for this log
      const attachments = await storage.getLogAttachmentsByLogId(logId, clubId);

      // Fetch note photos - always included
      const notePhotos = await storage.getNotePhotosByLogId(logId, clubId);

      // Fetch running maintenance list - always included
      const runningMaintenance = await db
        .select()
        .from(runningMaintenanceList)
        .where(
          and(
            eq(runningMaintenanceList.clubId, clubId),
            eq(runningMaintenanceList.status, "open")
          )
        )
        .orderBy(asc(runningMaintenanceList.dateAdded));

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

      // Build comprehensive HTML body based on content settings
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      let htmlSections: string[] = [];

      // Header section (date, day, manager) - always included
      const dayOfWeek = log.dayOfWeek || new Date(log.logDate).toLocaleDateString('en-US', { weekday: 'long' });
      htmlSections.push(`
        <div style="margin-bottom:16px;">
          <p style="margin:0;"><strong>Date:</strong> ${log.logDate} (${dayOfWeek})</p>
          <p style="margin:0;"><strong>Manager:</strong> ${log.managerName || 'Not specified'}</p>
        </div>
      `);

      // Sales section - always included
      const foodSales = log.foodSales || 0;
      const barSales = log.barSales || 0;
      const gamingSales = log.gamingSales || 0;
      const totalSales = log.totalSales || 0;
      htmlSections.push(`
        <div style="margin-bottom:16px;">
          <h4 style="margin:0 0 8px 0;color:#666;">Sales</h4>
          <table style="border-collapse:collapse;">
            <tr><td style="padding:2px 12px 2px 0;">Food:</td><td style="text-align:right;">$${foodSales.toLocaleString()}</td></tr>
            <tr><td style="padding:2px 12px 2px 0;">Bar:</td><td style="text-align:right;">$${barSales.toLocaleString()}</td></tr>
            <tr><td style="padding:2px 12px 2px 0;">Gaming:</td><td style="text-align:right;">$${gamingSales.toLocaleString()}</td></tr>
            <tr style="font-weight:bold;"><td style="padding:2px 12px 2px 0;border-top:1px solid #ccc;">Total:</td><td style="text-align:right;border-top:1px solid #ccc;">$${totalSales.toLocaleString()}</td></tr>
          </table>
        </div>
      `);

      // Drawing section - always included when data exists
      if (log.dailyDrawing || log.weeklyDrawing) {
        htmlSections.push(`
          <div style="margin-bottom:16px;">
            <h4 style="margin:0 0 8px 0;color:#666;">Drawing</h4>
            ${log.dailyDrawing ? `<p style="margin:0;">Daily: $${log.dailyDrawing.toLocaleString()}</p>` : ''}
            ${log.weeklyDrawing ? `<p style="margin:0;">Weekly: $${log.weeklyDrawing.toLocaleString()}</p>` : ''}
          </div>
        `);
      }

      // Operational Notes section - always included
      if (log.operationalNotes) {
        htmlSections.push(`
          <div style="margin-bottom:16px;">
            <h4 style="margin:0 0 8px 0;color:#666;">Operational Notes</h4>
            <p style="margin:0;white-space:pre-wrap;">${log.operationalNotes}</p>
          </div>
        `);
      }

      // Maintenance Notes section - always included
      if (log.maintenanceNotes) {
        htmlSections.push(`
          <div style="margin-bottom:16px;">
            <h4 style="margin:0 0 8px 0;color:#666;">Maintenance Notes</h4>
            <p style="margin:0;white-space:pre-wrap;">${log.maintenanceNotes}</p>
          </div>
        `);
      }

      // Running Maintenance List section - always included
      if (runningMaintenance.length > 0) {
        const items = runningMaintenance.map(m => `<li>${m.title}</li>`).join('');
        htmlSections.push(`
          <div style="margin-bottom:16px;">
            <h4 style="margin:0 0 8px 0;color:#666;">Open Maintenance Items (${runningMaintenance.length})</h4>
            <ul style="margin:0;padding-left:20px;">${items}</ul>
          </div>
        `);
      }

      // Photos section - always included
      if (notePhotos.length > 0) {
        const photoLinks = notePhotos.map(p => `<li><a href="${p.url}">${p.noteType === 'operational' ? 'Ops' : 'Maint'} Photo</a></li>`).join('');
        htmlSections.push(`
          <div style="margin-bottom:16px;">
            <h4 style="margin:0 0 8px 0;color:#666;">Photos</h4>
            <ul style="margin:0;padding-left:20px;">${photoLinks}</ul>
          </div>
        `);
      }

      // Attachments section (always included if present)
      if (attachments.length > 0) {
        const links = attachments
          .map(
            (a) =>
              `<li><a href="${baseUrl}${a.publicUrl}">${a.fileName}</a> (${Math.round(
                (a.fileSize || 0) / 1024
              )} KB)</li>`
          )
          .join("");
        htmlSections.push(`
          <div style="margin-bottom:16px;">
            <h4 style="margin:0 0 8px 0;color:#666;">Attachments</h4>
            <ul style="margin:0;padding-left:20px;">${links}</ul>
          </div>
        `);
      }

      // Additional message if provided
      if (message) {
        htmlSections.push(`
          <div style="margin-bottom:16px;padding:12px;background:#f5f5f5;border-radius:4px;">
            <p style="margin:0;white-space:pre-wrap;">${message}</p>
          </div>
        `);
      }

      // Build final HTML body
      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          ${htmlSections.join('')}
          <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;" />
          <p style="margin:0;color:#666;font-size:14px;">View this entry in the Manager's Log: <a href="${logUrl}">${logUrl}</a></p>
        </div>
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

  // POST /api/running-maintenance - Create a new maintenance item (with optional photo)
  app.post("/api/running-maintenance", upload.single("photo"), async (req, res) => {
    try {
      const clubId = getClubId(req);
      const { title, description, relatedLogDate, createdBy } = req.body;

      if (!title || title.trim() === "") {
        return res.status(400).json({ error: "Title is required" });
      }

      // Handle photo upload
      let photoUrl: string | null = null;
      if (req.file) {
        photoUrl = `/uploads/${req.file.filename}`;
      }

      const item = await storage.createRunningMaintenanceItem({
        clubId,
        title: title.trim(),
        description: description?.trim() || null,
        relatedLogDate: relatedLogDate || null,
        createdBy: createdBy || null,
        status: "open",
        photoUrl,
      });

      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating running maintenance item:", error);
      res.status(500).json({ error: "Failed to create maintenance item" });
    }
  });

  // POST /api/running-maintenance/bulk-import - Bulk import maintenance items from CSV data
  app.post("/api/running-maintenance/bulk-import", async (req, res) => {
    try {
      const clubId = getClubId(req);
      const { entries } = req.body;

      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ error: "Request must include an 'entries' array with at least one entry" });
      }

      if (entries.length > 500) {
        return res.status(400).json({ error: "Maximum 500 entries per bulk import" });
      }

      const results = { success: 0, failed: 0, errors: [] as string[] };
      let earliestDateAdded: string | null = null;

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        try {
          const title = String(entry.title || "").trim();
          if (!title) {
            results.failed++;
            results.errors.push(`Row ${i + 1}: title is required`);
            continue;
          }

          const description = entry.description ? String(entry.description).trim() || null : null;

          // Strict YYYY-MM-DD parser — rejects non-matching formats and invalid calendar dates
          const STRICT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
          const parseStrictDate = (str: string): Date | null => {
            if (!STRICT_DATE_RE.test(str)) return null;
            const [y, m, d] = str.split('-').map(Number);
            const dt = new Date(y, m - 1, d, 12, 0, 0);
            if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
            return dt;
          };

          // Parse dateAdded — defaults to today if not provided
          let dateAdded: Date;
          if (entry.dateAdded) {
            const parsed = parseStrictDate(String(entry.dateAdded).trim());
            if (!parsed) {
              results.failed++;
              results.errors.push(`Row ${i + 1}: invalid date_added "${entry.dateAdded}" (must be YYYY-MM-DD)`);
              continue;
            }
            dateAdded = parsed;
          } else {
            dateAdded = new Date();
          }

          // Parse dateCompleted — if provided, item is completed
          let dateCompleted: Date | null = null;
          let status = "open";
          if (entry.dateCompleted) {
            const parsed = parseStrictDate(String(entry.dateCompleted).trim());
            if (!parsed) {
              results.failed++;
              results.errors.push(`Row ${i + 1}: invalid date_completed "${entry.dateCompleted}" (must be YYYY-MM-DD)`);
              continue;
            }
            dateCompleted = parsed;
            status = "completed";
          }

          await db.insert(runningMaintenanceList).values({
            clubId,
            title,
            description,
            status,
            dateAdded,
            dateCompleted,
          });

          results.success++;

          // Track earliest dateAdded for snapshot re-calculation
          const dateAddedStr = dateAdded.toISOString().slice(0, 10);
          if (!earliestDateAdded || dateAddedStr < earliestDateAdded) {
            earliestDateAdded = dateAddedStr;
          }
        } catch (error) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Failed to save`);
        }
      }

      // Re-snapshot all logs from the earliest dateAdded so Insights stays accurate
      if (results.success > 0 && earliestDateAdded) {
        reSnapshotLogsFromDate(clubId, earliestDateAdded).catch(err =>
          console.error("Error re-snapshotting after maintenance bulk import:", err)
        );
      }

      res.status(200).json(results);
    } catch (error) {
      console.error("Error in running maintenance bulk import:", error);
      res.status(500).json({ error: "Failed to process bulk import" });
    }
  });

  // PATCH /api/running-maintenance/:id - Update a maintenance item (e.g., mark complete, correct dates)
  app.patch("/api/running-maintenance/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const clubId = getClubId(req);
      const { status, title, description, dateAdded: dateAddedRaw, dateCompleted: dateCompletedRaw } = req.body;

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid item ID" });
      }

      // Fetch the current item before any update so we know its existing dates
      // for determining which snapshots need re-building when dates change.
      const existingRows = await db
        .select()
        .from(runningMaintenanceList)
        .where(
          and(
            eq(runningMaintenanceList.id, id),
            eq(runningMaintenanceList.clubId, clubId)
          )
        )
        .limit(1);

      if (existingRows.length === 0) {
        return res.status(404).json({ error: "Maintenance item not found" });
      }
      const existingItem = existingRows[0];

      const updates: Record<string, any> = {};
      let dateChanged = false;
      let newDateAdded: Date | undefined;

      if (status !== undefined) {
        if (status !== "open" && status !== "completed") {
          return res.status(400).json({ error: "Status must be 'open' or 'completed'" });
        }
        updates.status = status;
        // Set dateCompleted when marking as completed
        if (status === "completed") {
          updates.dateCompleted = new Date();
          dateChanged = true;
        } else {
          updates.dateCompleted = null;
          dateChanged = true;
        }
      }

      // Support direct date edits (e.g., correcting a wrong dateAdded or dateCompleted)
      if (dateAddedRaw !== undefined) {
        newDateAdded = new Date(dateAddedRaw);
        if (isNaN(newDateAdded.getTime())) {
          return res.status(400).json({ error: "Invalid dateAdded value" });
        }
        updates.dateAdded = newDateAdded;
        dateChanged = true;
      }

      if (dateCompletedRaw !== undefined) {
        if (dateCompletedRaw === null) {
          updates.dateCompleted = null;
        } else {
          const parsedCompleted = new Date(dateCompletedRaw);
          if (isNaN(parsedCompleted.getTime())) {
            return res.status(400).json({ error: "Invalid dateCompleted value" });
          }
          updates.dateCompleted = parsedCompleted;
        }
        dateChanged = true;
      }

      if (title !== undefined) updates.title = title.trim();
      if (description !== undefined) updates.description = description?.trim() || null;

      const updated = await storage.updateRunningMaintenanceItem(id, clubId, updates);
      if (!updated) {
        return res.status(404).json({ error: "Maintenance item not found" });
      }

      // If status or any date field changed, existing log snapshots may be stale.
      // Re-snapshot all logs from the earliest relevant boundary forward so the
      // Insights chart reflects the corrected history. Run async to keep the response fast.
      const statusChanged = status !== undefined && status !== existingItem.status;
      if (statusChanged || dateChanged) {
        // Collect candidate dates to find the earliest boundary that could have changed.
        // We re-snapshot from min(all affected boundaries) to cover any scenario:
        // dateAdded moving earlier, dateCompleted moving earlier, status flip, etc.
        const candidates: string[] = [
          new Date(existingItem.dateAdded).toISOString().slice(0, 10),
        ];
        if (newDateAdded) {
          candidates.push(newDateAdded.toISOString().slice(0, 10));
        }
        if (existingItem.dateCompleted) {
          candidates.push(new Date(existingItem.dateCompleted).toISOString().slice(0, 10));
        }
        const fromDate = candidates.sort()[0]; // earliest date

        reSnapshotLogsFromDate(clubId, fromDate).catch((err) =>
          console.error("Re-snapshot error after maintenance item edit:", err)
        );
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

  /**
   * GET /api/running-maintenance/by-date/:date
   * Returns running maintenance items as they were on a specific date.
   * Implements "daily reset" behavior:
   * - Shows all items that were open on/before that date
   * - Shows items completed ON that specific date (with completed status)
   * Used in Log History view to show accurate historical maintenance state.
   */
  app.get("/api/running-maintenance/by-date/:date", async (req, res) => {
    try {
      const clubId = getClubId(req);
      const dateStr = req.params.date; // YYYY-MM-DD format
      
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
      }
      
      const targetDate = new Date(dateStr);
      const targetDateEnd = new Date(dateStr);
      targetDateEnd.setHours(23, 59, 59, 999);
      
      // Get all running maintenance items for this club
      const allItems = await db
        .select()
        .from(runningMaintenanceList)
        .where(eq(runningMaintenanceList.clubId, clubId))
        .orderBy(asc(runningMaintenanceList.dateAdded));
      
      // Filter items based on "daily reset" logic:
      // 1. Items that were open (added before or on target date AND not completed before target date)
      // 2. Items completed ON the target date (show as completed)
      const result = allItems.filter(item => {
        const addedDate = new Date(item.dateAdded);
        
        // Item must have been added on or before the target date
        if (addedDate > targetDateEnd) return false;
        
        if (item.status === "open") {
          // Open items - show if they existed by that date
          return true;
        } else if (item.status === "completed" && item.dateCompleted) {
          const completedDate = new Date(item.dateCompleted);
          // Show completed items only if they were completed on the target date
          // or if they were still open on that date (completed after)
          const completedDateStr = completedDate.toISOString().split('T')[0];
          if (completedDateStr === dateStr) {
            // Completed on this exact day - show it
            return true;
          }
          // If completed AFTER the target date, show as "open" (it was open on target date)
          if (completedDate > targetDateEnd) {
            return true;
          }
          // Completed before target date - don't show (hidden per daily reset)
          return false;
        }
        
        return false;
      }).map(item => {
        // For items completed after the target date, show them as "open" for historical accuracy
        if (item.status === "completed" && item.dateCompleted) {
          const completedDate = new Date(item.dateCompleted);
          const completedDateStr = completedDate.toISOString().split('T')[0];
          if (completedDateStr !== dateStr && completedDate > targetDateEnd) {
            return { ...item, status: "open", dateCompleted: null };
          }
        }
        return item;
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching running maintenance by date:", error);
      res.status(500).json({ error: "Failed to fetch maintenance items" });
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
            fullName: `${params.firstName} ${params.lastName}`.trim(),
            clubCity: req.body.clubCity || "",
            clubProvince: req.body.clubProvince || "",
            clubCountry: req.body.clubCountry || "",
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

      res.json({ valid: true, user: {
        ...user,
        clubCity: req.body.clubCity || "",
        clubProvince: req.body.clubProvince || "",
        clubCountry: req.body.clubCountry || "",
      } });
    } catch (error) {
      console.error("Error verifying embed signature:", error);
      res.status(500).json({ error: "Failed to verify embed signature" });
    }
  });

  // ========================================
  // AI OVERVIEW ENDPOINTS
  // ========================================

  // Initialize OpenAI client for AI Overview feature
  const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });

  // GET /api/club-settings - Get club settings including AI overview toggle
  app.get("/api/club-settings", async (req, res) => {
    try {
      const clubId = getClubId(req);
      
      const [club] = await db
        .select()
        .from(clubs)
        .where(eq(clubs.id, clubId))
        .limit(1);
      
      if (!club) {
        // Return default settings if club doesn't exist yet
        return res.json({
          clubId,
          aiOverviewEnabled: false
        });
      }
      
      res.json({
        clubId: club.id,
        aiOverviewEnabled: club.aiOverviewEnabled,
        weatherZipCode: club.weatherZipCode ?? null,
      });
    } catch (error) {
      console.error("Error fetching club settings:", error);
      res.status(500).json({ error: "Failed to fetch club settings" });
    }
  });

  // Zod schema for club settings update
  const updateClubSettingsSchema = z.object({
    aiOverviewEnabled: z.boolean().optional(),
    weatherZipCode: z.string().max(20).nullable().optional(),
  });

  // PATCH /api/club-settings - Update club settings (e.g., toggle AI overview)
  app.patch("/api/club-settings", async (req, res) => {
    try {
      const clubId = getClubId(req);
      
      // Validate request body
      const parseResult = updateClubSettingsSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request body",
          details: parseResult.error.errors 
        });
      }
      
      const { aiOverviewEnabled, weatherZipCode } = parseResult.data;
      
      // Check if club exists
      const [existingClub] = await db
        .select()
        .from(clubs)
        .where(eq(clubs.id, clubId))
        .limit(1);
      
      if (!existingClub) {
        // Create club with settings
        const [newClub] = await db
          .insert(clubs)
          .values({
            id: clubId,
            name: `Club ${clubId}`,
            aiOverviewEnabled: aiOverviewEnabled ?? false,
            weatherZipCode: weatherZipCode ?? null,
          })
          .returning();
        
        return res.json({
          clubId: newClub.id,
          aiOverviewEnabled: newClub.aiOverviewEnabled,
          weatherZipCode: newClub.weatherZipCode ?? null,
        });
      }
      
      // Update existing club
      const [updatedClub] = await db
        .update(clubs)
        .set({
          aiOverviewEnabled: aiOverviewEnabled ?? existingClub.aiOverviewEnabled,
          weatherZipCode: weatherZipCode !== undefined ? weatherZipCode : existingClub.weatherZipCode,
          updatedAt: new Date()
        })
        .where(eq(clubs.id, clubId))
        .returning();
      
      res.json({
        clubId: updatedClub.id,
        aiOverviewEnabled: updatedClub.aiOverviewEnabled,
        weatherZipCode: updatedClub.weatherZipCode ?? null,
      });
    } catch (error) {
      console.error("Error updating club settings:", error);
      res.status(500).json({ error: "Failed to update club settings" });
    }
  });

  app.get("/api/club-budget", async (req, res) => {
    try {
      const clubId = getClubId(req);
      const [club] = await db
        .select()
        .from(clubs)
        .where(eq(clubs.id, clubId))
        .limit(1);

      res.json({
        foodSales: club?.budgetFoodSales || "",
        barSales: club?.budgetBarSales || "",
        gamingSales: club?.budgetGamingSales || "",
      });
    } catch (error) {
      console.error("Error fetching club budget:", error);
      res.status(500).json({ error: "Failed to fetch club budget" });
    }
  });

  const updateBudgetSchema = z.object({
    foodSales: z.string().optional(),
    barSales: z.string().optional(),
    gamingSales: z.string().optional(),
  });

  app.put("/api/club-budget", async (req, res) => {
    try {
      const clubId = getClubId(req);
      const parseResult = updateBudgetSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request body", details: parseResult.error.errors });
      }

      const { foodSales, barSales, gamingSales } = parseResult.data;

      const [existingClub] = await db
        .select()
        .from(clubs)
        .where(eq(clubs.id, clubId))
        .limit(1);

      if (!existingClub) {
        const [newClub] = await db
          .insert(clubs)
          .values({
            id: clubId,
            name: `Club ${clubId}`,
            budgetFoodSales: foodSales || null,
            budgetBarSales: barSales || null,
            budgetGamingSales: gamingSales || null,
          })
          .returning();
        return res.json({
          foodSales: newClub.budgetFoodSales || "",
          barSales: newClub.budgetBarSales || "",
          gamingSales: newClub.budgetGamingSales || "",
        });
      }

      const [updatedClub] = await db
        .update(clubs)
        .set({
          budgetFoodSales: foodSales || null,
          budgetBarSales: barSales || null,
          budgetGamingSales: gamingSales || null,
          updatedAt: new Date(),
        })
        .where(eq(clubs.id, clubId))
        .returning();

      res.json({
        foodSales: updatedClub.budgetFoodSales || "",
        barSales: updatedClub.budgetBarSales || "",
        gamingSales: updatedClub.budgetGamingSales || "",
      });
    } catch (error) {
      console.error("Error updating club budget:", error);
      res.status(500).json({ error: "Failed to update club budget" });
    }
  });

  // POST /api/ai-overview - Generate AI-powered insights analysis
  app.post("/api/ai-overview", async (req, res) => {
    try {
      const clubId = getClubId(req);
      const { startDate, endDate } = req.body;
      
      // Check if AI is enabled for this club
      const [club] = await db
        .select()
        .from(clubs)
        .where(eq(clubs.id, clubId))
        .limit(1);
      
      if (!club?.aiOverviewEnabled) {
        return res.status(403).json({ 
          error: "AI Overview is not enabled for this club",
          enabled: false 
        });
      }
      
      // Fetch logs for the date range
      const logs = await db
        .select()
        .from(managerLogs)
        .where(
          and(
            eq(managerLogs.clubId, clubId),
            gte(managerLogs.logDate, startDate),
            lte(managerLogs.logDate, endDate)
          )
        )
        .orderBy(asc(managerLogs.logDate));
      
      // Fetch open maintenance items
      const maintenance = await db
        .select()
        .from(runningMaintenanceList)
        .where(
          and(
            eq(runningMaintenanceList.clubId, clubId),
            eq(runningMaintenanceList.status, "open")
          )
        )
        .orderBy(asc(runningMaintenanceList.dateAdded));
      
      if (logs.length === 0) {
        return res.json({
          overview: "No data available for the selected date range. Start logging daily entries to receive AI-powered insights.",
          generatedAt: new Date().toISOString()
        });
      }
      
      // Prepare data summary for AI
      const salesSummary = logs.map(log => ({
        date: log.logDate,
        day: log.dayOfWeek,
        food: parseFloat(log.foodSales || "0"),
        bar: parseFloat(log.barSales || "0"),
        gaming: parseFloat(log.gamingSales || "0"),
        total: parseFloat(log.totalSales || "0"),
        notes: log.salesNotes || log.dailyNotes
      }));
      
      const totalFood = salesSummary.reduce((sum, d) => sum + d.food, 0);
      const totalBar = salesSummary.reduce((sum, d) => sum + d.bar, 0);
      const totalGaming = salesSummary.reduce((sum, d) => sum + d.gaming, 0);
      const grandTotal = salesSummary.reduce((sum, d) => sum + d.total, 0);
      const avgDaily = grandTotal / logs.length;
      
      const maintenanceList = maintenance.map(m => ({
        title: m.title,
        priority: m.priority,
        daysOpen: Math.max(1, Math.floor((Date.now() - new Date(m.dateAdded || Date.now()).getTime()) / (1000 * 60 * 60 * 24)))
      }));
      
      // Generate AI overview
      const prompt = `You are an expert restaurant operations analyst. Analyze this data and provide a brief, actionable overview (2-3 paragraphs max).

DATA SUMMARY (${startDate} to ${endDate}):
- Days logged: ${logs.length}
- Total Sales: $${grandTotal.toLocaleString()}
- Average Daily Sales: $${avgDaily.toFixed(0)}
- Food Sales: $${totalFood.toLocaleString()} (${((totalFood/grandTotal)*100).toFixed(1)}%)
- Bar Sales: $${totalBar.toLocaleString()} (${((totalBar/grandTotal)*100).toFixed(1)}%)
- Gaming Sales: $${totalGaming.toLocaleString()} (${((totalGaming/grandTotal)*100).toFixed(1)}%)

Daily breakdown:
${salesSummary.slice(-7).map(d => `${d.date} (${d.day}): $${d.total.toLocaleString()}${d.notes ? ` - "${d.notes.slice(0,50)}..."` : ''}`).join('\n')}

Open Maintenance Items (${maintenanceList.length}):
${maintenanceList.slice(0, 5).map(m => `- ${m.title} (${m.priority} priority, ${m.daysOpen} days open)`).join('\n') || 'None'}

Provide:
1. Key performance observations (trends, strong/weak days)
2. Actionable recommendations
3. Any concerns that need attention

Keep the tone professional but friendly. Focus on actionable insights.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful restaurant operations analyst. Be concise and actionable." },
          { role: "user", content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.7
      });
      
      const overview = completion.choices[0]?.message?.content || "Unable to generate overview. Please try again.";
      
      res.json({
        overview,
        generatedAt: new Date().toISOString(),
        dataRange: { startDate, endDate },
        logsAnalyzed: logs.length,
        openMaintenanceItems: maintenanceList.length
      });
    } catch (error) {
      console.error("Error generating AI overview:", error);
      res.status(500).json({ error: "Failed to generate AI overview" });
    }
  });

  // Backfill running maintenance snapshots for any historical logs that lack them.
  // Runs asynchronously so it doesn't block server startup.
  backfillRunningMaintenanceSnapshots().catch((err) =>
    console.error("Startup backfill error:", err)
  );

  const httpServer = createServer(app);
  return httpServer;
}
