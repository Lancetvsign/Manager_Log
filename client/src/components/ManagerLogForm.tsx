import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { CalendarIcon, Save, Loader2, Plus, Wrench, CheckCircle, AlertCircle, Mail, ChevronRight, Camera, ExternalLink, Sun, Cloud } from "lucide-react";
import WeatherCard from "./WeatherCard";
import WeatherWide from "./WeatherWide";
import SalesInput from "./SalesInput";
import { NotificationSettingsPanel } from "./NotificationSettingsPanel";
import EscalationRulesModal from "./EscalationRulesModal";
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
    lastYear: { food: "", bar: "", gaming: "" }
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
  
  // Email notification state
  const [notifyReason, setNotifyReason] = useState<"Maintenance" | "Behavior" | "Other">("Maintenance");
  const [notifyListIds, setNotifyListIds] = useState<number[]>([]);
  const [notifySubject, setNotifySubject] = useState("");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  
  // Notification history type
  interface NotificationHistoryItem {
    id: number;
    reason: string;
    subject: string;
    createdAt: string;
    simulated: boolean;
    recipientCount: number;
  }
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const dateString = format(date, 'yyyy-MM-dd');
  
  // Calculate comparison date: 52 weeks (364 days) before selected date for year-over-year comparison
  const comparisonDate = new Date(date);
  comparisonDate.setDate(comparisonDate.getDate() - 364);
  const comparisonDateString = format(comparisonDate, 'yyyy-MM-dd');
  
  // Check if viewing a past log (read-only mode)
  const todayIso = new Date().toISOString().slice(0, 10);
  const isPastLog = dateString < todayIso;

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
  }

  // Fetch all open maintenance items for this club (oldest to newest)
  const { data: runningItems, isLoading: isLoadingRunning, refetch: refetchRunning } = useQuery<RunningMaintenanceItem[]>({
    queryKey: ['/api/maintenance/open', clubId],
    queryFn: async () => {
      const url = buildApiUrl('/api/maintenance/open', clubId, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch running maintenance items');
      return response.json();
    },
    enabled: !!clubId,
  });

  // Check if email notifications are configured
  const { data: emailStatus } = useQuery<{ configured: boolean }>({
    queryKey: ['/api/notifications/status'],
    queryFn: async () => {
      const response = await fetch(`${apiBaseUrl}/api/notifications/status`);
      if (!response.ok) return { configured: false };
      return response.json();
    },
  });

  const isEmailConfigured = emailStatus?.configured ?? false;

  // Notification list type
  interface NotificationList {
    id: number;
    clubId: string;
    name: string;
    description: string | null;
    isDefault: boolean;
    recipientCount: number;
  }

  // Fetch notification lists (always fetch so notification section works even in simulation mode)
  const { data: notificationLists } = useQuery<NotificationList[]>({
    queryKey: ['/api/notifications/lists', clubId],
    queryFn: async () => {
      const response = await fetch(`${apiBaseUrl}/api/notifications/lists?clubId=${clubId}`);
      if (!response.ok) return [];
      return response.json();
    },
  });

  // Fetch notification history for this log
  const { data: notificationHistory, refetch: refetchHistory } = useQuery<NotificationHistoryItem[]>({
    queryKey: ['/api/logs', existingLogId, 'notifications'],
    queryFn: async () => {
      const response = await fetch(`${apiBaseUrl}/api/logs/${existingLogId}/notifications`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!existingLogId,
  });

  // Notification list selection toggle
  const handleToggleList = (listId: number) => {
    setNotifyListIds(prev => 
      prev.includes(listId) 
        ? prev.filter(id => id !== listId)
        : [...prev, listId]
    );
  };

  // Initialize default notification lists when data loads
  useEffect(() => {
    if (notificationLists && notificationLists.length && notifyListIds.length === 0) {
      // Auto-select default(s), fallback to first list if none marked default
      const defaultIds = notificationLists
        .filter((l) => l.isDefault)
        .map((l) => l.id);
      setNotifyListIds(defaultIds.length ? defaultIds : [notificationLists[0].id]);
    }
  }, [notificationLists]);

  // Update default subject and message when form data changes
  useEffect(() => {
    const formattedDate = format(date, 'MMMM d, yyyy');
    const managerSummary = [amManagerName, pmManagerName, kitchenManagerName].filter(Boolean).join(', ') || 'Not specified';
    setNotifySubject(`[Club] ${formattedDate} - Urgent ${notifyReason.toLowerCase()}`);
    setNotifyMessage(`Date: ${formattedDate}
Manager(s): ${managerSummary}

Summary:
- Sales notes: ${salesNotes || 'N/A'}
- Daily notes: ${dailyNotes || 'N/A'}

Details:
[Add any extra details here...]`);
  }, [date, amManagerName, pmManagerName, kitchenManagerName, salesNotes, dailyNotes, notifyReason]);

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
      throw new Error("Could not create daily log for notification.");
    }

    const data = await res.json();
    setExistingLogId(data.logId);
    return data.logId;
  };

  // Send notification email
  const sendNotificationEmail = async (logId: number) => {
    if (notifyListIds.length === 0) return;
    
    setIsSending(true);
    setSendResult(null);
    
    try {
      const response = await fetch(`${apiBaseUrl}/api/logs/${logId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: notifyReason,
          listIds: notifyListIds,
          subject: notifySubject,
          message: notifyMessage,
          clubId,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        setSendResult(data.error || "Failed to process notification.");
        toast({
          title: "Notification Failed",
          description: data.error || "Failed to send notification.",
          variant: "destructive"
        });
        return;
      }
      
      const modeText = data.simulated
        ? " (simulation only – email server not configured yet)"
        : "";
      
      setSendResult(`Notification saved for ${data.sentTo} recipient(s)${modeText}.`);
      toast({
        title: data.simulated ? "Notification Saved" : "Notification Sent",
        description: `Saved for ${data.sentTo} recipient(s)${modeText}`,
      });
      
      // Reload history after sending
      refetchHistory();
    } catch (error) {
      setSendResult("Failed to process notification.");
      toast({
        title: "Notification Error",
        description: "Failed to send notification email.",
        variant: "destructive"
      });
    } finally {
      setIsSending(false);
    }
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
        }
      });
    } else {
      setExistingLogId(null);
      resetForm();
      // Even without a current log, populate last year data for comparison
      setSalesData(prev => ({
        ...prev,
        lastYear: {
          food: comparisonLog?.foodSales || "",
          bar: comparisonLog?.barSales || "",
          gaming: comparisonLog?.gamingSales || ""
        }
      }));
    }
  }, [existingLog, comparisonLog, dateString]);

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
      queryClient.invalidateQueries({ queryKey: ['/api/maintenance/open', clubId] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/maintenance/open', clubId] });
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

  // Rollover to-do items to next day
  const rolloverMutation = useMutation({
    mutationFn: async ({ fromDate, toDate }: { fromDate: string; toDate: string }) => {
      const response = await fetch(`${apiBaseUrl}/api/maintenance-items/rollover?clubId=${clubId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromDate, toDate })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to rollover items');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      if (data.createdCount > 0) {
        toast({
          title: "Rolled Over",
          description: `${data.createdCount} open item(s) rolled to ${data.toDate}`
        });
      } else {
        toast({
          title: "No Items to Roll",
          description: "No open items to roll over.",
          variant: "default"
        });
      }
      // Invalidate both source and target dates
      queryClient.invalidateQueries({ queryKey: ['/api/manager-logs'] });
    },
    onError: (error: any) => {
      console.error('Failed to rollover items:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to rollover items.",
        variant: "destructive"
      });
    }
  });

  const handleRolloverToNextDay = () => {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const toDateString = format(nextDay, 'yyyy-MM-dd');
    rolloverMutation.mutate({ fromDate: dateString, toDate: toDateString });
  };

  // Check if there are open items that can be rolled over
  const hasOpenItems = maintenanceItems?.some(item => item.status === "open" && !item.rolledOverToDate);

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
    
    const logData = {
      logDate: dateString,
      dayOfWeek: getDayOfWeek(date),
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
      lastYear: { food: "", bar: "", gaming: "" }
    });
  };

  const handleDateChange = (newDate: Date | undefined) => {
    if (newDate) {
      setDate(newDate);
    }
  };

  const isLoading = saveLogMutation.isPending || isLoadingWeather || isLoadingLog;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Header Information */}
      <div className="rounded-2xl border border-border/10 bg-card/30 p-6" data-testid="card-log-header">
        {/* Title banner */}
        <div className="flex items-baseline gap-2 flex-wrap mb-4">
          <h2 className="text-xl font-semibold">Daily Manager Log Entry</h2>
          {existingLogId && !isPastLog && (
            <span className="text-sm text-muted-foreground">(Editing)</span>
          )}
          {isPastLog && (
            <Badge variant="secondary">View Only</Badge>
          )}
        </div>
        {isPastLog && (
          <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-3 py-2 rounded-md text-sm mb-4">
            <strong>Read-only:</strong> This log is from {format(date, 'MMMM d, yyyy')} and cannot be edited.
          </div>
        )}

        {/* 3-column row: Date | Weather | Stats */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {/* Column 1: Date */}
          <div className="flex flex-col gap-3 rounded-lg border border-border/[0.08] bg-background/10 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</div>
            <div className="flex flex-wrap items-center gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-[160px] justify-start text-left font-normal h-9 bg-background/50"
                    data-testid="button-date-picker"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(date, "yyyy-MM-dd")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={handleDateChange}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-medium" data-testid="text-long-date">{format(date, 'MMMM d, yyyy')}</div>
              <div className="text-xs text-muted-foreground" data-testid="text-weekday">{getDayOfWeek(date)}</div>
            </div>
          </div>

          {/* Column 2: Weather */}
          <div className="flex flex-col gap-3 rounded-lg border border-border/[0.08] bg-background/10 px-4 py-3" data-testid="card-weather">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Weather</div>
            <div className="space-y-2">
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

          {/* Column 3: Stats */}
          <div className="flex flex-col gap-3 rounded-lg border border-border/[0.08] bg-background/10 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Daily Stats</div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-md border border-border/[0.08] bg-background/20 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Daily #</div>
                <Input
                  type="number"
                  step="1"
                  value={dailyNumber}
                  onChange={(e) => setDailyNumber(e.target.value)}
                  placeholder="—"
                  disabled={isPastLog}
                  className="h-7 w-16 text-sm font-semibold bg-transparent border-0 p-0 focus-visible:ring-0"
                  data-testid="input-daily-number"
                />
              </div>
              <div className="rounded-md border border-border/[0.08] bg-background/20 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Weekly #</div>
                <Input
                  type="number"
                  step="1"
                  value={weeklyNumber}
                  onChange={(e) => setWeeklyNumber(e.target.value)}
                  placeholder="—"
                  disabled={isPastLog}
                  className="h-7 w-16 text-sm font-semibold bg-transparent border-0 p-0 focus-visible:ring-0"
                  data-testid="input-weekly-number"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Managers grid - 3 column layout on large screens */}
        <div className="mt-6">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Managers on Duty</div>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="flex items-center gap-3 rounded-lg border border-border/[0.08] bg-background/10 px-4 py-2.5">
              <div className="w-20 text-xs font-semibold uppercase tracking-wide text-muted-foreground">AM</div>
              <Input
                value={amManagerName}
                onChange={(e) => setAmManagerName(e.target.value)}
                placeholder="Name"
                disabled={isPastLog}
                className="h-9 bg-background/50"
                data-testid="input-am-manager"
              />
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border/[0.08] bg-background/10 px-4 py-2.5">
              <div className="w-20 text-xs font-semibold uppercase tracking-wide text-muted-foreground">PM</div>
              <Input
                value={pmManagerName}
                onChange={(e) => setPmManagerName(e.target.value)}
                placeholder="Name"
                disabled={isPastLog}
                className="h-9 bg-background/50"
                data-testid="input-pm-manager"
              />
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border/[0.08] bg-background/10 px-4 py-2.5">
              <div className="w-20 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kitchen</div>
              <Input
                value={kitchenManagerName}
                onChange={(e) => setKitchenManagerName(e.target.value)}
                placeholder="Name"
                disabled={isPastLog}
                className="h-9 bg-background/50"
                data-testid="input-kitchen-manager"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Sales Data */}
      <SalesInput
        title="Daily Sales"
        salesData={salesData}
        onSalesChange={handleSalesChange}
        showComparison={true}
        disabled={isPastLog}
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
            <h4 className="text-sm font-medium mb-3">Photos</h4>
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

      {/* Running Maintenance List */}
      <Card data-testid="card-maintenance">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Running Maintenance List
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              Showing all open items · oldest to newest
            </span>
          </div>
          {hasOpenItems && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRolloverToNextDay}
              disabled={rolloverMutation.isPending}
              data-testid="button-rollover-todos"
            >
              {rolloverMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <ChevronRight className="h-4 w-4 mr-1" />
              )}
              Roll to Next Day
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Running Maintenance Items List - All Open Items */}
          <MaintenanceItemsTable
            items={runningItems || []}
            isLoading={isLoadingRunning}
            showDateAdded={true}
            showPhoto={true}
            showActions={true}
            onToggleStatus={async (itemId, currentStatus) => {
              const newStatus = currentStatus === "open" ? "completed" : "open";
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

          {/* Add New Maintenance Item Form - only show for today/future */}
          {!isPastLog && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Add New Maintenance Item</h4>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                <div className="md:col-span-2 space-y-1">
                  <Label htmlFor="maintenance-description" className="text-xs">Description</Label>
                  <Input
                    id="maintenance-description"
                    value={newMaintenanceDescription}
                    onChange={(e) => setNewMaintenanceDescription(e.target.value)}
                    placeholder="Enter maintenance item description"
                    data-testid="input-maintenance-description"
                  />
                </div>
                <div className="md:col-span-1 space-y-1">
                  <Label htmlFor="maintenance-status" className="text-xs">Status</Label>
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
                <div className="md:col-span-3 space-y-1">
                  <Label htmlFor="maintenance-notes" className="text-xs">Notes</Label>
                  <Textarea
                    id="maintenance-notes"
                    value={newMaintenanceNotes}
                    onChange={(e) => setNewMaintenanceNotes(e.target.value)}
                    placeholder="Additional notes..."
                    className="min-h-[38px] resize-none"
                    data-testid="textarea-maintenance-notes"
                  />
                </div>
              </div>
              <div className="mt-4">
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
            </div>
          )}

          {/* Hint when no log saved */}
          {!existingLogId && !isPastLog && (
            <p className="text-xs text-muted-foreground mt-2">
              First maintenance item will automatically create today's log entry.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Submit Button */}
      {!isPastLog && (
        <div className="flex justify-end mt-4">
          <button 
            type="submit" 
            disabled={isLoading}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-submit"
          >
            {saveLogMutation.isPending ? "Saving..." : "Save Log Entry"}
          </button>
        </div>
      )}

      {/* Notify Core Team Section */}
      <Card>
          <CardHeader className="flex flex-row justify-between items-center gap-2">
            <div className="flex items-center gap-2">
              <CardTitle className="mb-0">📧 Email Core Team</CardTitle>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                For urgent maintenance or operational issues
              </Badge>

              <button
                type="button"
                className="inline-flex items-center px-2 py-1 text-xs font-medium border border-emerald-600 text-emerald-700 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                onClick={() => setShowRulesModal(true)}
                data-testid="button-escalation-rules"
              >
                ⚡ Rules
              </button>
            </div>
          </CardHeader>
          
          <CardContent className="pt-0">
            <div className="space-y-4">
              {/* Reason - Radio buttons */}
              <div className="space-y-2">
                <Label>Reason</Label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="notifyReason"
                      value="Maintenance"
                      checked={notifyReason === "Maintenance"}
                      onChange={() => setNotifyReason("Maintenance")}
                      className="w-4 h-4 text-primary"
                      data-testid="radio-reason-maintenance"
                    />
                    <span className="text-sm">Maintenance issue</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="notifyReason"
                      value="Behavior"
                      checked={notifyReason === "Behavior"}
                      onChange={() => setNotifyReason("Behavior")}
                      className="w-4 h-4 text-primary"
                      data-testid="radio-reason-behavior"
                    />
                    <span className="text-sm">Operational Issue</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="notifyReason"
                      value="Other"
                      checked={notifyReason === "Other"}
                      onChange={() => setNotifyReason("Other")}
                      className="w-4 h-4 text-primary"
                      data-testid="radio-reason-other"
                    />
                    <span className="text-sm">Other urgent item</span>
                  </label>
                </div>
              </div>

              {/* Send to - Multi-select */}
              <div className="space-y-2">
                <Label htmlFor="notify-lists">Send to</Label>
                <select
                  id="notify-lists"
                  multiple
                  value={notifyListIds.map(String)}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions).map((o) =>
                      Number(o.value)
                    );
                    setNotifyListIds(values);
                  }}
                  className="w-full min-h-[80px] p-2 border rounded-md bg-background"
                  data-testid="select-notify-lists"
                >
                  {notificationLists?.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name} ({list.recipientCount} recipients)
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Hold Ctrl (Cmd on Mac) to select multiple groups.
                </p>
                <div className="text-right mt-2">
                  <button
                    type="button"
                    onClick={() => setShowNotifSettings(true)}
                    className="inline-flex items-center px-2 py-1 text-xs font-medium border border-emerald-600 text-emerald-700 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                    data-testid="button-manage-lists"
                  >
                    Manage notification lists & contacts
                  </button>
                </div>

                {showNotifSettings && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-background rounded-xl shadow-xl max-w-4xl w-full mx-4 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold">Notification Settings</h2>
                        <button
                          type="button"
                          className="text-sm text-muted-foreground hover:text-foreground"
                          onClick={() => setShowNotifSettings(false)}
                          data-testid="button-close-notif-settings"
                        >
                          Close
                        </button>
                      </div>
                      <NotificationSettingsPanel
                        clubId={clubId}
                        onChanged={() => {
                          queryClient.invalidateQueries({ queryKey: ['/api/notifications/lists', clubId] });
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Subject */}
              <div className="space-y-2">
                <Label htmlFor="notification-subject">Email subject</Label>
                <Input
                  id="notification-subject"
                  value={notifySubject}
                  onChange={(e) => setNotifySubject(e.target.value)}
                  placeholder="Email subject line"
                  data-testid="input-notification-subject"
                />
              </div>

              {/* Message */}
              <div className="space-y-2">
                <Label htmlFor="notification-message">Message</Label>
                <Textarea
                  id="notification-message"
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                  placeholder="Add details to include with the notification..."
                  className="min-h-[100px]"
                  data-testid="textarea-notification-message"
                />
                <p className="text-xs text-muted-foreground">
                  A link to this log entry will be included automatically.
                </p>
              </div>

              {/* Send button + feedback */}
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isSending || notifyListIds.length === 0}
                  onClick={async () => {
                    try {
                      const logId = await ensureLogId();
                      await sendNotificationEmail(logId);
                    } catch (error) {
                      toast({
                        title: "Error",
                        description: "Could not create daily log for notification.",
                        variant: "destructive"
                      });
                    }
                  }}
                  data-testid="button-send-notification"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Urgent Email
                    </>
                  )}
                </Button>

                {sendResult && (
                  <p className={`text-sm ${sendResult.includes('Error') || sendResult.includes('Failed') ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {sendResult}
                  </p>
                )}
              </div>

              {/* Notification History */}
              {notificationHistory && notificationHistory.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-semibold mb-2">Recent notifications</p>
                  <ul className="space-y-2 list-none p-0 m-0">
                    {notificationHistory.map((n) => (
                      <li key={n.id} className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{n.reason}</span> – {n.subject}
                        <br />
                        Sent to {n.recipientCount} recipient{n.recipientCount !== 1 ? 's' : ''} on{' '}
                        {new Date(n.createdAt).toLocaleString()}
                        {n.simulated && ' (simulation only – email server not configured yet)'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Escalation Rules Modal */}
        {showRulesModal && (
          <EscalationRulesModal
            clubId={clubId}
            onClose={() => setShowRulesModal(false)}
            onRulesChanged={() => {
              queryClient.invalidateQueries({ queryKey: ['/api/notifications/lists', clubId] });
            }}
          />
        )}
    </form>
  );
}
