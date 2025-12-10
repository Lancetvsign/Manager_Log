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
import { CalendarIcon, Save, Loader2, Plus, Wrench, CheckCircle, AlertCircle, Mail } from "lucide-react";
import WeatherCard from "./WeatherCard";
import SalesInput from "./SalesInput";
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
  const [managerName, setManagerName] = useState(defaultManagerName || "");
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
    description: string;
    isDefault: boolean;
    recipients: { id: number; name: string; email: string }[];
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
    setNotifySubject(`[Club] ${formattedDate} - Urgent ${notifyReason.toLowerCase()}`);
    setNotifyMessage(`Date: ${formattedDate}
Manager: ${managerName || 'Not specified'}

Summary:
- Sales notes: ${salesNotes || 'N/A'}
- Daily notes: ${dailyNotes || 'N/A'}

Details:
[Add any extra details here...]`);
  }, [date, managerName, salesNotes, dailyNotes, notifyReason]);

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
      
      const result = await response.json();
      
      if (result.success) {
        const simulatedNote = result.simulated ? " (simulated - SMTP not configured)" : "";
        setSendResult(`Sent to ${result.sentTo} recipient(s)${simulatedNote}`);
        toast({
          title: result.simulated ? "Notification Simulated" : "Notification Sent",
          description: `${result.simulated ? "Would send" : "Sent"} to ${result.sentTo} recipient(s)`,
        });
        // Refresh notification history
        refetchHistory();
      } else {
        setSendResult(`Error: ${result.error}`);
        toast({
          title: "Notification Failed",
          description: result.error || "Failed to send notification.",
          variant: "destructive"
        });
      }
    } catch (error) {
      setSendResult("Error: Failed to send notification");
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
      setManagerName(existingLog.managerName || "");
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
        lastYear: { food: "", bar: "", gaming: "" }
      });
    } else {
      setExistingLogId(null);
      resetForm();
    }
  }, [existingLog, dateString]);

  useEffect(() => {
    /**
     * Fetches weather data with fallback strategy for historical weather.
     * 
     * FALLBACK LOGIC FOR HISTORICAL WEATHER:
     * 1. First attempt: Try fetching weather from exactly 1 year ago (selectedDate - 1 year)
     * 2. Second attempt: If first fails or returns "unavailable", try the previous day (selectedDate - 1 year - 1 day)
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

        // STEP 1: Try historical weather for exactly 1 year ago
        let historicalWeather = await fetchWeather(`${apiBaseUrl}/api/weather/historical?date=${dateString}`);
        let fallbackNote: string | null = null;

        // STEP 2: If first attempt returned server fallback, try the previous day (1 year ago - 1 day)
        if (isServerFallback(historicalWeather)) {
          const selectedDate = new Date(dateString + 'T00:00:00');
          const fallbackDate = new Date(selectedDate);
          fallbackDate.setFullYear(fallbackDate.getFullYear() - 1);
          fallbackDate.setDate(fallbackDate.getDate() - 1);
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
    
    if (!managerName.trim()) {
      toast({
        title: "Validation Error",
        description: "Manager name is required.",
        variant: "destructive"
      });
      return;
    }
    
    const logData = {
      logDate: dateString,
      dayOfWeek: getDayOfWeek(date),
      managerName: managerName.trim(),
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

  const handleAddMaintenanceItem = () => {
    if (!newMaintenanceDescription.trim()) {
      toast({
        title: "Validation Error",
        description: "Maintenance item description is required.",
        variant: "destructive"
      });
      return;
    }

    if (!existingLogId) {
      toast({
        title: "Save Log First",
        description: "Please save the log entry before adding maintenance items.",
        variant: "destructive"
      });
      return;
    }

    addMaintenanceMutation.mutate({
      managerLogId: existingLogId,
      description: newMaintenanceDescription.trim(),
      status: newMaintenanceStatus,
      notes: newMaintenanceNotes.trim() || undefined
    });
  };

  const handleToggleMaintenanceStatus = (item: MaintenanceItem) => {
    const newStatus = item.status === "open" ? "completed" : "open";
    updateMaintenanceMutation.mutate({ id: item.id, status: newStatus });
  };

  const resetForm = () => {
    setManagerName("");
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header Information */}
      <Card data-testid="card-log-header">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            Daily Manager Log Entry
            {existingLogId && (
              <span className="text-sm font-normal text-muted-foreground">(Editing existing entry)</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Date Picker */}
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                  data-testid="button-date-picker"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(date, "PPP")}
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

          {/* Day of Week (auto-filled) */}
          <div className="space-y-2">
            <Label>Day of Week</Label>
            <Input
              value={getDayOfWeek(date)}
              readOnly
              className="bg-muted"
              data-testid="input-day-of-week"
            />
          </div>

          {/* Manager Name */}
          <div className="space-y-2">
            <Label htmlFor="manager-name">Manager Name</Label>
            <Input
              id="manager-name"
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              placeholder="Enter manager name"
              required
              data-testid="input-manager-name"
            />
          </div>
        </CardContent>
      </Card>

      {/* Weather Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoadingWeather ? (
          <Card className="col-span-full">
            <CardContent className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Loading weather data...</span>
            </CardContent>
          </Card>
        ) : (
          <>
            {weatherData.current && (
              <WeatherCard
                title="Today's Weather"
                weather={weatherData.current}
                isHistorical={false}
              />
            )}
            {weatherData.historical && (
              <WeatherCard
                title="Weather 1 Year Ago"
                weather={weatherData.historical}
                isHistorical={true}
                fallbackNote={weatherData.historicalFallbackNote}
              />
            )}
          </>
        )}
      </div>

      {/* Sales Data */}
      <SalesInput
        title="Daily Sales"
        salesData={salesData}
        onSalesChange={handleSalesChange}
        showComparison={true}
      />

      {/* Sales Summary */}
      <Card data-testid="card-sales-summary">
        <CardHeader>
          <CardTitle className="text-lg">Sales Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Total Sales</Label>
            <Input
              value={calculateTotalSales() ? `$${calculateTotalSales()}` : ""}
              readOnly
              className="bg-muted font-semibold"
              placeholder="Auto-calculated"
              data-testid="input-total-sales"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="daily-number">Daily Number</Label>
            <Input
              id="daily-number"
              type="number"
              step="1"
              value={dailyNumber}
              onChange={(e) => setDailyNumber(e.target.value)}
              placeholder="Enter daily number"
              data-testid="input-daily-number"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="weekly-number">Weekly Number</Label>
            <Input
              id="weekly-number"
              type="number"
              step="1"
              value={weeklyNumber}
              onChange={(e) => setWeeklyNumber(e.target.value)}
              placeholder="Enter weekly number"
              data-testid="input-weekly-number"
            />
          </div>
        </CardContent>
      </Card>

      {/* Sales Notes */}
      <Card data-testid="card-sales-notes">
        <CardHeader>
          <CardTitle className="text-lg">Sales Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={salesNotes}
            onChange={(e) => setSalesNotes(e.target.value)}
            placeholder="Enter notes about sales performance, promotions, special events..."
            className="min-h-24"
            data-testid="textarea-sales-notes"
          />
        </CardContent>
      </Card>

      {/* Daily Notes */}
      <Card data-testid="card-notes">
        <CardHeader>
          <CardTitle className="text-lg">Daily Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={dailyNotes}
            onChange={(e) => setDailyNotes(e.target.value)}
            placeholder="Enter daily observations, incidents, staff notes, or any other important information..."
            className="min-h-32"
            data-testid="textarea-daily-notes"
          />
        </CardContent>
      </Card>

      {/* To-Do Items */}
      <Card data-testid="card-maintenance">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            To-Do Items (Today)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Existing Maintenance Items List */}
          {existingLogId ? (
            <div className="space-y-4">
              {isLoadingMaintenance ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">Loading to-do items...</span>
                </div>
              ) : maintenanceItems && maintenanceItems.length > 0 ? (
                <div className="border rounded-lg divide-y">
                  <div className="grid grid-cols-12 gap-2 p-3 bg-muted/50 text-sm font-medium">
                    <div className="col-span-5">Description</div>
                    <div className="col-span-2">Status</div>
                    <div className="col-span-4">Notes</div>
                    <div className="col-span-1">Action</div>
                  </div>
                  {maintenanceItems.map((item) => (
                    <div 
                      key={item.id} 
                      className="grid grid-cols-12 gap-2 p-3 items-center"
                      data-testid={`maintenance-item-${item.id}`}
                    >
                      <div className="col-span-5 text-sm">{item.description}</div>
                      <div className="col-span-2">
                        <Badge 
                          variant={item.status === "completed" ? "default" : "secondary"}
                          className="flex items-center gap-1 w-fit"
                        >
                          {item.status === "completed" ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : (
                            <AlertCircle className="h-3 w-3" />
                          )}
                          {item.status === "completed" ? "Completed" : "Open"}
                        </Badge>
                      </div>
                      <div className="col-span-4 text-sm text-muted-foreground">
                        {item.notes || "-"}
                      </div>
                      <div className="col-span-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleMaintenanceStatus(item)}
                          disabled={updateMaintenanceMutation.isPending}
                          data-testid={`button-toggle-status-${item.id}`}
                        >
                          {item.status === "open" ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-yellow-600" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-sm text-muted-foreground border rounded-lg bg-muted/20">
                  No to-do items for this date. Add one below.
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4 text-sm text-muted-foreground border rounded-lg bg-muted/20">
              Save the log entry first to add maintenance items.
            </div>
          )}

          {/* Add New Maintenance Item Form */}
          {existingLogId && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Add New Maintenance Item</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="maintenance-description">Description</Label>
                  <Input
                    id="maintenance-description"
                    value={newMaintenanceDescription}
                    onChange={(e) => setNewMaintenanceDescription(e.target.value)}
                    placeholder="Enter maintenance item description"
                    data-testid="input-maintenance-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maintenance-status">Status</Label>
                  <Select 
                    value={newMaintenanceStatus} 
                    onValueChange={(value: "open" | "completed") => setNewMaintenanceStatus(value)}
                  >
                    <SelectTrigger data-testid="select-maintenance-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maintenance-notes">Notes (optional)</Label>
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
                  variant="secondary"
                  onClick={handleAddMaintenanceItem}
                  disabled={addMaintenanceMutation.isPending || !newMaintenanceDescription.trim()}
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
        </CardContent>
      </Card>

      {/* Notify Core Team Section - Only show when log exists */}
      {existingLogId && (
        <Card>
          <CardHeader className="py-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Notify Core Team</CardTitle>
              </div>
              <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                For urgent maintenance or behavior issues
              </Badge>
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
                    <span className="text-sm">Employee behavior</span>
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
                      {list.name} ({list.recipients.length} recipients)
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Hold Ctrl (Cmd on Mac) to select multiple groups.
                </p>
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
                  onClick={() => sendNotificationEmail(existingLogId)}
                  data-testid="button-send-notification"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Urgent Email
                    </>
                  )}
                </Button>

                {sendResult && (
                  <p className={`text-sm ${sendResult.includes('Error') ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {sendResult}
                  </p>
                )}
              </div>

              {/* Notification History */}
              {notificationHistory && notificationHistory.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Recent Notifications</p>
                  <div className="space-y-2">
                    {notificationHistory.map((n) => (
                      <div key={n.id} className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${
                          n.simulated 
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' 
                            : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        }`}>
                          {n.simulated ? 'Simulated' : 'Sent'}
                        </span>
                        <span>{format(new Date(n.createdAt), 'MMM d, h:mm a')}</span>
                        <span>•</span>
                        <span>{n.reason}</span>
                        <span>•</span>
                        <span>{n.recipientCount} recipient{n.recipientCount !== 1 ? 's' : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit Button */}
      <div className="flex justify-end gap-2">
        <Button 
          type="button" 
          variant="outline" 
          onClick={resetForm}
          disabled={isLoading}
          data-testid="button-reset"
        >
          Reset Form
        </Button>
        <Button 
          type="submit" 
          size="lg" 
          disabled={isLoading}
          data-testid="button-submit"
        >
          {saveLogMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {existingLogId ? "Update Log Entry" : "Save Log Entry"}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
