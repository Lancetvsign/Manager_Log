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

import { useState, useMemo, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear, parseISO, startOfWeek, endOfWeek, addDays, addWeeks, addMonths } from "date-fns";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid } from "recharts";
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
  Plus,
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
  WeekdaySalesChart,
  CollapsibleSection,
  getComparisonDateRange,
} from "@/components/charts";
import AddHistoricalDataDialog from "@/components/AddHistoricalDataDialog";

type DateRangePreset = "7days" | "30days" | "thisMonth" | "thisYear" | "custom";

interface MaintenanceInsights {
  openNow: number;
  completedInRange: number;
  avgDaysOpen: number;
  dailyOpenCounts: { date: string; count: number; itemNames?: string[] }[];
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

  const storageKey = `insights:${clubId}`;

  const [datePreset, setDatePreset] = useState<DateRangePreset>(() => {
    try {
      const v = localStorage.getItem(`${storageKey}:preset`);
      if (v && ["7days", "30days", "thisMonth", "thisYear", "custom"].includes(v)) {
        return v as DateRangePreset;
      }
    } catch {}
    return DEFAULT_DATE_PRESET;
  });

  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(() => {
    try {
      const v = localStorage.getItem(`${storageKey}:customStart`);
      if (v) return new Date(v + "T12:00:00");
    } catch {}
    return undefined;
  });

  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(() => {
    try {
      const v = localStorage.getItem(`${storageKey}:customEnd`);
      if (v) return new Date(v + "T12:00:00");
    } catch {}
    return undefined;
  });

  useEffect(() => {
    try {
      localStorage.setItem(`${storageKey}:preset`, datePreset);
      if (customStartDate) {
        localStorage.setItem(`${storageKey}:customStart`, format(customStartDate, "yyyy-MM-dd"));
      } else {
        localStorage.removeItem(`${storageKey}:customStart`);
      }
      if (customEndDate) {
        localStorage.setItem(`${storageKey}:customEnd`, format(customEndDate, "yyyy-MM-dd"));
      } else {
        localStorage.removeItem(`${storageKey}:customEnd`);
      }
    } catch {}
  }, [datePreset, customStartDate, customEndDate, storageKey]);

  const [chartType, setChartType] = useState<ChartType>(DEFAULT_CHART_TYPE);

  const [comparisonPeriod, setComparisonPeriod] = useState<ComparisonPeriod>("none");

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

