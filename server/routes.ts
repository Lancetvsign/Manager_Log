import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertManagerLogSchema } from "@shared/schema";
import { z } from "zod";

// Weather service functions
async function getCurrentWeather(lat: number = 40.7128, lon: number = -74.0060) {
  // Mock weather data for now - will be replaced with real API
  return {
    temperature: Math.floor(Math.random() * 30) + 50,
    condition: ["Sunny", "Cloudy", "Rainy", "Overcast"][Math.floor(Math.random() * 4)],
    humidity: Math.floor(Math.random() * 40) + 30,
    windSpeed: Math.floor(Math.random() * 15) + 3,
    description: "Current weather conditions"
  };
}

async function getHistoricalWeather(date: string, lat: number = 40.7128, lon: number = -74.0060) {
  // Mock historical weather data - will be replaced with real API
  return {
    temperature: Math.floor(Math.random() * 25) + 45,
    condition: ["Sunny", "Cloudy", "Rainy", "Snowy"][Math.floor(Math.random() * 4)],
    humidity: Math.floor(Math.random() * 50) + 25,
    windSpeed: Math.floor(Math.random() * 20) + 2,
    description: "Historical weather conditions"
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Manager Logs API
  
  // Get all manager logs
  app.get("/api/manager-logs", async (req, res) => {
    try {
      const logs = await storage.getAllManagerLogs();
      res.json(logs);
    } catch (error) {
      console.error("Error fetching manager logs:", error);
      res.status(500).json({ error: "Failed to fetch manager logs" });
    }
  });

  // Get a single manager log
  app.get("/api/manager-logs/:id", async (req, res) => {
    try {
      const log = await storage.getManagerLog(req.params.id);
      if (!log) {
        return res.status(404).json({ error: "Manager log not found" });
      }
      res.json(log);
    } catch (error) {
      console.error("Error fetching manager log:", error);
      res.status(500).json({ error: "Failed to fetch manager log" });
    }
  });

  // Create a new manager log
  app.post("/api/manager-logs", async (req, res) => {
    try {
      // Validate request body
      const validatedData = insertManagerLogSchema.parse(req.body);
      
      // Create the log entry
      const newLog = await storage.createManagerLog(validatedData);
      
      res.status(201).json(newLog);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: error.errors 
        });
      }
      console.error("Error creating manager log:", error);
      res.status(500).json({ error: "Failed to create manager log" });
    }
  });

  // Update a manager log (partial update)
  app.patch("/api/manager-logs/:id", async (req, res) => {
    try {
      const updates = insertManagerLogSchema.partial().parse(req.body);
      const updatedLog = await storage.updateManagerLog(req.params.id, updates);
      
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

  // Delete a manager log
  app.delete("/api/manager-logs/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteManagerLog(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Manager log not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting manager log:", error);
      res.status(500).json({ error: "Failed to delete manager log" });
    }
  });

  // Weather API endpoints
  
  // Get current weather
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

  // Get historical weather (1 year ago from given date)
  app.get("/api/weather/historical", async (req, res) => {
    try {
      const { date, lat, lon } = req.query;
      
      if (!date) {
        return res.status(400).json({ error: "Date parameter is required" });
      }
      
      // Calculate date 1 year ago
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

  // Get logs by date range
  app.get("/api/manager-logs/range/:startDate/:endDate", async (req, res) => {
    try {
      const { startDate, endDate } = req.params;
      const logs = await storage.getManagerLogsByDateRange(startDate, endDate);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching manager logs by date range:", error);
      res.status(500).json({ error: "Failed to fetch manager logs" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
