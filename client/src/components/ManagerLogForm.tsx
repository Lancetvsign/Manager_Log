import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { CalendarIcon, Save, Loader2, Plus, Wrench, CheckCircle, AlertCircle, Mail, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import WeatherCard from "./WeatherCard";
import WeatherWide from "./WeatherWide";
import SalesInput from "./SalesInput";
import EmailLogModal from "./EmailLogModal";
import { NotePhotos } from "./NotePhotos";
import { MaintenanceItemsTable } from "./MaintenanceItemsTable";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ManagerLog, MaintenanceItem } from "@shared/schema";
import { useManagerLog, buildApiUrl } from "@/contexts/ManagerLogContext";

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
  
  // Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  
  // Collapsible state for maintenance list
  const [maintenanceOpen, setMaintenanceOpen] = useState(true);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
    /**
     * Fetches weather data with fallback strategy for historical weather.
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
        // Fetch current weather
        const currentWeather = await fetchWeather(`${apiBaseUrl}/api/weather/current`);

        // STEP 1: Try historical weather for 52 weeks ago (same day of week)
        let historicalWeather = await fetchWeather(`${apiBaseUrl}/api/weather/historical?date=${dateString}`);
        let fallbackNote: string | null = null;

        // STEP 2: If first attempt returned server fallback, try 365 days ago (1 day before 52 weeks)
        if (isServerFallback(historicalWeather)) {
          const selectedDate = new Date(dateString + 'T00:00:00');
          // Use 52 weeks (364 days) - 1 day for fallback (same day of week, 1 day earlier)
          const fallbackDate = new Date(selectedDate);
          fallbackDate.setDate(fallbackDate.getDate() - 365); // 364 - 1 = 365 days back
          const fallbackDateString = format(fallbackDate, 'yyyy-MM-dd');
          
          const previousDayWeather = await fetchWeather(`${apiBaseUrl}/api/weather/historical?date=${fallbackDateString}`);
          
          if (!isServerFallback(previousDayWeather)) {
            // Successfully got real data from the previous day
            historicalWeather = previousDayWeather;
            fallbackNote = `Data from ${format(fallbackDate, 'MMM d, yyyy')} (previous day)`;
          }
        }

        // STEP 3: If both historical attempts returned server fallback, use current weather
        if (isServerFallback(historicalWeather) && currentWeather && !isServerFallback(currentWeather)) {
          historicalWeather = currentWeather;
          fallbackNote = "Using current weather as fallback";
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
  }, [dateString, toast, apiBaseUrl]);

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
    mutationFn: async (itemData: { managerLogId: number; description: string; status: string; notes?: string }) => {
      const response = await fetch(`${apiBaseUrl}/api/maintenance-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData)
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
        notes: newMaintenanceNotes.trim() || undefined
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
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Weather</div>
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
                    title="Last Year"
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
        comparisonPeriod={comparisonPeriod}
        onComparisonPeriodChange={setComparisonPeriod}
        comparisonDate={comparisonPeriod === "last_week" ? format(lastWeekDate, 'EEEE, MMM d, yyyy') : format(lastYearDate, 'EEEE, MMM d, yyyy')}
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
            <div className="flex items-start gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEmailModal(true)}
                className="bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-white dark:text-gray-700 dark:border-gray-300 dark:hover:bg-gray-100"
                data-testid="button-email-log-operational"
              >
                <Mail className="h-4 w-4 mr-2" />
                Email Team
              </Button>
              <div className="flex-1">
                <NotePhotos
                  logId={existingLogId}
                  noteType="operational"
                  disabled={isPastLog}
                  currentDate={dateString}
                  onLogCreated={(id) => setExistingLogId(id)}
                />
              </div>
            </div>
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
            <div className="pb-4 border-b">
              <h4 className="text-base font-medium mb-4">Add New Maintenance Item</h4>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <div className="md:col-span-2 space-y-1.5">
                  <Label htmlFor="maintenance-description" className="text-sm">Description</Label>
                  <Input
                    id="maintenance-description"
                    value={newMaintenanceDescription}
                    onChange={(e) => setNewMaintenanceDescription(e.target.value)}
                    placeholder="Enter maintenance item description"
                    className="h-10"
                    data-testid="input-maintenance-description"
                  />
                </div>
                <div className="md:col-span-1 space-y-1.5">
                  <Label htmlFor="maintenance-status" className="text-sm">Status</Label>
                  <Select 
                    value={newMaintenanceStatus} 
                    onValueChange={(value: "open" | "completed") => setNewMaintenanceStatus(value)}
                  >
                    <SelectTrigger className="h-10" data-testid="select-maintenance-status">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-3 space-y-1.5">
                  <Label htmlFor="maintenance-notes" className="text-sm">Notes</Label>
                  <Textarea
                    id="maintenance-notes"
                    value={newMaintenanceNotes}
                    onChange={(e) => setNewMaintenanceNotes(e.target.value)}
                    placeholder="Additional notes..."
                    className="min-h-[46px] resize-none"
                    data-testid="textarea-maintenance-notes"
                  />
                </div>
              </div>
              <div className="mt-5">
                <Button
                  type="button"
                  onClick={handleAddMaintenanceItem}
                  disabled={addMaintenanceMutation.isPending || !newMaintenanceDescription.trim()}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                  data-testid="button-add-maintenance"
                >
                  {addMaintenanceMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Item
                    </>
                  )}
                </Button>
              </div>
              {/* Hint when no log saved */}
              {!existingLogId && (
                <p className="text-xs text-muted-foreground mt-2">
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
    </form>
  );
}
