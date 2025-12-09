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
import { insertManagerLogSchema, insertMaintenanceItemSchema } from "@shared/schema";
import type { MetricsResponse, MetricsSummary, DailySalesData, ToDoStatus, TopDayData, SalesByCategory } from "@shared/schema";
import { sendLogNotification, isEmailConfigured } from "./email";
import { z } from "zod";

// Default clubId for backwards compatibility when not provided
const DEFAULT_CLUB_ID = "default";

/**
 * Extracts clubId from request query params
 * Falls back to 'default' if not provided (for backwards compatibility)
 */
function getClubId(req: { query: { clubId?: string } }): string {
  return (req.query.clubId as string) || DEFAULT_CLUB_ID;
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
      const log = await storage.upsertManagerLog(validatedData);
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
   * POST /api/maintenance-items
   * Creates a new maintenance item linked to a log entry.
   */
  app.post("/api/maintenance-items", async (req, res) => {
    try {
      const validatedData = insertMaintenanceItemSchema.parse(req.body);
      const item = await storage.createMaintenanceItem(validatedData);
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
      const oneYearAgo = new Date(targetDate);
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      
      const weather = await getHistoricalWeather(
        oneYearAgo.toISOString().split('T')[0],
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
      const oneYearAgo = new Date(targetDate);
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      
      const weather = await getHistoricalWeather(
        oneYearAgo.toISOString().split('T')[0],
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
   * POST /api/notifications/send
   * Send a notification email for a manager log
   * Body: { logId: number, recipients: string[], clubName?: string }
   */
  app.post("/api/notifications/send", async (req, res) => {
    try {
      const schema = z.object({
        logId: z.number(),
        recipients: z.array(z.string().email()).min(1),
        clubName: z.string().optional()
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: parsed.error.issues 
        });
      }

      const { logId, recipients, clubName } = parsed.data;

      // Fetch the log
      const log = await storage.getManagerLog(logId);
      if (!log) {
        return res.status(404).json({ error: "Log not found" });
      }

      // Send the notification
      const result = await sendLogNotification(log, recipients, clubName);
      
      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(500).json({ success: false, error: result.message });
      }
    } catch (error) {
      console.error("Error sending notification:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
