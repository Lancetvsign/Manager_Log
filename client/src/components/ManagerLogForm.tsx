import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { CalendarIcon, Save, Loader2, Plus, Wrench, CheckCircle, AlertCircle, Mail, ChevronDown, Camera, X, Upload, Download, Info } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import WeatherCard from "./WeatherCard";
import WeatherWide from "./WeatherWide";
import SalesInput from "./SalesInput";
import EmailLogModal from "./EmailLogModal";
import HistoricalComparisonCard from "./HistoricalComparisonCard";
import { NotePhotos } from "./NotePhotos";
import { MaintenanceItemsTable } from "./MaintenanceItemsTable";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ManagerLog, MaintenanceItem } from "@shared/schema";
import { useManagerLog, buildApiUrl } from "@/contexts/ManagerLogContext";
import { useLocationPermission } from "@/lib/useLocation";

interface ManagerLogFormProps {
  onSubmit: (data: any) => void;
}

interface WeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  description: string;
}

export default function ManagerLogForm({ onSubmit }: ManagerLogFormProps) {
  const { clubId, managerName: defaultManagerName, apiBaseUrl } = useManagerLog();
  const [date, setDate] = useState<Date>(new Date());
  
  // Manager name fields - 3 separate inputs
  const [amManagerName, setAmManagerName] = useState("");
  const [pmManagerName, setPmManagerName] = useState("");
  const [kitchenManagerName, setKitchenManagerName] = useState("");
  const [dailyNotes, setDailyNotes] = useState("");
  const [salesNotes, setSalesNotes] = useState("");
  const [dailyNumber, setDailyNumber] = useState("");
  const [weeklyNumber, setWeeklyNumber] = useState("");
  const [salesData, setSalesData] = useState({
    current: { food: "", bar: "", gaming: "" },
    lastYear: { food: "", bar: "", gaming: "" },
    lastWeek: { food: "", bar: "", gaming: "" }
  });
  const [weatherData, setWeatherData] = useState<{
    current: WeatherData | null;
    historical: WeatherData | null;
    historicalFallbackNote: string | null;
  }>({ current: null, historical: null, historicalFallbackNote: null });
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const [existingLogId, setExistingLogId] = useState<number | null>(null);
  const [comparisonPeriod, setComparisonPeriod] = useState<"none" | "last_year" | "last_week">("none");
  
  const [newMaintenanceDescription, setNewMaintenanceDescription] = useState("");
  const [newMaintenanceStatus, setNewMaintenanceStatus] = useState<"open" | "completed">("open");
  const [newMaintenanceNotes, setNewMaintenanceNotes] = useState("");
  const [newMaintenancePhoto, setNewMaintenancePhoto] = useState<File | null>(null);
  const [newMaintenancePhotoPreview, setNewMaintenancePhotoPreview] = useState<string | null>(null);
  const maintenancePhotoInputRef = useRef<HTMLInputElement>(null);
  
  // Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  
  // Collapsible state for maintenance list
  const [maintenanceOpen, setMaintenanceOpen] = useState(true);
  
  // Photo lightbox state
  const [photoLightboxSrc, setPhotoLightboxSrc] = useState<string | null>(null);
  
  // Historical data dialog state
  const [historicalDataOpen, setHistoricalDataOpen] = useState(false);
  const [historicalDate, setHistoricalDate] = useState<Date | undefined>(undefined);
  const [historicalFoodSales, setHistoricalFoodSales] = useState("");
  const [historicalBarSales, setHistoricalBarSales] = useState("");
  const [historicalGamingSales, setHistoricalGamingSales] = useState("");
  const [bulkImportMode, setBulkImportMode] = useState<"single" | "bulk">("single");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreviewData, setCsvPreviewData] = useState<Array<{ date: string; foodSales: number; barSales: number; gamingSales: number; error?: string }>>([]);
  const [csvParseError, setCsvParseError] = useState<string | null>(null);
  const [bulkImportResult, setBulkImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Get user's location for weather data
  const { lat, lon, loading: locationLoading, error: locationError } = useLocationPermission();

  const dateString = format(date, 'yyyy-MM-dd');
  
  // Calculate comparison dates for last year (52 weeks/364 days) and last week (7 days)
  const lastYearDate = new Date(date);
  lastYearDate.setDate(lastYearDate.getDate() - 364);
  const comparisonDateString = format(lastYearDate, 'yyyy-MM-dd');
  
  const lastWeekDate = new Date(date);
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);
  const lastWeekDateString = format(lastWeekDate, 'yyyy-MM-dd');
  
  // Check if viewing a past log (read-only mode)
  // Use local time for both to avoid timezone mismatches
  const todayLocal = format(new Date(), 'yyyy-MM-dd');
  const isPastLog = dateString < todayLocal;

  const { data: existingLog, isLoading: isLoadingLog } = useQuery<ManagerLog>({
    queryKey: ['/api/manager-logs/by-date', dateString, clubId],
    queryFn: async () => {
      const url = buildApiUrl(`/api/manager-logs/by-date/${dateString}`, clubId, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch log');
      }
      return response.json();
    },
    enabled: !!dateString,
  });

  // Fetch log from 52 weeks ago for year-over-year sales comparison
  const { data: comparisonLog } = useQuery<ManagerLog>({
    queryKey: ['/api/manager-logs/by-date', comparisonDateString, clubId, 'comparison'],
    queryFn: async () => {
      const url = buildApiUrl(`/api/manager-logs/by-date/${comparisonDateString}`, clubId, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch comparison log');
      }
      return response.json();
    },
    enabled: !!comparisonDateString,
  });

  // Fetch log from 7 days ago for last week comparison
  const { data: lastWeekLog } = useQuery<ManagerLog>({
    queryKey: ['/api/manager-logs/by-date', lastWeekDateString, clubId, 'last-week'],
    queryFn: async () => {
      const url = buildApiUrl(`/api/manager-logs/by-date/${lastWeekDateString}`, clubId, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch last week log');
      }
      return response.json();
    },
    enabled: !!lastWeekDateString,
  });

  const { data: maintenanceItems, isLoading: isLoadingMaintenance } = useQuery<MaintenanceItem[]>({
    queryKey: ['/api/manager-logs', existingLogId, 'maintenance', clubId],
    queryFn: async () => {
      const url = buildApiUrl(`/api/manager-logs/${existingLogId}/maintenance`, clubId, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch maintenance items');
      return response.json();
    },
    enabled: !!existingLogId,
  });

  // Type for running maintenance items (all open items across all dates)
  interface RunningMaintenanceItem {
    id: number;
    description: string;
    status: "open" | "completed";
    notes: string | null;
    createdAt: string;
    logDate: string;
    photoUrl: string | null;
    managerLogId: number;
    resolvedAt: string | null;
  }

  // Fetch maintenance items for the Running Maintenance List
  // Shows all open items + only items completed on the selected date
  const { data: runningItems, isLoading: isLoadingRunning, refetch: refetchRunning } = useQuery<RunningMaintenanceItem[]>({
    queryKey: ['/api/maintenance/open', clubId, dateString],
    queryFn: async () => {
      const baseUrl = buildApiUrl('/api/maintenance/open', clubId, apiBaseUrl);
      const url = `${baseUrl}&date=${dateString}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch running maintenance items');
      return response.json();
    },
    enabled: !!clubId && !!dateString,
  });

  // Ensure a log exists for this date, creating if needed
  const ensureLogId = async (): Promise<number> => {
    if (existingLogId) return existingLogId;

    const res = await fetch(`${apiBaseUrl}/api/logs/ensure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clubId,
        date: format(date, 'yyyy-MM-dd'),
        managerName: amManagerName || pmManagerName || kitchenManagerName || "Unknown",
      }),
    });

    if (!res.ok) {
      throw new Error("Could not create daily log.");
    }

    const data = await res.json();
    setExistingLogId(data.logId);
    return data.logId;
  };

  useEffect(() => {
    if (existingLog) {
      setExistingLogId(existingLog.id);
      setAmManagerName(existingLog.amManagerName || "");
      setPmManagerName(existingLog.pmManagerName || "");
      setKitchenManagerName(existingLog.kitchenManagerName || "");
      setDailyNotes(existingLog.dailyNotes || "");
      setSalesNotes(existingLog.salesNotes || "");
      setDailyNumber(existingLog.dailyNumber || "");
      setWeeklyNumber(existingLog.weeklyNumber || "");
      setSalesData({
        current: {
          food: existingLog.foodSales || "",
          bar: existingLog.barSales || "",
          gaming: existingLog.gamingSales || ""
        },
        lastYear: {
          food: comparisonLog?.foodSales || "",
          bar: comparisonLog?.barSales || "",
          gaming: comparisonLog?.gamingSales || ""
        },
        lastWeek: {
          food: lastWeekLog?.foodSales || "",
          bar: lastWeekLog?.barSales || "",
          gaming: lastWeekLog?.gamingSales || ""
        }
      });
    } else {
      setExistingLogId(null);
      resetForm();
      // Even without a current log, populate comparison data
      setSalesData(prev => ({
        ...prev,
        lastYear: {
          food: comparisonLog?.foodSales || "",
          bar: comparisonLog?.barSales || "",
          gaming: comparisonLog?.gamingSales || ""
        },
        lastWeek: {
          food: lastWeekLog?.foodSales || "",
          bar: lastWeekLog?.barSales || "",
          gaming: lastWeekLog?.gamingSales || ""
        }
      }));
    }
  }, [existingLog, comparisonLog, lastWeekLog, dateString]);

  useEffect(() => {
    // Wait for location to be available (or error out)
    if (locationLoading) {
      setIsLoadingWeather(true);
      return;
    }
    
    /**
     * Fetches weather data with fallback strategy for historical weather.
     * Uses browser geolocation for accurate location-based weather.
     * 
     * FALLBACK LOGIC FOR HISTORICAL WEATHER:
     * 1. First attempt: Try fetching weather from 52 weeks (364 days) ago - same day of week
     * 2. Second attempt: If first fails or returns "unavailable", try 365 days ago (1 day earlier)
     * 3. Final fallback: If both fail, use current weather with a note explaining the fallback
     * 
     * Note: The server returns fallback data with description containing "temporarily unavailable"
     * when the external weather API fails. We detect this and apply our client-side fallback strategy.
     */
    const fetchWeatherData = async () => {
      setIsLoadingWeather(true);
      
      // Helper to build URL with optional location params
      const buildUrl = (base: string, params?: Record<string, string>): string => {
        const url = new URL(base, window.location.origin);
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            if (value) url.searchParams.set(key, value);
          });
        }
        if (lat && lon) {
          url.searchParams.set('lat', lat.toString());
          url.searchParams.set('lon', lon.toString());
        }
        return url.toString();
      };
      
      // Helper function to fetch and parse weather response
      const fetchWeather = async (url: string): Promise<WeatherData | null> => {
        try {
          const response = await fetch(url);
          if (!response.ok) return null;
          const data = await response.json();
          if (data && typeof data.temperature === 'number' && data.condition) {
            return data;
          }
          return null;
        } catch {
          return null;
        }
      };
      
      // Helper to check if weather data is a server-side fallback (unavailable)
      const isServerFallback = (weather: WeatherData | null): boolean => {
        if (!weather) return true;
        return weather.description?.toLowerCase().includes('temporarily unavailable') ?? false;
      };

      try {
        // Fetch current weather (with location if available)
        const currentUrl = buildUrl(`${apiBaseUrl}/api/weather/current`);
        const currentWeather = await fetchWeather(currentUrl);

        // STEP 1: Try historical weather for 52 weeks ago (same day of week)
        const historicalUrl = buildUrl(`${apiBaseUrl}/api/weather/historical`, { date: dateString });
        let historicalWeather = await fetchWeather(historicalUrl);
        let fallbackNote: string | null = null;

        // STEP 2: If first attempt returned server fallback, try 365 days ago (1 day before 52 weeks)
        if (isServerFallback(historicalWeather)) {
          const selectedDate = new Date(dateString + 'T00:00:00');
          // Use 52 weeks (364 days) - 1 day for fallback (same day of week, 1 day earlier)
          const fallbackDate = new Date(selectedDate);
          fallbackDate.setDate(fallbackDate.getDate() - 365); // 364 - 1 = 365 days back
          const fallbackDateString = format(fallbackDate, 'yyyy-MM-dd');
          
          const fallbackUrl = buildUrl(`${apiBaseUrl}/api/weather/historical`, { date: fallbackDateString });
          const previousDayWeather = await fetchWeather(fallbackUrl);
          
          if (!isServerFallback(previousDayWeather)) {
            // Successfully got real data from the previous day
            historicalWeather = previousDayWeather;
            fallbackNote = `Data from ${format(fallbackDate, 'MMM d, yyyy')} (previous day)`;
          }
        }

        // STEP 3: If both historical attempts returned server fallback, show unavailable (no fake data)
        if (isServerFallback(historicalWeather)) {
          historicalWeather = null;
          fallbackNote = "Historical data unavailable";
        }

        setWeatherData({
          current: currentWeather,
          historical: historicalWeather,
          historicalFallbackNote: fallbackNote
        });
      } catch (error) {
        console.error('Failed to fetch weather data:', error);
        toast({
          title: "Weather Error",
          description: "Failed to load weather data. Using default values.",
          variant: "destructive"
        });
      } finally {
        setIsLoadingWeather(false);
      }
    };

    fetchWeatherData();
  }, [dateString, toast, apiBaseUrl, lat, lon, locationLoading]);

  const saveLogMutation = useMutation({
    mutationFn: async (logData: any) => {
      const response = await fetch(`${apiBaseUrl}/api/manager-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...logData, clubId })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save log entry');
      }
      
      return response.json();
    },
    onSuccess: async (data) => {
      toast({
        title: "Success",
        description: existingLogId ? "Manager log updated successfully!" : "Manager log created successfully!"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/manager-logs', clubId] });
      queryClient.invalidateQueries({ queryKey: ['/api/manager-logs/by-date', dateString, clubId] });
      setExistingLogId(data.id);
      
      onSubmit(data);
    },
    onError: (error: any) => {
      console.error('Failed to save log entry:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save log entry. Please try again.",
        variant: "destructive"
      });
    }
  });

  const addMaintenanceMutation = useMutation({
    mutationFn: async (itemData: { managerLogId: number; description: string; status: string; notes?: string; photo?: File }) => {
      const formData = new FormData();
      formData.append('managerLogId', String(itemData.managerLogId));
      formData.append('description', itemData.description);
      formData.append('status', itemData.status);
      if (itemData.notes) {
        formData.append('notes', itemData.notes);
      }
      if (itemData.photo) {
        formData.append('photo', itemData.photo);
      }

      const url = buildApiUrl('/api/maintenance-items', clubId, apiBaseUrl);
      const response = await fetch(url, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to add maintenance item');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Maintenance item added successfully!"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/manager-logs', existingLogId, 'maintenance', clubId] });
      queryClient.invalidateQueries({ queryKey: ['/api/maintenance/open', clubId, dateString] });
      setNewMaintenanceDescription("");
      setNewMaintenanceStatus("open");
      setNewMaintenanceNotes("");
      setNewMaintenancePhoto(null);
      setNewMaintenancePhotoPreview(null);
    },
    onError: (error: any) => {
      console.error('Failed to add maintenance item:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add maintenance item. Please try again.",
        variant: "destructive"
      });
    }
  });

  const updateMaintenanceMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const response = await fetch(`${apiBaseUrl}/api/maintenance-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update maintenance item');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Maintenance item updated!"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/manager-logs', existingLogId, 'maintenance', clubId] });
      queryClient.invalidateQueries({ queryKey: ['/api/maintenance/open', clubId, dateString] });
    },
    onError: (error: any) => {
      console.error('Failed to update maintenance item:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update maintenance item.",
        variant: "destructive"
      });
    }
  });

  // Historical data single entry mutation
  const saveHistoricalMutation = useMutation({
    mutationFn: async (data: { logDate: string; dayOfWeek: string; foodSales: string; barSales: string; gamingSales: string }) => {
      const url = buildApiUrl("/api/manager-logs/historical", clubId, apiBaseUrl);
      const response = await apiRequest("POST", url, { ...data, clubId });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Historical data saved successfully!" });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-logs"] });
      setHistoricalDataOpen(false);
      setHistoricalDate(undefined);
      setHistoricalFoodSales("");
      setHistoricalBarSales("");
      setHistoricalGamingSales("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save historical data.", variant: "destructive" });
    }
  });

  // Bulk import mutation
  const bulkImportMutation = useMutation({
    mutationFn: async (rows: Array<{ date: string; foodSales: number; barSales: number; gamingSales: number }>) => {
      const url = buildApiUrl("/api/manager-logs/bulk-historical", clubId, apiBaseUrl);
      const response = await apiRequest("POST", url, {
        entries: rows.map(row => {
          const dateObj = new Date(row.date);
          const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
          return {
            logDate: row.date,
            dayOfWeek,
            foodSales: row.foodSales.toString(),
            barSales: row.barSales.toString(),
            gamingSales: row.gamingSales.toString(),
            clubId: clubId,
          };
        }),
      });
      return response.json();
    },
    onSuccess: (result: { success: number; failed: number; errors: string[] }) => {
      setBulkImportResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/manager-logs"] });
      if (result.failed === 0) {
        toast({ title: "Success", description: `${result.success} records imported successfully!` });
        setTimeout(() => {
          setHistoricalDataOpen(false);
          clearBulkImport();
          setBulkImportMode("single");
        }, 2000);
      }
    },
  });

  // CSV parsing
  const parseCSV = useCallback((text: string) => {
    setCsvParseError(null);
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      setCsvParseError("CSV must have a header row and at least one data row");
      setCsvPreviewData([]);
      return;
    }
    const header = lines[0].toLowerCase().split(',').map(h => h.trim());
    const dateIdx = header.findIndex(h => h === 'date');
    const foodIdx = header.findIndex(h => h.includes('food'));
    const barIdx = header.findIndex(h => h.includes('bar'));
    const gamingIdx = header.findIndex(h => h.includes('gaming'));
    if (dateIdx === -1 || foodIdx === -1 || barIdx === -1 || gamingIdx === -1) {
      setCsvParseError("CSV must have columns: date, food_sales, bar_sales, gaming_sales");
      setCsvPreviewData([]);
      return;
    }
    const rows: Array<{ date: string; foodSales: number; barSales: number; gamingSales: number; error?: string }> = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length < 4) continue;
      const dateVal = values[dateIdx];
      const foodVal = parseFloat(values[foodIdx]) || 0;
      const barVal = parseFloat(values[barIdx]) || 0;
      const gamingVal = parseFloat(values[gamingIdx]) || 0;
      let error: string | undefined;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
        error = "Invalid date format (use YYYY-MM-DD)";
      }
      rows.push({ date: dateVal, foodSales: foodVal, barSales: barVal, gamingSales: gamingVal, error });
    }
    setCsvPreviewData(rows);
  }, []);

  const handleCsvFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setBulkImportResult(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseCSV(text);
    };
    reader.onerror = () => {
      setCsvParseError("Failed to read file");
      setCsvPreviewData([]);
    };
    reader.readAsText(file);
  }, [parseCSV]);

  const clearBulkImport = useCallback(() => {
    setCsvFile(null);
    setCsvPreviewData([]);
    setCsvParseError(null);
    setBulkImportResult(null);
  }, []);

  const getDayOfWeek = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  };

  const formatWeatherString = (weather: WeatherData): string => {
    return `${weather.temperature}°F, ${weather.description}, Humidity: ${weather.humidity}%, Wind: ${weather.windSpeed} mph`;
  };

  const handleSalesChange = (field: string, value: string) => {
    setSalesData(prev => ({
      ...prev,
      current: { ...prev.current, [field]: value }
    }));
  };

  const calculateTotalSales = (): string => {
    const food = parseFloat(salesData.current.food) || 0;
    const bar = parseFloat(salesData.current.bar) || 0;
    const gaming = parseFloat(salesData.current.gaming) || 0;
    const total = food + bar + gaming;
    return total > 0 ? total.toFixed(2) : "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // At least one manager name is required
    const hasManager = amManagerName.trim() || pmManagerName.trim() || kitchenManagerName.trim();
    if (!hasManager) {
      toast({
        title: "Validation Error",
        description: "At least one manager name is required.",
        variant: "destructive"
      });
      return;
    }
    
    // Determine primary manager name (first non-empty value)
    const primaryManager = amManagerName.trim() || pmManagerName.trim() || kitchenManagerName.trim();
    
    const logData = {
      logDate: dateString,
      dayOfWeek: getDayOfWeek(date),
      managerName: primaryManager, // Required field - primary manager for the day
      amManagerName: amManagerName.trim() || null,
      pmManagerName: pmManagerName.trim() || null,
      kitchenManagerName: kitchenManagerName.trim() || null,
      weather: weatherData.current ? formatWeatherString(weatherData.current) : null,
      weatherLastYear: weatherData.historical ? formatWeatherString(weatherData.historical) : null,
      foodSales: salesData.current.food || null,
      barSales: salesData.current.bar || null,
      gamingSales: salesData.current.gaming || null,
      totalSales: calculateTotalSales() || null,
      salesNotes: salesNotes.trim() || null,
      dailyNumber: dailyNumber || null,
      weeklyNumber: weeklyNumber || null,
      dailyNotes: dailyNotes.trim() || null
    };

    saveLogMutation.mutate(logData);
  };

  const handleMaintenancePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewMaintenancePhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewMaintenancePhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearMaintenancePhoto = () => {
    setNewMaintenancePhoto(null);
    setNewMaintenancePhotoPreview(null);
    if (maintenancePhotoInputRef.current) {
      maintenancePhotoInputRef.current.value = "";
    }
  };

  const handleAddMaintenanceItem = async () => {
    if (!newMaintenanceDescription.trim()) {
      toast({
        title: "Validation Error",
        description: "Maintenance item description is required.",
        variant: "destructive"
      });
      return;
    }

    try {
      const logId = await ensureLogId();
      
      addMaintenanceMutation.mutate({
        managerLogId: logId,
        description: newMaintenanceDescription.trim(),
        status: newMaintenanceStatus,
        notes: newMaintenanceNotes.trim() || undefined,
        photo: newMaintenancePhoto || undefined
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not create daily log for to-do item.",
        variant: "destructive"
      });
    }
  };

  const handleToggleMaintenanceStatus = (item: MaintenanceItem) => {
    const newStatus = item.status === "open" ? "completed" : "open";
    updateMaintenanceMutation.mutate({ id: item.id, status: newStatus });
  };

  const resetForm = () => {
    setAmManagerName("");
    setPmManagerName("");
    setKitchenManagerName("");
    setDailyNotes("");
    setSalesNotes("");
    setDailyNumber("");
    setWeeklyNumber("");
    setSalesData({
      current: { food: "", bar: "", gaming: "" },
      lastYear: { food: "", bar: "", gaming: "" },
      lastWeek: { food: "", bar: "", gaming: "" }
    });
  };

  const isLoading = saveLogMutation.isPending || isLoadingWeather || isLoadingLog;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Header Information */}
      <Card data-testid="card-log-header">
        <CardContent className="p-4">
        {/* Title banner */}
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-xl font-semibold">Daily Manager Log Entry</h2>
            {existingLogId && !isPastLog && (
              <span className="text-sm text-muted-foreground">(Editing)</span>
            )}
            {isPastLog && (
              <Badge variant="secondary">View Only</Badge>
            )}
          </div>
        </div>
        {isPastLog && (
          <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-3 py-2 rounded-md text-sm mb-3">
            <strong>Read-only:</strong> This log is from {format(date, 'MMMM d, yyyy')} and cannot be edited.
          </div>
        )}

        {/* 3-column grid: Date | Weather | Drawing - fixed height panels */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_0.75fr_12rem]">
          {/* Column 1: Date */}
          <div className="h-[164px] rounded-xl border border-border bg-card p-4">
            <div className="flex h-full flex-col">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date</div>

              <div className="mt-3 h-[107px] rounded-xl border border-border/10 bg-muted/30 px-4">
                <div className="flex h-full items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-muted/50">
                    <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="leading-tight">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Selected</div>
                    <div className="text-2xl font-semibold text-foreground">{format(date, 'd')}</div>
                    <div className="text-base text-muted-foreground" data-testid="text-long-date">{format(date, 'MMMM d, yyyy')}</div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Day</div>
                    <div className="text-base font-medium text-foreground/80" data-testid="text-weekday">{getDayOfWeek(date)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Weather */}
          <div className="h-[164px] rounded-xl border border-border bg-card p-4" data-testid="card-weather">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Weather</div>
                {locationError && (
                  <div className="text-[9px] text-yellow-600 dark:text-yellow-500" title={locationError}>
                    (Default location)
                  </div>
                )}
              </div>
              <div className="mt-3 h-[107px] rounded-xl border border-border/10 bg-muted/30 px-4">
                <div className="grid h-full content-center gap-3">
                  <WeatherWide
                    title="Today"
                    temp={weatherData.current?.temperature ?? "—"}
                    condition={weatherData.current?.condition ?? "—"}
                    wind={weatherData.current?.windSpeed ?? "—"}
                    isLoading={isLoadingWeather}
                    compact
                  />
                  <WeatherWide
                    title={weatherData.historicalFallbackNote ? `Last Year (${weatherData.historicalFallbackNote})` : "Last Year"}
                    temp={weatherData.historical?.temperature ?? "—"}
                    condition={weatherData.historical?.condition ?? "—"}
                    wind={weatherData.historical?.windSpeed ?? "—"}
                    isLoading={isLoadingWeather}
                    muted
                    compact
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Column 3: Drawing - 12rem width */}
          <div className="h-[164px] rounded-xl border border-border bg-card p-4">
            <div className="flex h-full flex-col">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Drawing</div>
              <div className="mt-3 h-[107px] px-4">
                <div className="grid h-full grid-rows-2 content-center gap-2.5 py-2">
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/60 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-foreground">Daily</div>
                    <Input
                      type="number"
                      step="1"
                      value={dailyNumber}
                      onChange={(e) => setDailyNumber(e.target.value)}
                      placeholder="—"
                      disabled={isPastLog}
                      className="w-14 text-right text-base font-semibold bg-transparent border-0 p-0 focus-visible:ring-0 leading-none"
                      data-testid="input-daily-number"
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/60 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Weekly</div>
                    <Input
                      type="number"
                      step="1"
                      value={weeklyNumber}
                      onChange={(e) => setWeeklyNumber(e.target.value)}
                      placeholder="—"
                      disabled={isPastLog}
                      className="w-14 text-right text-base font-semibold bg-transparent border-0 p-0 focus-visible:ring-0 leading-none text-muted-foreground"
                      data-testid="input-weekly-number"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Managers grid - 3 column layout on large screens */}
        <div className="mt-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Managers on Duty</div>
          <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-3">
            <div className="flex items-center gap-2 rounded-lg border border-border/[0.08] bg-background/10 px-3 py-2">
              <div className="w-16 text-xs font-semibold uppercase tracking-wide text-muted-foreground">AM</div>
              <Input
                value={amManagerName}
                onChange={(e) => setAmManagerName(e.target.value)}
                placeholder="Name"
                disabled={isPastLog}
                className="h-8 bg-background/50"
                data-testid="input-am-manager"
              />
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border/[0.08] bg-background/10 px-3 py-2">
              <div className="w-16 text-xs font-semibold uppercase tracking-wide text-muted-foreground">PM</div>
              <Input
                value={pmManagerName}
                onChange={(e) => setPmManagerName(e.target.value)}
                placeholder="Name"
                disabled={isPastLog}
                className="h-8 bg-background/50"
                data-testid="input-pm-manager"
              />
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border/[0.08] bg-background/10 px-3 py-2">
              <div className="w-16 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kitchen</div>
              <Input
                value={kitchenManagerName}
                onChange={(e) => setKitchenManagerName(e.target.value)}
                placeholder="Name"
                disabled={isPastLog}
                className="h-8 bg-background/50"
                data-testid="input-kitchen-manager"
              />
            </div>
          </div>
        </div>
        </CardContent>
      </Card>

      {/* Historical Comparison Status Card */}
      {!isPastLog && (
        <HistoricalComparisonCard
          currentDate={dateString}
          onAddHistoricalData={() => {
            setHistoricalDataOpen(true);
            setBulkImportMode("single");
          }}
          onBulkImport={() => {
            setHistoricalDataOpen(true);
            setBulkImportMode("bulk");
          }}
        />
      )}

      {/* Sales Data */}
      <SalesInput
        title="Daily Sales"
        salesData={salesData}
        onSalesChange={handleSalesChange}
        showComparison={true}
        disabled={isPastLog}
        comparisonPeriod={comparisonPeriod}
        onComparisonPeriodChange={setComparisonPeriod}
        comparisonDate={comparisonPeriod === "last_week" ? format(lastWeekDate, 'EEEE, MMM d, yyyy') : format(lastYearDate, 'EEEE, MMM d, yyyy')}
        onAddHistoricalData={() => setHistoricalDataOpen(true)}
      />


      {/* Operational Notes (was Sales Notes) */}
      <Card data-testid="card-sales-notes">
        <CardHeader>
          <CardTitle className="text-lg">Operational Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={salesNotes}
            onChange={(e) => setSalesNotes(e.target.value)}
            placeholder="Enter notes about sales performance, promotions, special events..."
            className="min-h-24"
            disabled={isPastLog}
            data-testid="textarea-sales-notes"
          />
          <div className="border-t pt-4">
            <NotePhotos
              logId={existingLogId}
              noteType="operational"
              disabled={isPastLog}
              currentDate={dateString}
              onLogCreated={(id) => setExistingLogId(id)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Running Maintenance List - Collapsible */}
      <Collapsible open={maintenanceOpen} onOpenChange={setMaintenanceOpen}>
        <Card data-testid="card-maintenance">
          <CollapsibleTrigger asChild>
            <CardHeader className="flex flex-row items-center justify-between gap-2 cursor-pointer hover-elevate rounded-t-lg">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Wrench className="h-5 w-5" />
                  Running Maintenance List
                  {runningItems && runningItems.filter(i => i.status === 'open').length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {runningItems.filter(i => i.status === 'open').length} open
                    </Badge>
                  )}
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                  Showing all open items · oldest to newest
                </span>
              </div>
              <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${maintenanceOpen ? 'rotate-180' : ''}`} />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
          {/* Add New Maintenance Item Form - only show for today/future */}
          {!isPastLog && (
            <div className="pb-4 border-b space-y-3">
              {/* TOP ROW: Description, Status, Photo, Add Item */}
              <div className="flex flex-wrap gap-3 items-end">
                {/* Description */}
                <div className="flex-1 min-w-[240px]">
                  <Label htmlFor="maintenance-description" className="text-xs mb-1 block">Description</Label>
                  <Input
                    id="maintenance-description"
                    value={newMaintenanceDescription}
                    onChange={(e) => setNewMaintenanceDescription(e.target.value)}
                    placeholder="Enter maintenance item description"
                    data-testid="input-maintenance-description"
                  />
                </div>

                {/* Status */}
                <div className="w-[160px]">
                  <Label htmlFor="maintenance-status" className="text-xs mb-1 block">Status</Label>
                  <Select 
                    value={newMaintenanceStatus} 
                    onValueChange={(value: "open" | "completed") => setNewMaintenanceStatus(value)}
                  >
                    <SelectTrigger data-testid="select-maintenance-status">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Photo */}
                <div className="w-[220px]">
                  <Label className="text-xs mb-1 block">Photo</Label>
                  <input
                    ref={maintenancePhotoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleMaintenancePhotoChange}
                    className="hidden"
                    id="maintenance-photo-input"
                    data-testid="input-maintenance-photo"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => maintenancePhotoInputRef.current?.click()}
                      className="flex items-center gap-1"
                    >
                      <Camera className="h-3 w-3" />
                      {newMaintenancePhotoPreview ? "Change Photo" : "Add Photo"}
                    </Button>
                    {newMaintenancePhotoPreview && (
                      <div className="flex items-center gap-2">
                        <img
                          src={newMaintenancePhotoPreview}
                          alt="Preview"
                          className="h-9 w-9 rounded-md object-cover border cursor-pointer hover:ring-2 hover:ring-primary"
                          onClick={() => setPhotoLightboxSrc(newMaintenancePhotoPreview)}
                        />
                        <button
                          type="button"
                          onClick={clearMaintenancePhoto}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Add Item Button */}
                <div className="w-[140px]">
                  <Button
                    type="button"
                    onClick={handleAddMaintenanceItem}
                    disabled={addMaintenanceMutation.isPending || !newMaintenanceDescription.trim()}
                    className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                    data-testid="button-add-maintenance"
                  >
                    {addMaintenanceMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-1" />
                        Add Item
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* NOTES ROW: full width */}
              <div>
                <Label htmlFor="maintenance-notes" className="text-xs mb-1 block">Notes</Label>
                <Textarea
                  id="maintenance-notes"
                  value={newMaintenanceNotes}
                  onChange={(e) => setNewMaintenanceNotes(e.target.value)}
                  placeholder="Additional notes..."
                  className="min-h-24"
                  data-testid="textarea-maintenance-notes"
                />
              </div>

              {/* Hint when no log saved */}
              {!existingLogId && (
                <p className="text-xs text-muted-foreground">
                  First maintenance item will automatically create today's log entry.
                </p>
              )}
            </div>
          )}

          {/* Running Maintenance Items List - Open items + completed today */}
          <MaintenanceItemsTable
            items={runningItems || []}
            isLoading={isLoadingRunning}
            showDateAdded={true}
            showPhoto={true}
            showActions={true}
            onToggleStatus={async (itemId, newStatus) => {
              const res = await fetch(`${apiBaseUrl}/api/maintenance-items/${itemId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
              });
              if (res.ok) {
                refetchRunning();
                queryClient.invalidateQueries({ queryKey: ['/api/manager-logs', existingLogId, 'maintenance', clubId] });
              }
            }}
            onUploadPhoto={async (itemId, file) => {
              const formData = new FormData();
              formData.append("photo", file);
              const res = await fetch(`${apiBaseUrl}/api/maintenance/${itemId}/photo`, {
                method: "POST",
                body: formData,
              });
              if (res.ok) {
                refetchRunning();
                queryClient.invalidateQueries({ queryKey: ['/api/manager-logs', existingLogId, 'maintenance', clubId] });
              }
            }}
            emptyMessage="No open maintenance items. Nice work!"
          />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 mt-4">
        <Button
          type="button"
          onClick={() => setShowEmailModal(true)}
          className="bg-teal-600 text-white hover:bg-teal-700"
          data-testid="button-email-log"
        >
          <Mail className="h-4 w-4 mr-2" />
          Email Team
        </Button>
        {!isPastLog && (
          <button 
            type="submit" 
            disabled={isLoading}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-submit"
          >
            {saveLogMutation.isPending ? "Saving..." : "Save Log Entry"}
          </button>
        )}
      </div>

        {/* Email Team Modal */}
        <EmailLogModal
          open={showEmailModal}
          onOpenChange={setShowEmailModal}
          clubId={clubId}
          logId={existingLogId}
          logDateISO={format(date, 'yyyy-MM-dd')}
          managerName={amManagerName || pmManagerName || defaultManagerName}
        />
        
        {/* Historical Data Dialog */}
        <Dialog open={historicalDataOpen} onOpenChange={setHistoricalDataOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Historical Sales Data</DialogTitle>
              <DialogDescription>
                Enter sales data for past dates to enable comparison features.
              </DialogDescription>
            </DialogHeader>
            
            <Tabs value={bulkImportMode} onValueChange={(v) => setBulkImportMode(v as "single" | "bulk")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="single">Single Entry</TabsTrigger>
                <TabsTrigger value="bulk">Bulk Import</TabsTrigger>
              </TabsList>
              
              <TabsContent value="single" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !historicalDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {historicalDate ? format(historicalDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={historicalDate} onSelect={setHistoricalDate} disabled={(date) => date > new Date()} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Food Sales</Label>
                    <Input type="number" placeholder="0.00" value={historicalFoodSales} onChange={(e) => setHistoricalFoodSales(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Bar Sales</Label>
                    <Input type="number" placeholder="0.00" value={historicalBarSales} onChange={(e) => setHistoricalBarSales(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Gaming Sales</Label>
                    <Input type="number" placeholder="0.00" value={historicalGamingSales} onChange={(e) => setHistoricalGamingSales(e.target.value)} />
                  </div>
                </div>
                <Button
                  type="button"
                  className="w-full"
                  disabled={!historicalDate || saveHistoricalMutation.isPending}
                  onClick={() => {
                    if (historicalDate) {
                      saveHistoricalMutation.mutate({
                        logDate: format(historicalDate, 'yyyy-MM-dd'),
                        dayOfWeek: historicalDate.toLocaleDateString('en-US', { weekday: 'long' }),
                        foodSales: historicalFoodSales || "0",
                        barSales: historicalBarSales || "0",
                        gamingSales: historicalGamingSales || "0",
                      });
                    }
                  }}
                >
                  {saveHistoricalMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save Historical Data"}
                </Button>
              </TabsContent>
              
              <TabsContent value="bulk" className="space-y-4 pt-4">
                {/* CSV Format Instructions */}
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">Required CSV Format</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const sampleCsv = `date,food_sales,bar_sales,gaming_sales
2025-01-01,1500.00,2000.00,500.00
2025-01-02,1650.00,2100.00,475.00
2025-01-03,1400.00,1850.00,525.00`;
                        const blob = new Blob([sampleCsv], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'sample_historical_sales.csv';
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Sample CSV
                    </Button>
                  </div>
                  <div className="bg-background rounded border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Date</th>
                          <th className="px-3 py-2 text-left font-medium">Food Sales</th>
                          <th className="px-3 py-2 text-left font-medium">Bar Sales</th>
                          <th className="px-3 py-2 text-left font-medium">Gaming Sales</th>
                        </tr>
                      </thead>
                      <tbody className="text-muted-foreground">
                        <tr className="border-t border-muted">
                          <td className="px-3 py-1.5">2025-01-01</td>
                          <td className="px-3 py-1.5">1500.00</td>
                          <td className="px-3 py-1.5">2000.00</td>
                          <td className="px-3 py-1.5">500.00</td>
                        </tr>
                        <tr className="border-t border-muted">
                          <td className="px-3 py-1.5">2025-01-02</td>
                          <td className="px-3 py-1.5">1650.00</td>
                          <td className="px-3 py-1.5">2100.00</td>
                          <td className="px-3 py-1.5">475.00</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      Date format: YYYY-MM-DD
                    </span>
                    <span className="flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      Numbers only, no $ symbols
                    </span>
                  </div>
                </div>
                
                {/* File Upload */}
                <div className="space-y-2">
                  <Label>Upload CSV File</Label>
                  <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                    <input type="file" accept=".csv,.txt" onChange={handleCsvFileChange} className="hidden" id="csv-upload-form" />
                    <label htmlFor="csv-upload-form" className="cursor-pointer">
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Click to upload or drag and drop</p>
                      <p className="text-xs text-muted-foreground mt-1">CSV or TXT file</p>
                    </label>
                  </div>
                </div>
                
                {csvParseError && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4" />
                    {csvParseError}
                  </div>
                )}
                
                {csvPreviewData.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Preview ({csvPreviewData.length} rows)</Label>
                      <Button type="button" variant="ghost" size="sm" onClick={clearBulkImport}>Clear</Button>
                    </div>
                    <div className="max-h-40 overflow-auto border rounded">
                      <table className="w-full text-xs">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="px-2 py-1 text-left">Date</th>
                            <th className="px-2 py-1 text-left">Food</th>
                            <th className="px-2 py-1 text-left">Bar</th>
                            <th className="px-2 py-1 text-left">Gaming</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvPreviewData.slice(0, 10).map((row, i) => (
                            <tr key={i} className={row.error ? "bg-destructive/10" : ""}>
                              <td className="px-2 py-1">{row.date}</td>
                              <td className="px-2 py-1">${row.foodSales.toFixed(2)}</td>
                              <td className="px-2 py-1">${row.barSales.toFixed(2)}</td>
                              <td className="px-2 py-1">${row.gamingSales.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                
                {bulkImportResult && (
                  <div className={`p-3 rounded-lg text-sm ${bulkImportResult.failed === 0 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    <p className="font-medium">{bulkImportResult.success} records imported successfully{bulkImportResult.failed > 0 && `, ${bulkImportResult.failed} failed`}</p>
                  </div>
                )}
                
                <Button
                  type="button"
                  className="w-full"
                  disabled={csvPreviewData.filter(r => !r.error).length === 0 || bulkImportMutation.isPending}
                  onClick={() => bulkImportMutation.mutate(csvPreviewData.filter(r => !r.error))}
                >
                  {bulkImportMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</> : <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import {csvPreviewData.filter(r => !r.error).length} Records
                  </>}
                </Button>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>

        {/* Photo Lightbox Modal */}
        <Dialog open={!!photoLightboxSrc} onOpenChange={(open) => !open && setPhotoLightboxSrc(null)}>
          <DialogContent className="max-w-3xl p-2 bg-black/90 border-none">
            {photoLightboxSrc && (
              <img
                src={photoLightboxSrc}
                alt="Full size preview"
                className="max-h-[85vh] max-w-full mx-auto rounded-lg object-contain"
              />
            )}
          </DialogContent>
        </Dialog>
    </form>
  );
}
