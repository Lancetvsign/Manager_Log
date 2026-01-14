/**
 * INSIGHTS PAGE - ADVANCED ANALYTICS DASHBOARD
 * =============================================
 * Comprehensive analytics dashboard for the restaurant manager's log.
 * Provides visual insights with multiple chart types, comparison mode,
 * heatmap visualization, and export capabilities.
 * 
 * Features:
 * - Date range filtering (Last 7 Days, Last 30 Days, This Month, Custom)
 * - Comparison mode (Off, Previous Period, Last Year)
 * - Chart type switching (Line, Bar, Area)
 * - Chart customization (gridlines, labels, animations, colors)
 * - Sales breakdown by category (Food, Bar, Gaming)
 * - To-Do status pie chart
 * - GitHub-style sales heatmap calendar
 * - Sales by weekday analysis
 * - Collapsible sections with localStorage persistence
 * - CSV, PNG, and PDF export functionality
 * 
 * Data Flow:
 * 1. User selects date range and optional comparison period
 * 2. Component fetches from /api/metrics for both ranges
 * 3. Daily sales data displayed in cards, charts, and tables
 * 
 * HOW TO ADD NEW METRICS:
 * 1. Add the metric type in shared/schema.ts
 * 2. Compute the metric in server/routes.ts metrics endpoint
 * 3. Create a chart component in /components/charts/
 * 4. Add the chart to this page's layout
 * 
 * HOW COMPARISON MODE WORKS:
 * 1. User selects comparison period type
 * 2. Comparison date range is calculated client-side
 * 3. Second API call fetches comparison metrics
 * 4. Changes are calculated: (current - comparison) / comparison * 100
 * 5. Overlay lines added to sales trend chart
 */

import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear, parseISO, startOfWeek, endOfWeek, addDays, addWeeks, addMonths } from "date-fns";
import {
  Calendar,
  DollarSign,
  Loader2,
  FileText,
  CheckCircle,
  Eye,
  Download,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  BarChart3,
  CalendarDays,
  CalendarRange,
  PieChart,
  Wrench,
  Clock,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  FlaskConical,
  Plus,
  Upload,
  AlertCircle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type {
  MetricsResponse,
  ChartType,
  ComparisonPeriod,
  ComparisonMetrics,
} from "@shared/schema";
import { useManagerLog, buildApiUrl } from "@/contexts/ManagerLogContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  SalesChart,
  ToDoStatusPieChart,
  SalesHeatmapCalendar,
  WeekdaySalesChart,
  CollapsibleSection,
  getComparisonDateRange,
  makeCompareFromCurrent,
  makeDemoSalesSeries,
  makeComparisonForMode,
  makeDemoSummary,
} from "@/components/charts";
import type { SalesPoint } from "@/components/charts";

type DateRangePreset = "7days" | "30days" | "thisMonth" | "thisYear" | "custom";

interface MaintenanceInsights {
  openNow: number;
  completedInRange: number;
  avgDaysOpen: number;
  dailyOpenCounts: { date: string; count: number }[];
  dailyCompletions: { date: string; count: number }[];
  topOldestOpen: { id: number; title: string; daysOpen: number }[];
  repeatedCarryovers: { id: number; title: string; daysAppeared: number }[];
}

interface InsightsPageProps {
  onViewLog?: (logId: number, logDate: string) => void;
}

const DEFAULT_DATE_PRESET: DateRangePreset = "30days";
const DEFAULT_CHART_TYPE: ChartType = "line";

function buildSalesLabels(start: Date, end: Date, viewBy: "daily" | "weekly" | "monthly" = "daily") {
  const labels: { label: string; dateKey: string }[] = [];
  let cursor = new Date(start);

  if (viewBy === "weekly") cursor = startOfWeek(cursor, { weekStartsOn: 1 });
  if (viewBy === "monthly") cursor = startOfMonth(cursor);

  while (cursor <= end) {
    if (viewBy === "daily") {
      labels.push({ label: format(cursor, "MMM d"), dateKey: format(cursor, "yyyy-MM-dd") });
      cursor = addDays(cursor, 1);
    } else if (viewBy === "weekly") {
      labels.push({ label: `Wk ${format(cursor, "II")} ${format(cursor, "yy")}`, dateKey: format(cursor, "yyyy-MM-dd") });
      cursor = addWeeks(cursor, 1);
    } else {
      labels.push({ label: format(cursor, "MMM yyyy"), dateKey: format(cursor, "yyyy-MM-dd") });
      cursor = addMonths(cursor, 1);
    }
  }

  return labels;
}

