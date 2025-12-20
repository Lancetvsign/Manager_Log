/**
 * INSIGHTS PAGE - ADVANCED ANALYTICS DASHBOARD
 * =============================================
 * Comprehensive analytics dashboard for the restaurant manager's log.
 * Provides visual insights with multiple chart types, comparison mode,
 * granularity controls, heatmap visualization, and export capabilities.
 * 
 * Features:
 * - Date range filtering (Last 7 Days, Last 30 Days, This Month, Custom)
 * - Comparison mode (Previous Period, Previous Month, Previous Year, Custom)
 * - View By selector (Daily, Weekly, Monthly)
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
 * 3. Data is aggregated client-side based on granularity setting
 * 4. Results displayed in cards, charts, and tables
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
import { format, subDays, startOfMonth, endOfMonth, parseISO } from "date-fns";
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
  Minus,
  BarChart3,
  CalendarDays,
  CalendarRange,
  PieChart,
  Wrench,
  Clock,
  AlertTriangle,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type {
  MetricsResponse,
  ChartType,
  GranularityType,
  ComparisonPeriod,
  ComparisonMetrics,
} from "@shared/schema";
import { useManagerLog, buildApiUrl } from "@/contexts/ManagerLogContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  SalesTrendChart,
  ToDoStatusPieChart,
  SalesBreakdownChart,
  SalesHeatmapCalendar,
  WeekdaySalesChart,
  CollapsibleSection,
  ComparisonModeSelector,
  getComparisonDateRange,
} from "@/components/charts";

type DateRangePreset = "7days" | "30days" | "thisMonth" | "custom";

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
const DEFAULT_GRANULARITY: GranularityType = "daily";
const DEFAULT_CHART_TYPE: ChartType = "line";

export default function InsightsPage({ onViewLog }: InsightsPageProps) {
  const { clubId, clubName, apiBaseUrl } = useManagerLog();

  const [datePreset, setDatePreset] = useState<DateRangePreset>(DEFAULT_DATE_PRESET);
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  const [granularity, setGranularity] = useState<GranularityType>(DEFAULT_GRANULARITY);
  const [chartType, setChartType] = useState<ChartType>(DEFAULT_CHART_TYPE);

  const [comparisonPeriod, setComparisonPeriod] = useState<ComparisonPeriod>("none");
  const [customCompareStart, setCustomCompareStart] = useState<Date | undefined>(undefined);
  const [customCompareEnd, setCustomCompareEnd] = useState<Date | undefined>(undefined);

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
          endDate: format(endOfMonth(today), "yyyy-MM-dd"),
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
      dateRange.endDate,
      customCompareStart,
      customCompareEnd
    );
  }, [comparisonPeriod, dateRange, customCompareStart, customCompareEnd]);

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

  const comparisonChanges = useMemo((): ComparisonMetrics | null => {
    if (!metrics || !comparisonMetrics) return null;

    const calculateChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

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
  }, [metrics, comparisonMetrics]);

  const resetFilters = useCallback(() => {
    setDatePreset(DEFAULT_DATE_PRESET);
    setCustomStartDate(undefined);
    setCustomEndDate(undefined);
    setGranularity(DEFAULT_GRANULARITY);
    setChartType(DEFAULT_CHART_TYPE);
    setComparisonPeriod("none");
    setCustomCompareStart(undefined);
    setCustomCompareEnd(undefined);
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

  const dateRangeDisplay = `${format(parseISO(dateRange.startDate), "MMM d")} - ${format(parseISO(dateRange.endDate), "MMM d, yyyy")}`;

  const totalToDoItems = (metrics?.toDoStatus.open || 0) + (metrics?.toDoStatus.completed || 0);
  const completionRate =
    totalToDoItems > 0
      ? Math.round(((metrics?.toDoStatus.completed || 0) / totalToDoItems) * 100)
      : 0;

  const ChangeIndicator = ({ value, inverted = false }: { value: number; inverted?: boolean }) => {
    const isPositive = inverted ? value < 0 : value > 0;
    const isNegative = inverted ? value > 0 : value < 0;

    if (value === 0) {
      return (
        <span className="text-muted-foreground text-xs flex items-center gap-1">
          <Minus className="h-3 w-3" /> 0%
        </span>
      );
    }

    return (
      <span
        className={`text-xs flex items-center gap-1 ${
          isPositive ? "text-green-600" : isNegative ? "text-red-600" : "text-muted-foreground"
        }`}
      >
        {value > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {value > 0 ? "+" : ""}
        {value}%
      </span>
    );
  };

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

  const hasData = metrics && metrics.summary.daysWithLogs > 0;

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card data-testid="card-days-logged">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                <CardTitle className="text-sm font-medium">Days Logged</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.summary.daysWithLogs}</div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">entries in selected range</p>
                  {comparisonChanges && (
                    <ChangeIndicator value={comparisonChanges.daysWithLogsChange} />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-total-sales">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(metrics.summary.totalSales)}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">combined sales</p>
                  {comparisonChanges && (
                    <ChangeIndicator value={comparisonChanges.totalSalesChange} />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-avg-sales">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                <CardTitle className="text-sm font-medium">Average Daily Sales</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(metrics.summary.averageDailySales)}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">per logged day</p>
                  {comparisonChanges && (
                    <ChangeIndicator value={comparisonChanges.averageDailySalesChange} />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-todo-status">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                <CardTitle className="text-sm font-medium">Maintenance Items</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.summary.openToDo} Open</div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {metrics.summary.completedToDo} completed ({completionRate}% rate)
                  </p>
                  {comparisonChanges && (
                    <ChangeIndicator value={comparisonChanges.openToDoChange} inverted />
                  )}
                </div>
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
                  <PopoverContent className="w-auto p-4" align="start">
                    <div className="space-y-4">
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

            <div className="lg:border-l lg:pl-4 space-y-2">
              <p className="text-sm font-medium text-muted-foreground">View By</p>
              <div className="flex flex-wrap gap-2">
                {(["daily", "weekly", "monthly"] as GranularityType[]).map((g) => (
                  <Button
                    key={g}
                    variant={granularity === g ? "default" : "outline"}
                    size="sm"
                    onClick={() => setGranularity(g)}
                    data-testid={`button-view-by-${g}`}
                  >
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <ComparisonModeSelector
              value={comparisonPeriod}
              onChange={setComparisonPeriod}
              currentStartDate={dateRange.startDate}
              currentEndDate={dateRange.endDate}
              customCompareStart={customCompareStart}
              customCompareEnd={customCompareEnd}
              onCustomCompareStartChange={setCustomCompareStart}
              onCustomCompareEndChange={setCustomCompareEnd}
            />
          </div>

          {datePreset === "custom" && customStartDate && customEndDate && (
            <p className="text-sm text-muted-foreground">
              Selected: {format(customStartDate, "MMM d, yyyy")} -{" "}
              {format(customEndDate, "MMM d, yyyy")}
            </p>
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
            title="Sales Trend"
            icon={<TrendingUp className="h-5 w-5" />}
            defaultExpanded={true}
          >
            <SalesTrendChart
              data={metrics.dailySales}
              comparisonData={comparisonMetrics?.dailySales}
              chartType={chartType}
              granularity={granularity}
              dateRange={dateRangeDisplay}
              clubName={clubName}
              onChartTypeChange={setChartType}
            />
            <div className="mt-6">
              <SalesHeatmapCalendar
                data={metrics.dailySales}
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
              data={metrics.dailySales}
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
                  <CardTitle className="text-sm font-medium">Avg Days Open</CardTitle>
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <ToDoStatusPieChart status={metrics.toDoStatus} />
              <SalesBreakdownChart salesByCategory={metrics.salesByCategory} />
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