  const { data: comparisonMaintenanceInsights } = useQuery<MaintenanceInsights>({
    queryKey: ["/api/insights/maintenance", clubId, comparisonDateRange?.startDate, comparisonDateRange?.endDate, "comparison"],
    queryFn: async () => {
      const url = buildApiUrl("/api/insights/maintenance", clubId, apiBaseUrl, {
        start: new Date(comparisonDateRange!.startDate).toISOString(),
        end: new Date(comparisonDateRange!.endDate).toISOString(),
      });
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch comparison maintenance insights");
      return response.json();
    },
    enabled: !!comparisonDateRange,
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

  const comparisonChanges = useMemo((): ComparisonMetrics | null => {
    // Only calculate comparison changes when a comparison period is selected
    if (comparisonPeriod === "none") return null;
    
    const calculateChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

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
  }, [metrics, comparisonMetrics, comparisonPeriod]);

  const maintenanceComparisonChanges = useMemo(() => {
    if (comparisonPeriod === "none" || !maintenanceInsights || !comparisonMaintenanceInsights) return null;
    const calcChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };
    return {
      openNowChange: calcChange(maintenanceInsights.openNow, comparisonMaintenanceInsights.openNow),
      completedInRangeChange: calcChange(maintenanceInsights.completedInRange, comparisonMaintenanceInsights.completedInRange),
    };
  }, [comparisonPeriod, maintenanceInsights, comparisonMaintenanceInsights]);

  const mergedDailyOpenCounts = useMemo(() => {
    if (!maintenanceInsights?.dailyOpenCounts) return [];
    if (comparisonPeriod === "none" || !comparisonMaintenanceInsights?.dailyOpenCounts || !comparisonDateRange) {
      return maintenanceInsights.dailyOpenCounts;
    }
    // Build a date-keyed map of comparison counts + item names for O(1) lookup
    const comparisonMap = new Map<string, { count: number; itemNames: string[] }>();
    comparisonMaintenanceInsights.dailyOpenCounts.forEach(item => {
      comparisonMap.set(item.date, { count: item.count, itemNames: item.itemNames ?? [] });
    });
    // Calculate the day offset between the two periods so we look up the
    // corresponding comparison date for each current-period bar.
    const currentStart = new Date(dateRange.startDate + "T12:00:00");
    const compStart = new Date(comparisonDateRange.startDate + "T12:00:00");
    const offsetMs = currentStart.getTime() - compStart.getTime();
    const offsetDays = Math.round(offsetMs / (1000 * 60 * 60 * 24));

    return maintenanceInsights.dailyOpenCounts.map(item => {
      const currentDate = new Date(item.date + "T12:00:00");
      const compDate = new Date(currentDate.getTime() - offsetDays * 24 * 60 * 60 * 1000);
      const compKey = format(compDate, "yyyy-MM-dd");
      const compEntry = comparisonMap.get(compKey);
      return {
        date: item.date,
        count: item.count,
        itemNames: item.itemNames ?? [],
        prevCount: compEntry?.count ?? 0,
        prevItemNames: compEntry?.itemNames ?? [],
        prevDate: compKey,
      };
    });
  }, [maintenanceInsights, comparisonMaintenanceInsights, comparisonPeriod, dateRange, comparisonDateRange]);

  const handleViewComparison = useCallback((importedStart: string, importedEnd: string) => {
    const start = parseISO(importedStart);
    const end = parseISO(importedEnd);
    const currentYear = new Date().getFullYear();
    setCustomStartDate(new Date(currentYear, start.getMonth(), start.getDate()));
    setCustomEndDate(new Date(currentYear, end.getMonth(), end.getDate()));
    setDatePreset("custom");
    setComparisonPeriod("previousYear");
  }, []);

  const resetFilters = useCallback(() => {
    setDatePreset(DEFAULT_DATE_PRESET);
    setCustomStartDate(undefined);
    setCustomEndDate(undefined);
    setChartType(DEFAULT_CHART_TYPE);
    setComparisonPeriod("none");
    try {
      localStorage.removeItem(`${storageKey}:preset`);
      localStorage.removeItem(`${storageKey}:customStart`);
      localStorage.removeItem(`${storageKey}:customEnd`);
    } catch {}
  }, [storageKey]);

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

  const hasData = metrics && (metrics.summary.daysWithLogs > 0 || comparisonPeriod !== "none");

  const displaySummary = metrics?.summary;
  const displayDailySales = metrics?.dailySales || [];
  const displayComparisonDailySales = comparisonMetrics?.dailySales;

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
          {hasData && (
            <>
              <AddHistoricalDataDialog
                clubId={clubId}
                apiBaseUrl={apiBaseUrl}
                onViewComparison={handleViewComparison}
                trigger={
                  <Button variant="outline" size="sm" className="gap-1" data-testid="button-add-historical-insights">
                    <Plus className="h-4 w-4" />
                    Add Historical Data
                  </Button>
                }
              />
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
                    {!clubSettings?.aiOverviewEnabled && (
                      <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                        <Sparkles className="h-4 w-4 shrink-0" />
                        <span>AI Overview is disabled. Enable it in <strong className="text-foreground">Settings</strong> (gear icon) to generate insights.</span>
                      </div>
                    )}

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
                    ) : null}
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
                  Month to Date
                </Button>
                <Button
                  variant={datePreset === "thisYear" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDatePreset("thisYear")}
                  data-testid="button-thisYear"
                >
                  Year to Date
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

        </CardContent>
      </Card>

      {!hasData ? (
        <Card>
          <CardContent className="py-16">
            <div className="text-center text-muted-foreground">
              <FileText className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-xl font-medium mb-2">No data in this time range</p>
              {metrics && metrics.totalLogsInDb > 0 ? (
                <div className="text-sm">
                  <p className="mb-3">Your logs exist — they're just outside the period you're viewing. Expand the date range to see them.</p>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      if (metrics.oldestLogDate) {
                        setCustomStartDate(new Date(metrics.oldestLogDate + "T12:00:00"));
                        setCustomEndDate(
                          metrics.newestLogDate
                            ? new Date(metrics.newestLogDate + "T12:00:00")
                            : new Date()
                        );
                        setDatePreset("custom");
                      } else {
                        setDatePreset("thisYear");
                      }
                    }}
                    data-testid="button-switch-to-year-to-date"
                  >
                    View all available data
                  </Button>
                </div>
              ) : (
                <p className="text-sm">
                  No logs found for this period. Start logging daily activity to see data here.
                </p>
              )}
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
                  <p className="text-xs text-muted-foreground">open at end of selected period</p>
                  {renderComparisonIndicator(maintenanceComparisonChanges?.openNowChange, true)}
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
                  {renderComparisonIndicator(maintenanceComparisonChanges?.completedInRangeChange)}
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

            {mergedDailyOpenCounts.length > 0 && (
              <Card data-testid="card-daily-open-counts" className="mt-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Open Items Per Logged Day
                    {comparisonPeriod !== "none" && comparisonMaintenanceInsights && (
                      <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground font-normal">
                        <span className="flex items-center gap-1">
                          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "hsl(var(--destructive))" }} />
                          This period
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="inline-block w-3 h-3 rounded-sm opacity-50" style={{ background: "hsl(var(--destructive))" }} />
                          {comparisonPeriod === "previousPeriod" ? "Prev period" : "Last year"}
                        </span>
                      </div>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={mergedDailyOpenCounts} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(d) => format(new Date(d + "T12:00:00"), "MMM d")}
                          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                          tickLine={false}
                          axisLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <RechartsTooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload || payload.length === 0) return null;
                            const row = payload[0]?.payload as {
                              date: string;
                              count: number;
                              itemNames?: string[];
                              prevCount?: number;
                              prevItemNames?: string[];
                              prevDate?: string;
                            } | undefined;
                            const compLabel = comparisonPeriod === "previousPeriod" ? "Prev period" : "Last year";
                            return (
                              <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px", padding: "8px 12px", maxWidth: 240 }}>
                                <p style={{ fontWeight: 600, marginBottom: 6 }}>{label ? format(new Date(label + "T12:00:00"), "MMM d, yyyy") : ""}</p>
                                {payload.map((entry) => {
                                  const isComp = entry.dataKey === "prevCount";
                                  const sectionLabel = isComp ? compLabel : "This period";
                                  const names = isComp ? (row?.prevItemNames ?? []) : (row?.itemNames ?? []);
                                  const dateLabel = isComp && row?.prevDate ? format(new Date(row.prevDate + "T12:00:00"), "MMM d, yyyy") : null;
                                  return (
                                    <div key={entry.dataKey as string} style={{ marginBottom: payload.length > 1 ? 6 : 0 }}>
                                      <span style={{ color: "hsl(var(--muted-foreground))" }}>{sectionLabel}</span>
                                      {dateLabel && <span style={{ color: "hsl(var(--muted-foreground))", fontStyle: "italic" }}> ({dateLabel})</span>}
                                      {": "}
                                      <span style={{ fontWeight: 600 }}>{entry.value as number}</span>
                                      {names.length > 0 && (
                                        <ul style={{ margin: "3px 0 0 8px", padding: 0, listStyle: "disc", color: "hsl(var(--foreground))" }}>
                                          {names.map((n, i) => (
                                            <li key={i} style={{ marginBottom: 1 }}>{n}</li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="count" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} />
                        {comparisonPeriod !== "none" && comparisonMaintenanceInsights && (
                          <Bar dataKey="prevCount" fill="hsl(var(--destructive))" fillOpacity={0.35} radius={[2, 2, 0, 0]} />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Number of running maintenance items open on each logged day</p>
                </CardContent>
              </Card>
            )}

            {maintenanceInsights?.repeatedCarryovers && maintenanceInsights.repeatedCarryovers.filter(r => r.daysAppeared >= 3).length > 0 && (
              <Card data-testid="card-repeated-carryovers" className="mt-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Persistent Open Items
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3">Items that were open across 3 or more logged days in the selected period</p>
                  <div className="border rounded-lg divide-y">
                    <div className="grid grid-cols-12 gap-2 p-3 bg-muted/50 text-sm font-medium">
                      <div className="col-span-8">Item</div>
                      <div className="col-span-4 text-right">Days Logged Open</div>
                    </div>
                    {maintenanceInsights.repeatedCarryovers
                      .filter(r => r.daysAppeared >= 3)
                      .map((item, index) => (
                        <div
                          key={item.id}
                          className="grid grid-cols-12 gap-2 p-3 items-center"
                          data-testid={`row-carryover-${index}`}
                        >
                          <div className="col-span-8 truncate">{item.title}</div>
                          <div className="col-span-4 text-right">
                            <Badge variant={item.daysAppeared >= 10 ? "destructive" : item.daysAppeared >= 5 ? "secondary" : "outline"}>
                              {item.daysAppeared} days
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