export default function InsightsPage({ onViewLog }: InsightsPageProps) {
  const { clubId, clubName, apiBaseUrl } = useManagerLog();

  const [datePreset, setDatePreset] = useState<DateRangePreset>(DEFAULT_DATE_PRESET);
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  const [chartType, setChartType] = useState<ChartType>(DEFAULT_CHART_TYPE);

  const [comparisonPeriod, setComparisonPeriod] = useState<ComparisonPeriod>("none");
  const [demoMode, setDemoMode] = useState(false);
  const [historicalDataOpen, setHistoricalDataOpen] = useState(false);
  const [historicalDate, setHistoricalDate] = useState<Date | undefined>(undefined);
  const [historicalFood, setHistoricalFood] = useState("");
  const [historicalBar, setHistoricalBar] = useState("");
  const [historicalGaming, setHistoricalGaming] = useState("");
  
  // Bulk import state
  const [bulkImportMode, setBulkImportMode] = useState<"single" | "bulk">("single");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreviewData, setCsvPreviewData] = useState<Array<{
    date: string;
    foodSales: number;
    barSales: number;
    gamingSales: number;
    error?: string;
  }>>([]);
  const [csvParseError, setCsvParseError] = useState<string | null>(null);
  const [bulkImportResult, setBulkImportResult] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const dateRange = useMemo(() => {
    const today = new Date();

    switch (datePreset) {
      case "7days":
        return {
          startDate: format(subDays(today, 7), "yyyy-MM-dd"),
          endDate: format(today, "yyyy-MM-dd"),
        };
      case "30days":
        return {
          startDate: format(subDays(today, 30), "yyyy-MM-dd"),
          endDate: format(today, "yyyy-MM-dd"),
        };
      case "thisMonth":
        return {
          startDate: format(startOfMonth(today), "yyyy-MM-dd"),
          endDate: format(today, "yyyy-MM-dd"),
        };
      case "thisYear":
        return {
          startDate: format(startOfYear(today), "yyyy-MM-dd"),
          endDate: format(today, "yyyy-MM-dd"),
        };
      case "custom":
        if (customStartDate && customEndDate) {
          return {
            startDate: format(customStartDate, "yyyy-MM-dd"),
            endDate: format(customEndDate, "yyyy-MM-dd"),
          };
        }
        return {
          startDate: format(subDays(today, 30), "yyyy-MM-dd"),
          endDate: format(today, "yyyy-MM-dd"),
        };
      default:
        return {
          startDate: format(subDays(today, 30), "yyyy-MM-dd"),
          endDate: format(today, "yyyy-MM-dd"),
        };
    }
  }, [datePreset, customStartDate, customEndDate]);

  const comparisonDateRange = useMemo(() => {
    return getComparisonDateRange(
      comparisonPeriod,
      dateRange.startDate,
      dateRange.endDate
    );
  }, [comparisonPeriod, dateRange]);

  // Use monthly granularity for year views, daily for everything else
  const granularity = useMemo(() => {
    return datePreset === "thisYear" ? "monthly" : "daily";
  }, [datePreset]) as "daily" | "weekly" | "monthly";

  const { data: metrics, isLoading, isError } = useQuery<MetricsResponse>({
    queryKey: ["/api/metrics", clubId, dateRange.startDate, dateRange.endDate],
    queryFn: async () => {
      const url = buildApiUrl("/api/metrics", clubId, apiBaseUrl, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch metrics");
      }
      return response.json();
    },
  });

  const { data: comparisonMetrics } = useQuery<MetricsResponse>({
    queryKey: [
      "/api/metrics",
      clubId,
      comparisonDateRange?.startDate,
      comparisonDateRange?.endDate,
      "comparison",
    ],
    queryFn: async () => {
      if (!comparisonDateRange) {
        throw new Error("No comparison range");
      }
      const url = buildApiUrl("/api/metrics", clubId, apiBaseUrl, {
        startDate: comparisonDateRange.startDate,
        endDate: comparisonDateRange.endDate,
      });
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch comparison metrics");
      }
      return response.json();
    },
    enabled: !!comparisonDateRange,
  });

  const { data: maintenanceInsights } = useQuery<MaintenanceInsights>({
    queryKey: ["/api/insights/maintenance", clubId, dateRange.startDate, dateRange.endDate],
    queryFn: async () => {
      const url = buildApiUrl("/api/insights/maintenance", clubId, apiBaseUrl, {
        start: new Date(dateRange.startDate).toISOString(),
        end: new Date(dateRange.endDate).toISOString(),
      });
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch maintenance insights");
      return response.json();
    },
  });

  // AI Overview state and queries
  interface ClubSettings {
    clubId: string;
    aiOverviewEnabled: boolean;
  }

  interface AIOverviewResponse {
    overview: string;
    generatedAt: string;
    dataRange?: { startDate: string; endDate: string };
    logsAnalyzed?: number;
    openMaintenanceItems?: number;
  }

  const [aiOverview, setAiOverview] = useState<AIOverviewResponse | null>(null);

  const { data: clubSettings } = useQuery<ClubSettings>({
    queryKey: ["/api/club-settings", clubId],
    queryFn: async () => {
      const url = buildApiUrl("/api/club-settings", clubId, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch club settings");
      return response.json();
    },
  });

  const toggleAiMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const url = buildApiUrl("/api/club-settings", clubId, apiBaseUrl);
      const response = await apiRequest("PATCH", url, { aiOverviewEnabled: enabled });
      return response.json();
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/club-settings", clubId] });
      // Clear cached AI overview when disabling to force fresh fetch on re-enable
      if (!enabled) {
        setAiOverview(null);
      }
    },
  });

  const generateAiMutation = useMutation({
    mutationFn: async () => {
      const url = buildApiUrl("/api/ai-overview", clubId, apiBaseUrl);
      const response = await apiRequest("POST", url, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setAiOverview(data);
    },
  });

  const saveHistoricalMutation = useMutation({
    mutationFn: async (data: { date: string; foodSales: number; barSales: number; gamingSales: number }) => {
      const url = buildApiUrl("/api/manager-logs/historical", clubId, apiBaseUrl);
      const dateObj = new Date(data.date);
      const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
      const response = await apiRequest("POST", url, {
        logDate: data.date,
        dayOfWeek,
        foodSales: data.foodSales,
        barSales: data.barSales,
        gamingSales: data.gamingSales,
        clubId: clubId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-logs"] });
      setHistoricalDataOpen(false);
      setHistoricalDate(undefined);
      setHistoricalFood("");
      setHistoricalBar("");
      setHistoricalGaming("");
    },
  });

  // CSV parsing function for bulk import
  const parseCSV = useCallback((text: string) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      setCsvParseError("CSV file must have a header row and at least one data row");
      setCsvPreviewData([]);
      return;
    }

    // Parse header to identify columns
    const header = lines[0].toLowerCase().split(',').map(h => h.trim());
    const dateIdx = header.findIndex(h => h === 'date' || h === 'log_date' || h === 'logdate');
    const foodIdx = header.findIndex(h => h === 'food_sales' || h === 'foodsales' || h === 'food');
    const barIdx = header.findIndex(h => h === 'bar_sales' || h === 'barsales' || h === 'bar');
    const gamingIdx = header.findIndex(h => h === 'gaming_sales' || h === 'gamingsales' || h === 'gaming');

    if (dateIdx === -1) {
      setCsvParseError("CSV must have a 'date' column");
      setCsvPreviewData([]);
      return;
    }

    const parsedRows: typeof csvPreviewData = [];
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = line.split(',').map(v => v.trim());
      const dateStr = values[dateIdx] || '';
      
      // Validate date format
      let error: string | undefined;
      if (!dateRegex.test(dateStr)) {
        error = "Invalid date format (use YYYY-MM-DD)";
      }
      
      const foodVal = foodIdx >= 0 ? parseFloat(values[foodIdx]) || 0 : 0;
      const barVal = barIdx >= 0 ? parseFloat(values[barIdx]) || 0 : 0;
      const gamingVal = gamingIdx >= 0 ? parseFloat(values[gamingIdx]) || 0 : 0;

      parsedRows.push({
        date: dateStr,
        foodSales: foodVal,
        barSales: barVal,
        gamingSales: gamingVal,
        error,
      });
    }

    if (parsedRows.length === 0) {
      setCsvParseError("No valid data rows found in CSV");
      setCsvPreviewData([]);
      return;
    }

    setCsvParseError(null);
    setCsvPreviewData(parsedRows);
  }, []);

  // Handle CSV file upload
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

  // Clear bulk import state
  const clearBulkImport = useCallback(() => {
    setCsvFile(null);
    setCsvPreviewData([]);
    setCsvParseError(null);
    setBulkImportResult(null);
  }, []);

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
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-logs"] });
      if (result.failed === 0) {
        // All succeeded, auto-close after short delay
        setTimeout(() => {
          setHistoricalDataOpen(false);
          clearBulkImport();
          setBulkImportMode("single");
        }, 2000);
      }
    },
  });

  const demoData = useMemo(() => {
    if (!demoMode) return null;
    
    let rangeStart = parseISO(dateRange.startDate);
    let rangeEnd = parseISO(dateRange.endDate);
    
    // For "This Year" with monthly granularity in demo mode, extend to full year
    // so the chart shows 12 months of sample data instead of just 1 month
    if (datePreset === "thisYear" && granularity === "monthly") {
      rangeEnd = endOfYear(rangeStart);
    }
    
    // In demo mode, always generate complete synthetic data for the full date range
    // This ensures connected lines regardless of sparse real data
    const labels = buildSalesLabels(rangeStart, rangeEnd, granularity);
    const demoCurrent = makeDemoSalesSeries(labels, 7);
    const demoCompare = comparisonPeriod !== "none" 
      ? makeComparisonForMode(demoCurrent, comparisonPeriod)
      : [];
    
    const demoSummary = makeDemoSummary(demoCurrent, 7);
    const demoComparisonSummary = makeDemoSummary(demoCompare, 42);
    
    const currentForLogs = demoCurrent.map((d) => ({
      date: d.dateKey,
      dayOfWeek: format(parseISO(d.dateKey), "EEEE"),
      totalSales: d.total,
      foodSales: d.food,
      barSales: d.bar,
      gamingSales: d.gaming,
    }));
    
    const comparisonForLogs = demoCompare.map((d) => ({
      date: d.dateKey,
      dayOfWeek: format(parseISO(d.dateKey), "EEEE"),
      totalSales: d.total,
      foodSales: d.food,
      barSales: d.bar,
      gamingSales: d.gaming,
    }));
    
    return { 
      current: currentForLogs,
      comparison: comparisonForLogs,
      summary: demoSummary,
      comparisonSummary: demoComparisonSummary,
    };
  }, [demoMode, dateRange, datePreset, comparisonPeriod, granularity]);

  const comparisonChanges = useMemo((): ComparisonMetrics | null => {
    // Only calculate comparison changes when a comparison period is selected
    if (comparisonPeriod === "none") return null;
    
    const calculateChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    if (demoMode && demoData && demoData.comparison.length > 0) {
      return {
        totalSalesChange: calculateChange(demoData.summary.totalSales, demoData.comparisonSummary.totalSales),
        averageDailySalesChange: calculateChange(demoData.summary.averageDailySales, demoData.comparisonSummary.averageDailySales),
        openToDoChange: calculateChange(demoData.summary.openToDo, demoData.comparisonSummary.openToDo),
        completedToDoChange: calculateChange(demoData.summary.completedToDo, demoData.comparisonSummary.completedToDo),
        daysWithLogsChange: calculateChange(demoData.summary.daysWithLogs, demoData.comparisonSummary.daysWithLogs),
      };
    }

    if (!metrics || !comparisonMetrics) return null;

    return {
      totalSalesChange: calculateChange(
        metrics.summary.totalSales,
        comparisonMetrics.summary.totalSales
      ),
      averageDailySalesChange: calculateChange(
        metrics.summary.averageDailySales,
        comparisonMetrics.summary.averageDailySales
      ),
      openToDoChange: calculateChange(
        metrics.summary.openToDo,
        comparisonMetrics.summary.openToDo
      ),
      completedToDoChange: calculateChange(
        metrics.summary.completedToDo,
        comparisonMetrics.summary.completedToDo
      ),
      daysWithLogsChange: calculateChange(
        metrics.summary.daysWithLogs,
        comparisonMetrics.summary.daysWithLogs
      ),
    };
  }, [metrics, comparisonMetrics, demoMode, demoData, comparisonPeriod]);

  const resetFilters = useCallback(() => {
    setDatePreset(DEFAULT_DATE_PRESET);
    setCustomStartDate(undefined);
    setCustomEndDate(undefined);
    setChartType(DEFAULT_CHART_TYPE);
    setComparisonPeriod("none");
  }, []);

  const exportToCSV = useCallback(() => {
    if (!metrics) return;

    const lines: string[] = [];

    lines.push("Restaurant Manager's Log - Insights Export");
    lines.push(`Date Range: ${dateRange.startDate} to ${dateRange.endDate}`);
    if (comparisonDateRange) {
      lines.push(
        `Comparison Range: ${comparisonDateRange.startDate} to ${comparisonDateRange.endDate}`
      );
    }
    lines.push(`Generated: ${format(new Date(), "yyyy-MM-dd HH:mm:ss")}`);
    lines.push("");

    lines.push("SUMMARY");
    lines.push("Metric,Current Value,Comparison Value,Change %");
    lines.push(
      `Days with Logs,${metrics.summary.daysWithLogs},${comparisonMetrics?.summary.daysWithLogs || "N/A"},${comparisonChanges?.daysWithLogsChange !== undefined ? comparisonChanges.daysWithLogsChange + "%" : "N/A"}`
    );
    lines.push(
      `Total Sales,$${metrics.summary.totalSales.toFixed(2)},$${comparisonMetrics?.summary.totalSales.toFixed(2) || "N/A"},${comparisonChanges?.totalSalesChange !== undefined ? comparisonChanges.totalSalesChange + "%" : "N/A"}`
    );
    lines.push(
      `Average Daily Sales,$${metrics.summary.averageDailySales.toFixed(2)},$${comparisonMetrics?.summary.averageDailySales.toFixed(2) || "N/A"},${comparisonChanges?.averageDailySalesChange !== undefined ? comparisonChanges.averageDailySalesChange + "%" : "N/A"}`
    );
    lines.push(
      `Open To-Do Items,${metrics.summary.openToDo},${comparisonMetrics?.summary.openToDo || "N/A"},${comparisonChanges?.openToDoChange !== undefined ? comparisonChanges.openToDoChange + "%" : "N/A"}`
    );
    lines.push(
      `Completed To-Do Items,${metrics.summary.completedToDo},${comparisonMetrics?.summary.completedToDo || "N/A"},${comparisonChanges?.completedToDoChange !== undefined ? comparisonChanges.completedToDoChange + "%" : "N/A"}`
    );
    lines.push("");

    lines.push("SALES BY CATEGORY");
    lines.push("Category,Amount");
    lines.push(`Food,$${metrics.salesByCategory.food.toFixed(2)}`);
    lines.push(`Bar,$${metrics.salesByCategory.bar.toFixed(2)}`);
    lines.push(`Gaming,$${metrics.salesByCategory.gaming.toFixed(2)}`);
    lines.push(`Total,$${metrics.salesByCategory.total.toFixed(2)}`);
    lines.push("");

    lines.push("DAILY SALES");
    lines.push("Date,Day of Week,Total Sales,Food Sales,Bar Sales,Gaming Sales");
    metrics.dailySales.forEach((day) => {
      lines.push(
        `${day.date},${day.dayOfWeek},$${day.totalSales.toFixed(2)},$${day.foodSales.toFixed(2)},$${day.barSales.toFixed(2)},$${day.gamingSales.toFixed(2)}`
      );
    });
    lines.push("");

    lines.push("TO-DO STATUS");
    lines.push("Status,Count");
    lines.push(`Open,${metrics.toDoStatus.open}`);
    lines.push(`Completed,${metrics.toDoStatus.completed}`);

    const csvContent = lines.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `insights_${dateRange.startDate}_to_${dateRange.endDate}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [metrics, comparisonMetrics, comparisonChanges, dateRange, comparisonDateRange]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const renderComparisonIndicator = (change: number | undefined, invertColors: boolean = false) => {
    if (change === undefined || comparisonPeriod === "none") return null;
    
    const isPositive = change > 0;
    const isNegative = change < 0;
    const isNeutral = change === 0;
    
    // For some metrics like "Open To-Do Items", lower is better
    const colorClass = invertColors
      ? isPositive ? "text-red-500" : isNegative ? "text-green-500" : "text-muted-foreground"
      : isPositive ? "text-green-500" : isNegative ? "text-red-500" : "text-muted-foreground";
    
    const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : null;
    const sign = isPositive ? "+" : "";
    
    return (
      <div className={`flex items-center gap-1 text-xs font-medium ${colorClass}`}>
        {Icon && <Icon className="h-3 w-3" />}
        <span>{sign}{change}%</span>
        <span className="text-muted-foreground font-normal">vs {comparisonPeriod === "previousPeriod" ? "prev" : "last yr"}</span>
      </div>
    );
  };

  const dateRangeDisplay = `${format(parseISO(dateRange.startDate), "MMM d")} - ${format(parseISO(dateRange.endDate), "MMM d, yyyy")}`;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-3" />
        <span className="text-lg text-muted-foreground">Loading insights...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-10">
          <div className="text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg mb-2">Unable to load insights</p>
            <p className="text-sm">
              Please try again later or select a different date range.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasData = metrics && (metrics.summary.daysWithLogs > 0 || comparisonPeriod !== "none" || demoMode);

  const displaySummary = demoMode && demoData ? demoData.summary : metrics?.summary;
  const displayDailySales = demoMode && demoData ? demoData.current : metrics?.dailySales || [];
  const displayComparisonDailySales = demoMode && demoData ? demoData.comparison : comparisonMetrics?.dailySales;

  const completionRate = displaySummary 
    ? Math.round(
        (displaySummary.completedToDo / (displaySummary.openToDo + displaySummary.completedToDo || 1)) * 100
      )
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold">Insights</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={resetFilters}
            className="gap-1"
            data-testid="button-reset-filters"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
          <Button
            variant={demoMode ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setDemoMode(!demoMode);
              if (!demoMode) {
                const today = new Date();
                const thisWeekStart = startOfWeek(today, { weekStartsOn: 0 });
                const thisWeekEnd = endOfWeek(today, { weekStartsOn: 0 });
                setCustomStartDate(thisWeekStart);
                setCustomEndDate(thisWeekEnd);
                setDatePreset("custom");
                setComparisonPeriod("previousPeriod");
              }
            }}
            className="gap-1"
            data-testid="button-demo-mode"
          >
            <FlaskConical className="h-4 w-4" />
            {demoMode ? "Exit Demo" : "Demo Mode"}
          </Button>
          {hasData && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                className="gap-1"
                data-testid="button-export-csv"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    data-testid="button-ai-overview"
                  >
                    <Sparkles className="h-4 w-4" />
                    AI Overview
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      AI Overview
                    </DialogTitle>
                    <DialogDescription>
                      Get AI-powered insights about your sales and operations data.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Enable AI Analysis</p>
                        <p className="text-xs text-muted-foreground">
                          AI analysis uses credits. Enable only when needed.
                        </p>
                      </div>
                      <Switch
                        checked={clubSettings?.aiOverviewEnabled ?? false}
                        onCheckedChange={(checked) => toggleAiMutation.mutate(checked)}
                        disabled={toggleAiMutation.isPending}
                        data-testid="switch-ai-enabled"
                      />
                    </div>

                    {clubSettings?.aiOverviewEnabled ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => generateAiMutation.mutate()}
                            disabled={generateAiMutation.isPending}
                            className="gap-2"
                            data-testid="button-generate-ai"
                          >
                            {generateAiMutation.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-4 w-4" />
                                Generate AI Overview
                              </>
                            )}
                          </Button>
                          {aiOverview && (
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => generateAiMutation.mutate()}
                              disabled={generateAiMutation.isPending}
                              data-testid="button-refresh-ai"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        {aiOverview && (
                          <Card className="border-primary/20 bg-primary/5">
                            <CardContent className="pt-4">
                              <div className="prose prose-sm dark:prose-invert max-w-none">
                                <p className="whitespace-pre-wrap" data-testid="text-ai-overview">
                                  {aiOverview.overview}
                                </p>
                              </div>
                              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                                {aiOverview.logsAnalyzed !== undefined && (
                                  <span>{aiOverview.logsAnalyzed} days analyzed</span>
                                )}
                                {aiOverview.openMaintenanceItems !== undefined && (
                                  <span>{aiOverview.openMaintenanceItems} open maintenance items</span>
                                )}
                                <span>
                                  Generated: {format(parseISO(aiOverview.generatedAt), "MMM d, h:mm a")}
                                </span>
                              </div>
                            </CardContent>
                          </Card>
                        )}

                        {!aiOverview && !generateAiMutation.isPending && (
                          <p className="text-sm text-muted-foreground">
                            Click &quot;Generate AI Overview&quot; to get AI-powered insights for the selected date range ({dateRange.startDate} to {dateRange.endDate}).
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Enable AI analysis above to generate intelligent insights about your sales trends and operational data.
                      </p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {hasData && (
        <CollapsibleSection
          id="summaryCards"
          title="Summary"
          icon={<BarChart3 className="h-5 w-5" />}
          defaultExpanded={true}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card data-testid="card-days-logged">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                <CardTitle className="text-sm font-medium">Days Logged</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{displaySummary?.daysWithLogs || 0}</div>
                <p className="text-xs text-muted-foreground">entries in selected range</p>
                {renderComparisonIndicator(comparisonChanges?.daysWithLogsChange)}
              </CardContent>
            </Card>

            <Card data-testid="card-total-sales">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(displaySummary?.totalSales || 0)}
                </div>
                <p className="text-xs text-muted-foreground">combined sales</p>
                {renderComparisonIndicator(comparisonChanges?.totalSalesChange)}
              </CardContent>
            </Card>

            <Card data-testid="card-avg-sales">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                <CardTitle className="text-sm font-medium">Average Daily Sales</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(displaySummary?.averageDailySales || 0)}
                </div>
                <p className="text-xs text-muted-foreground">per logged day</p>
                {renderComparisonIndicator(comparisonChanges?.averageDailySalesChange)}
              </CardContent>
            </Card>

            <Card data-testid="card-todo-status">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                <CardTitle className="text-sm font-medium">Maintenance Items</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{displaySummary?.openToDo || 0} Open</div>
                <p className="text-xs text-muted-foreground">
                  {displaySummary?.completedToDo || 0} completed ({completionRate}% rate)
                </p>
                {renderComparisonIndicator(comparisonChanges?.completedToDoChange)}
              </CardContent>
            </Card>
          </div>
        </CollapsibleSection>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Filters & Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="space-y-2 flex-1">
              <p className="text-sm font-medium text-muted-foreground">Date Range</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={datePreset === "7days" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDatePreset("7days")}
                  data-testid="button-7days"
                >
                  Last 7 Days
                </Button>
                <Button
                  variant={datePreset === "30days" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDatePreset("30days")}
                  data-testid="button-30days"
                >
                  Last 30 Days
                </Button>
                <Button
                  variant={datePreset === "thisMonth" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDatePreset("thisMonth")}
                  data-testid="button-thisMonth"
                >
                  This Month
                </Button>
                <Button
                  variant={datePreset === "thisYear" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDatePreset("thisYear")}
                  data-testid="button-thisYear"
                >
                  This Year
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={datePreset === "custom" ? "default" : "outline"}
                      size="sm"
                      data-testid="button-custom-range"
                    >
                      Custom Range
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-4 max-h-[80vh] overflow-y-auto" align="start" side="bottom" sideOffset={8} collisionPadding={16}>
                    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Start Date</p>
                        <CalendarComponent
                          mode="single"
                          selected={customStartDate}
                          onSelect={(date) => {
                            setCustomStartDate(date);
                            if (date) setDatePreset("custom");
                          }}
                          disabled={(date) => (customEndDate ? date > customEndDate : false)}
                          initialFocus
                        />
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium">End Date</p>
                        <CalendarComponent
                          mode="single"
                          selected={customEndDate}
                          onSelect={(date) => {
                            setCustomEndDate(date);
                            if (date) setDatePreset("custom");
                          }}
                          disabled={(date) => (customStartDate ? date < customStartDate : false)}
                        />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

          </div>

          {datePreset === "custom" && customStartDate && customEndDate && (
            <p className="text-sm text-muted-foreground">
              Selected: {format(customStartDate, "MMM d, yyyy")} -{" "}
              {format(customEndDate, "MMM d, yyyy")}
            </p>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Compare To</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={comparisonPeriod === "none" ? "default" : "outline"}
                size="sm"
                onClick={() => setComparisonPeriod("none")}
                data-testid="button-compare-off"
              >
                Off
              </Button>
              <Button
                variant={comparisonPeriod === "previousPeriod" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setComparisonPeriod("previousPeriod");
                }}
                data-testid="button-compare-previous"
              >
                Previous Period
              </Button>
              <Button
                variant={comparisonPeriod === "previousYear" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setComparisonPeriod("previousYear");
                }}
                data-testid="button-compare-lastyear"
              >
                Same Period Last Year
              </Button>
            </div>
            {comparisonPeriod !== "none" && comparisonDateRange && (
              <p className="text-sm text-muted-foreground">
                Comparing to: {format(parseISO(comparisonDateRange.startDate), "MMM d")} –{" "}
                {format(parseISO(comparisonDateRange.endDate), "MMM d, yyyy")}
              </p>
            )}
          </div>

          <div className="border-t pt-4 flex flex-wrap gap-2">
            <Dialog open={historicalDataOpen} onOpenChange={setHistoricalDataOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  data-testid="button-add-historical"
                >
                  <Plus className="h-4 w-4" />
                  Add Historical Data
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Historical Sales Data</DialogTitle>
                  <DialogDescription>
                    Enter sales data for past dates to enable comparison features.
                  </DialogDescription>
                </DialogHeader>
                
                <Tabs value={bulkImportMode} onValueChange={(v) => setBulkImportMode(v as "single" | "bulk")} className="pt-2">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="single">Single Entry</TabsTrigger>
                    <TabsTrigger value="bulk">Bulk Import</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="single" className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Select Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start">
                            <Calendar className="h-4 w-4 mr-2" />
                            {historicalDate ? format(historicalDate, "MMMM d, yyyy") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={historicalDate}
                            onSelect={setHistoricalDate}
                            disabled={(date) => date > new Date()}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="food-sales">Food Sales</Label>
                        <Input
                          id="food-sales"
                          type="number"
                          placeholder="0.00"
                          value={historicalFood}
                          onChange={(e) => setHistoricalFood(e.target.value)}
                          data-testid="input-historical-food"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bar-sales">Bar Sales</Label>
                        <Input
                          id="bar-sales"
                          type="number"
                          placeholder="0.00"
                          value={historicalBar}
                          onChange={(e) => setHistoricalBar(e.target.value)}
                          data-testid="input-historical-bar"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="gaming-sales">Gaming Sales</Label>
                        <Input
                          id="gaming-sales"
                          type="number"
                          placeholder="0.00"
                          value={historicalGaming}
                          onChange={(e) => setHistoricalGaming(e.target.value)}
                          data-testid="input-historical-gaming"
                        />
                      </div>
                    </div>
                    
                    <Button
                      className="w-full"
                      disabled={!historicalDate || saveHistoricalMutation.isPending}
                      onClick={() => {
                        if (historicalDate) {
                          saveHistoricalMutation.mutate({
                            date: format(historicalDate, "yyyy-MM-dd"),
                            foodSales: parseFloat(historicalFood) || 0,
                            barSales: parseFloat(historicalBar) || 0,
                            gamingSales: parseFloat(historicalGaming) || 0,
                          });
                        }
                      }}
                      data-testid="button-save-historical"
                    >
                      {saveHistoricalMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Historical Data"
                      )}
                    </Button>
                  </TabsContent>
                  
                  <TabsContent value="bulk" className="space-y-4 pt-4">
                    {/* CSV Format Instructions */}
                    <div className="bg-muted/50 rounded-lg p-3 text-sm">
                      <p className="font-medium mb-1">CSV Format:</p>
                      <code className="text-xs block bg-background p-2 rounded">
                        date,food_sales,bar_sales,gaming_sales<br/>
                        2025-01-01,1500.00,2000.00,500.00
                      </code>
                    </div>
                    
                    {/* File Upload */}
                    <div className="space-y-2">
                      <Label>Upload CSV File</Label>
                      <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                        <input
                          type="file"
                          accept=".csv,.txt"
                          onChange={handleCsvFileChange}
                          className="hidden"
                          id="csv-upload"
                          data-testid="input-csv-upload"
                        />
                        <label htmlFor="csv-upload" className="cursor-pointer">
                          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            {csvFile ? csvFile.name : "Click to upload or drag and drop"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">CSV or TXT file</p>
                        </label>
                      </div>
                    </div>
                    
                    {/* Parse Error */}
                    {csvParseError && (
                      <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                        <p className="text-sm text-destructive">{csvParseError}</p>
                      </div>
                    )}
                    
                    {/* Preview Table */}
                    {csvPreviewData.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Preview ({csvPreviewData.length} rows)</Label>
                          <Button variant="ghost" size="sm" onClick={clearBulkImport}>
                            Clear
                          </Button>
                        </div>
                        <div className="max-h-48 overflow-auto border rounded-lg">
                          <table className="w-full text-sm">
                            <thead className="bg-muted sticky top-0">
                              <tr>
                                <th className="text-left p-2">Date</th>
                                <th className="text-right p-2">Food</th>
                                <th className="text-right p-2">Bar</th>
                                <th className="text-right p-2">Gaming</th>
                              </tr>
                            </thead>
                            <tbody>
                              {csvPreviewData.map((row, idx) => (
                                <tr key={idx} className={row.error ? "bg-destructive/10" : ""}>
                                  <td className="p-2">
                                    {row.date}
                                    {row.error && (
                                      <span className="text-xs text-destructive ml-1">({row.error})</span>
                                    )}
                                  </td>
                                  <td className="text-right p-2">${row.foodSales.toFixed(2)}</td>
                                  <td className="text-right p-2">${row.barSales.toFixed(2)}</td>
                                  <td className="text-right p-2">${row.gamingSales.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    
                    {/* Import Result */}
                    {bulkImportResult && (
                      <div className={`rounded-lg p-3 flex items-start gap-2 ${
                        bulkImportResult.failed === 0 
                          ? "bg-green-500/10 border border-green-500/30" 
                          : "bg-amber-500/10 border border-amber-500/30"
                      }`}>
                        <CheckCircle className={`h-4 w-4 mt-0.5 ${
                          bulkImportResult.failed === 0 ? "text-green-600" : "text-amber-600"
                        }`} />
                        <div className="text-sm">
                          <p className={bulkImportResult.failed === 0 ? "text-green-600" : "text-amber-600"}>
                            Imported {bulkImportResult.success} of {bulkImportResult.success + bulkImportResult.failed} records
                          </p>
                          {bulkImportResult.errors.length > 0 && (
                            <ul className="mt-1 text-xs text-muted-foreground">
                              {bulkImportResult.errors.slice(0, 3).map((err, i) => (
                                <li key={i}>{err}</li>
                              ))}
                              {bulkImportResult.errors.length > 3 && (
                                <li>...and {bulkImportResult.errors.length - 3} more errors</li>
                              )}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Import Button */}
                    <Button
                      className="w-full"
                      disabled={csvPreviewData.length === 0 || csvPreviewData.some(r => r.error) || bulkImportMutation.isPending}
                      onClick={() => {
                        const validRows = csvPreviewData.filter(r => !r.error);
                        if (validRows.length > 0) {
                          bulkImportMutation.mutate(validRows);
                        }
                      }}
                      data-testid="button-bulk-import"
                    >
                      {bulkImportMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Import {csvPreviewData.filter(r => !r.error).length} Records
                        </>
                      )}
                    </Button>
                  </TabsContent>
                </Tabs>
              </DialogContent>
            </Dialog>
          </div>

          {demoMode && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mt-4">
              <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
                <FlaskConical className="h-4 w-4" />
                <span><strong>Demo Mode Active</strong> - Showing sample comparison data. Click "Exit Demo" to return to real data.</span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {!hasData ? (
        <Card>
          <CardContent className="py-16">
            <div className="text-center text-muted-foreground">
              <FileText className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-xl font-medium mb-2">No log data found</p>
              <p className="text-sm">
                No entries were found for this date range. Try expanding your dates or
                start logging daily activity.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <CollapsibleSection
            id="salesTrend"
            title="Sales"
            icon={<TrendingUp className="h-5 w-5" />}
            defaultExpanded={true}
          >
            <SalesChart
              data={displayDailySales}
              comparisonData={displayComparisonDailySales}
              chartType={chartType}
              granularity={granularity}
              dateRange={dateRangeDisplay}
              clubName={clubName}
              onChartTypeChange={setChartType}
              comparisonPeriod={comparisonPeriod}
            />
            <div className="mt-6">
              <SalesHeatmapCalendar
                data={displayDailySales}
                startDate={dateRange.startDate}
                endDate={dateRange.endDate}
                dateRange={dateRangeDisplay}
                clubName={clubName}
                onDayClick={(date) => {
                  const log = metrics.topDays.find((d) => d.date === date);
                  if (log && onViewLog) {
                    onViewLog(log.logId, date);
                  }
                }}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            id="weekdayAnalysis"
            title="Weekday Analysis"
            icon={<CalendarRange className="h-5 w-5" />}
            defaultExpanded={true}
          >
            <WeekdaySalesChart
              data={displayDailySales}
              dateRange={dateRangeDisplay}
              clubName={clubName}
            />
          </CollapsibleSection>

          {metrics.topDays.length > 0 && (
            <CollapsibleSection
              id="topDays"
              title="Top Performing Days"
              icon={<TrendingUp className="h-5 w-5" />}
              defaultExpanded={true}
            >
              <Card data-testid="card-top-days">
                <CardContent className="pt-6">
                  <div className="border rounded-lg divide-y">
                    <div className="grid grid-cols-12 gap-2 p-3 bg-muted/50 text-sm font-medium">
                      <div className="col-span-3">Date</div>
                      <div className="col-span-2">Sales</div>
                      <div className="col-span-5">Notes</div>
                      <div className="col-span-2 text-right">Action</div>
                    </div>
                    {metrics.topDays.map((day, index) => (
                      <div
                        key={day.date}
                        className="grid grid-cols-12 gap-2 p-3 items-center"
                        data-testid={`row-topday-${index}`}
                      >
                        <div className="col-span-3">
                          <p className="font-medium">
                            {format(new Date(day.date + "T00:00:00"), "MMM d, yyyy")}
                          </p>
                          <p className="text-xs text-muted-foreground">{day.dayOfWeek}</p>
                        </div>
                        <div className="col-span-2">
                          <Badge variant="secondary" className="font-mono">
                            {formatCurrency(day.totalSales)}
                          </Badge>
                        </div>
                        <div className="col-span-5 text-sm text-muted-foreground truncate">
                          {day.narrativeSnippet || "No notes"}
                        </div>
                        <div className="col-span-2 text-right">
                          {onViewLog && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onViewLog(day.logId, day.date)}
                              className="gap-1"
                              data-testid={`button-view-log-${index}`}
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </CollapsibleSection>
          )}

          <CollapsibleSection
            id="maintenanceInsights"
            title="Maintenance Insights"
            icon={<Wrench className="h-5 w-5" />}
            defaultExpanded={true}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <ToDoStatusPieChart status={metrics.toDoStatus} />
              <Card data-testid="card-maintenance-open">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                  <CardTitle className="text-sm font-medium">Open Items</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{maintenanceInsights?.openNow ?? 0}</div>
                  <p className="text-xs text-muted-foreground">currently open maintenance items</p>
                </CardContent>
              </Card>

              <Card data-testid="card-maintenance-completed">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                  <CardTitle className="text-sm font-medium">Completed</CardTitle>
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{maintenanceInsights?.completedInRange ?? 0}</div>
                  <p className="text-xs text-muted-foreground">completed in selected period</p>
                </CardContent>
              </Card>

              <Card data-testid="card-maintenance-avg-days">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                  <CardTitle className="text-sm font-medium">Avg Days Item Open</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {maintenanceInsights?.avgDaysOpen !== undefined
                      ? maintenanceInsights.avgDaysOpen.toFixed(1)
                      : "0"}
                  </div>
                  <p className="text-xs text-muted-foreground">average days to complete</p>
                </CardContent>
              </Card>
            </div>

            {maintenanceInsights?.topOldestOpen && maintenanceInsights.topOldestOpen.length > 0 && (
              <Card data-testid="card-oldest-open">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Oldest Open Items
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg divide-y">
                    <div className="grid grid-cols-12 gap-2 p-3 bg-muted/50 text-sm font-medium">
                      <div className="col-span-8">Item</div>
                      <div className="col-span-4 text-right">Days Open</div>
                    </div>
                    {maintenanceInsights.topOldestOpen.slice(0, 5).map((item, index) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-12 gap-2 p-3 items-center"
                        data-testid={`row-oldest-open-${index}`}
                      >
                        <div className="col-span-8 truncate">{item.title}</div>
                        <div className="col-span-4 text-right">
                          <Badge variant={item.daysOpen > 30 ? "destructive" : item.daysOpen > 14 ? "secondary" : "outline"}>
                            {item.daysOpen} days
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}
