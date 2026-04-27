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
import { format, subDays } from "date-fns";
import { CalendarIcon, Save, Loader2, Plus, Wrench, CheckCircle, AlertCircle, Mail, ChevronDown, Camera, X, Download, Info, Circle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import WeatherCard from "./WeatherCard";
import WeatherWide from "./WeatherWide";
import SalesInput from "./SalesInput";
import { NotePhotos } from "./NotePhotos";
import { MaintenanceItemsTable } from "./MaintenanceItemsTable";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ManagerLog, MaintenanceItem } from "@shared/schema";
import { useManagerLog, buildApiUrl } from "@/contexts/ManagerLogContext";

interface EmailModalData {
  logId: number | null;
  logDateISO: string;
  managerName: string;
}

interface ManagerLogFormProps {
  onSubmit: (data: any) => void;
  showEmailModal?: boolean;
  onEmailModalChange?: (open: boolean) => void;
  onEmailDataChange?: (data: EmailModalData) => void;
}

interface WeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  description: string;
}

export default function ManagerLogForm({ onSubmit, showEmailModal: showEmailModalProp, onEmailModalChange, onEmailDataChange }: ManagerLogFormProps) {
  const { clubId, managerName: defaultManagerName, apiBaseUrl } = useManagerLog();
  const [date, setDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  
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
  
  const [newMaintenanceDescription, setNewMaintenanceDescription] = useState("");
  const [newMaintenanceStatus, setNewMaintenanceStatus] = useState<"open" | "completed">("open");
  const [newMaintenanceNotes, setNewMaintenanceNotes] = useState("");
  const [newMaintenancePhoto, setNewMaintenancePhoto] = useState<File | null>(null);
  const [newMaintenancePhotoPreview, setNewMaintenancePhotoPreview] = useState<string | null>(null);
  const maintenancePhotoInputRef = useRef<HTMLInputElement>(null);
  
  // Email modal state — lifted to parent when props are provided; local fallback otherwise
  const [localShowEmailModal, setLocalShowEmailModal] = useState(false);
  const showEmailModal = showEmailModalProp !== undefined ? showEmailModalProp : localShowEmailModal;
  const setShowEmailModal = (open: boolean) => {
    setLocalShowEmailModal(open);
    onEmailModalChange?.(open);
  };
  
  // Collapsible state for sections
  const [salesOpen, setSalesOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(true);
  
  // Photo lightbox state
  const [photoLightboxSrc, setPhotoLightboxSrc] = useState<string | null>(null);
  
  // Auto-save state
  type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingFromServerRef = useRef(false);
  const hasFormDataRef = useRef(false);
  
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // --- Weather location: zip code is required (gate ensures it is always set) ---
  // Backend resolves zip → coordinates internally; no frontend geocoding needed.

  // Fetch club settings to know when zip is ready (gate ensures it will be non-null)
  const { data: clubSettings, isLoading: isSettingsLoading } = useQuery<{ weatherZipCode: string | null }>({
    queryKey: ['/api/club-settings', clubId],
    queryFn: async () => {
      const url = buildApiUrl('/api/club-settings', clubId, apiBaseUrl);
      const res = await fetch(url);
      if (!res.ok) return { weatherZipCode: null };
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });
  const zipReady = !isSettingsLoading && !!clubSettings?.weatherZipCode?.trim();
  const locationLoading = isSettingsLoading;
  const locationError: string | null = null;

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
  const yesterdayLocal = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const isPastLog = dateString < yesterdayLocal;

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

  interface BudgetData {
    foodSales: string;
    barSales: string;
    gamingSales: string;
  }

  const { data: budgetData } = useQuery<BudgetData>({
    queryKey: ['/api/club-budget', clubId],
    queryFn: async () => {
      const url = buildApiUrl('/api/club-budget', clubId, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch budget');
      return response.json();
    },
  });

  const budgetMutation = useMutation({
    mutationFn: async (budget: BudgetData) => {
      const url = buildApiUrl('/api/club-budget', clubId, apiBaseUrl);
      const response = await apiRequest("PUT", url, budget);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/club-budget', clubId] });
      toast({ title: "Budget saved", description: "Daily budget targets have been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save budget.", variant: "destructive" });
    },
  });

  const hasLastWeekData = !!lastWeekLog;

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

  // Fetch historical status for year-over-year comparison
  interface HistoricalStatusResponse {
    currentDate: string;
    compareDate: string;
    hasHistoricalData: boolean;
  }

  const { data: historicalStatus } = useQuery<HistoricalStatusResponse>({
    queryKey: ['/api/historical-status', clubId, dateString],
    queryFn: async () => {
      const baseUrl = buildApiUrl('/api/historical-status', clubId, apiBaseUrl);
      const url = `${baseUrl}&date=${dateString}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch historical status');
      }
      return response.json();
    },
    enabled: !!clubId && !!dateString && !isPastLog,
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
    isLoadingFromServerRef.current = true;
    if (existingLog) {
      setExistingLogId(existingLog.id);
      setAmManagerName(existingLog.amManagerName || "");
      setPmManagerName(existingLog.pmManagerName || "");
      setKitchenManagerName(existingLog.kitchenManagerName || "");
      setDailyNotes(existingLog.dailyNotes || "");
      setSalesNotes(existingLog.salesNotes || "");
      setDailyNumber(existingLog.dailyNumber ? String(parseInt(existingLog.dailyNumber, 10)) : "");
      setWeeklyNumber(existingLog.weeklyNumber ? String(parseInt(existingLog.weeklyNumber, 10)) : "");
      setSalesData({
        current: {
          food: existingLog.foodSales ? parseFloat(existingLog.foodSales).toString() : "",
          bar: existingLog.barSales ? parseFloat(existingLog.barSales).toString() : "",
          gaming: existingLog.gamingSales ? parseFloat(existingLog.gamingSales).toString() : ""
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
      hasFormDataRef.current = true;
      setSaveStatus('saved');
    } else {
      setExistingLogId(null);
      resetForm();
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
      hasFormDataRef.current = false;
      setSaveStatus('idle');
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isLoadingFromServerRef.current = false;
      });
    });
  }, [existingLog, comparisonLog, lastWeekLog, dateString]);

  useEffect(() => {
    // Wait for club settings to load and zip to be confirmed
    if (locationLoading || !zipReady) {
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
      
      // Helper to build URL with clubId; backend resolves location from stored zip
      const buildUrl = (base: string, params?: Record<string, string>): string => {
        const url = new URL(base, window.location.origin);
        url.searchParams.set('clubId', clubId);
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            if (value) url.searchParams.set(key, value);
          });
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
  }, [dateString, toast, apiBaseUrl, clubId, zipReady, locationLoading]);

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
      setSaveStatus('saved');
      queryClient.invalidateQueries({ queryKey: ['/api/manager-logs', clubId] });
      queryClient.invalidateQueries({ queryKey: ['/api/manager-logs/by-date', dateString, clubId] });
      setExistingLogId(data.id);
      
      onSubmit(data);
    },
    onError: (error: any) => {
      console.error('Failed to save log entry:', error);
      setSaveStatus('error');
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

  const performAutoSave = useCallback(() => {
    if (isPastLog) return;
    
    const primaryManager = amManagerName.trim() || pmManagerName.trim() || kitchenManagerName.trim();
    if (!primaryManager) return;
    
    const food = parseFloat(salesData.current.food) || 0;
    const bar = parseFloat(salesData.current.bar) || 0;
    const gaming = parseFloat(salesData.current.gaming) || 0;
    const total = food + bar + gaming;
    
    const logData = {
      logDate: dateString,
      dayOfWeek: getDayOfWeek(date),
      managerName: primaryManager,
      amManagerName: amManagerName.trim() || null,
      pmManagerName: pmManagerName.trim() || null,
      kitchenManagerName: kitchenManagerName.trim() || null,
      weather: weatherData.current ? formatWeatherString(weatherData.current) : null,
      weatherLastYear: weatherData.historical ? formatWeatherString(weatherData.historical) : null,
      foodSales: salesData.current.food || null,
      barSales: salesData.current.bar || null,
      gamingSales: salesData.current.gaming || null,
      totalSales: total > 0 ? total.toFixed(2) : null,
      salesNotes: salesNotes.trim() || null,
      dailyNumber: dailyNumber || null,
      weeklyNumber: weeklyNumber || null,
      dailyNotes: dailyNotes.trim() || null
    };

    setSaveStatus('saving');
    saveLogMutation.mutate(logData);
  }, [isPastLog, amManagerName, pmManagerName, kitchenManagerName, salesData.current, dailyNotes, salesNotes, dailyNumber, weeklyNumber, dateString, date, weatherData]);

  const triggerAutoSave = useCallback(() => {
    if (isPastLog || isLoadingFromServerRef.current) return;
    
    setSaveStatus(prev => prev === 'saving' ? prev : 'unsaved');
    
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave();
    }, 2000);
  }, [isPastLog, performAutoSave]);

  useEffect(() => {
    if (isLoadingFromServerRef.current || isPastLog) return;
    if (!hasFormDataRef.current) {
      const hasAnyContent = amManagerName.trim() || pmManagerName.trim() || kitchenManagerName.trim() ||
        salesData.current.food || salesData.current.bar || salesData.current.gaming ||
        dailyNotes.trim() || salesNotes.trim() || dailyNumber || weeklyNumber;
      if (hasAnyContent) {
        hasFormDataRef.current = true;
      }
    }
    if (hasFormDataRef.current) {
      triggerAutoSave();
    }
  }, [amManagerName, pmManagerName, kitchenManagerName, salesData.current.food, salesData.current.bar, salesData.current.gaming, dailyNotes, salesNotes, dailyNumber, weeklyNumber]);

  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    if (isPastLog) {
      setSaveStatus('idle');
    }
  }, [isPastLog]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // Sync email-modal data to the parent so EmailLogModal can be rendered at the app-shell level
  useEffect(() => {
    onEmailDataChange?.({
      logId: existingLogId,
      logDateISO: dateString,
      managerName: amManagerName || pmManagerName || defaultManagerName || '',
    });
  }, [existingLogId, dateString, amManagerName, pmManagerName, defaultManagerName]);

  const calculateTotalSales = (): string => {
    const food = parseFloat(salesData.current.food) || 0;
    const bar = parseFloat(salesData.current.bar) || 0;
    const gaming = parseFloat(salesData.current.gaming) || 0;
    const total = food + bar + gaming;
    return total > 0 ? total.toFixed(2) : "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    
    const hasManager = amManagerName.trim() || pmManagerName.trim() || kitchenManagerName.trim();
    if (!hasManager) {
      toast({
        title: "Validation Error",
        description: "At least one manager name is required.",
        variant: "destructive"
      });
      return;
    }
    
    const primaryManager = amManagerName.trim() || pmManagerName.trim() || kitchenManagerName.trim();
    
    const logData = {
      logDate: dateString,
      dayOfWeek: getDayOfWeek(date),
      managerName: primaryManager,
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

    setSaveStatus('saving');
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

      {/* Sales Data */}
      <SalesInput
        title="Daily Sales"
        salesData={salesData}
        onSalesChange={handleSalesChange}
        showComparison={true}
        disabled={isPastLog}
        comparisonDate={format(lastYearDate, 'EEEE, MMM d, yyyy')}
        hasHistoricalData={historicalStatus?.hasHistoricalData}
        historicalCompareDate={historicalStatus?.compareDate}
        clubId={clubId}
        apiBaseUrl={apiBaseUrl}
        budget={budgetData}
        onBudgetSave={(b) => budgetMutation.mutate(b)}
        hasLastWeekData={hasLastWeekData}
        collapsible={true}
        isOpen={salesOpen}
        onOpenChange={setSalesOpen}
      />


      {/* Operational Notes (was Sales Notes) */}
      <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
        <Card data-testid="card-sales-notes">
          <CollapsibleTrigger asChild>
            <CardHeader className="flex flex-row items-center justify-between gap-2 cursor-pointer hover-elevate rounded-t-lg">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-lg">Operational Notes</CardTitle>
                {!notesOpen && (
                  <span className="text-xs text-muted-foreground font-normal">
                    {salesNotes.trim() ? salesNotes.trim().slice(0, 60) + (salesNotes.trim().length > 60 ? '…' : '') : 'No notes'}
                  </span>
                )}
              </div>
              <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 flex-shrink-0 ${notesOpen ? 'rotate-180' : ''}`} />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
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
          </CollapsibleContent>
        </Card>
      </Collapsible>

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
      <div className="flex items-center justify-end gap-3 mt-4 flex-wrap">
        {!isPastLog && (
          <div className="flex items-center gap-2 mr-auto" data-testid="save-status-indicator">
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                Saved
              </span>
            )}
            {saveStatus === 'unsaved' && (
              <span className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                <Circle className="h-4 w-4" />
                Unsaved changes
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                Save failed
              </span>
            )}
          </div>
        )}
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
