import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertManagerLogSchema } from "@shared/schema";
import { z } from "zod";

// Weather service functions using Open-Meteo API (free)
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
    // Fallback to mock data
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
    const url = `https://api.open-meteo.com/v1/historical?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&daily=temperature_2m_max,relative_humidity_2m_mean,wind_speed_10m_max,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph`;
    
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
    // Fallback to mock data
    return {
      temperature: Math.floor(Math.random() * 25) + 45,
      condition: "Cloudy",
      humidity: 55,
      windSpeed: 10,
      description: "Historical weather data temporarily unavailable"
    };
  }
}

// Convert Open-Meteo weather codes to readable conditions
function getWeatherCondition(weatherCode: number): string {
  if (weatherCode === 0) return "Clear";
  if (weatherCode >= 1 && weatherCode <= 3) return "Cloudy";
  if (weatherCode >= 45 && weatherCode <= 48) return "Foggy";
  if (weatherCode >= 51 && weatherCode <= 67) return "Rainy";
  if (weatherCode >= 71 && weatherCode <= 77) return "Snowy";
  if (weatherCode >= 80 && weatherCode <= 99) return "Rainy";
  return "Cloudy";
}

// Convert Open-Meteo weather codes to descriptions
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
