/**
 * INSIGHTS PAGE
 * =============
 * Advanced analytics dashboard for the restaurant manager's log.
 * Provides visual insights with multiple chart types, granularity controls,
 * and export capabilities.
 * 
 * Features:
 * - Date range filtering (Last 7 Days, Last 30 Days, This Month, Custom)
 * - Granularity selector (Daily, Weekly, Monthly)
 * - Chart type switching (Line, Bar, Area)
 * - Sales breakdown by category (Food, Bar, Gaming)
 * - To-Do status pie chart
 * - Top performing days table
 * - CSV export functionality
 * - Reset filters button
 * 
 * Data Flow:
 * 1. User selects date range and granularity
 * 2. Component fetches from /api/metrics with clubId, startDate, endDate
 * 3. Data is aggregated client-side based on granularity setting
 * 4. Results displayed in cards, charts, and tables
 * 
 * HOW TO ADD NEW METRICS:
 * 1. Add the metric type in shared/schema.ts (MetricsResponse interface)
 * 2. Compute the metric in server/routes.ts metrics endpoint
 * 3. Create a chart component in /components/charts/
 * 4. Add the chart to this page's layout
 * 
 * HOW GRANULARITY WORKS:
 * - The API always returns daily data
 * - Client-side aggregation groups data by week/month as needed
 * - This avoids extra API calls when switching granularity
 * 
 * HOW CSV EXPORT WORKS:
 * - Uses the current metrics data in memory
 * - Generates CSV with summary, daily sales, and to-do counts
 * - Downloads directly in the browser (no server round-trip)
 */

import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
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
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { MetricsResponse, ChartType, GranularityType } from "@shared/schema";
import { useManagerLog, buildApiUrl } from "@/contexts/ManagerLogContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { SalesTrendChart, ToDoStatusPieChart, SalesBreakdownChart } from "@/components/charts";

type DateRangePreset = "7days" | "30days" | "thisMonth" | "custom";

interface InsightsPageProps {
  onViewLog?: (logId: number, logDate: string) => void;
}

const DEFAULT_DATE_PRESET: DateRangePreset = "30days";
const DEFAULT_GRANULARITY: GranularityType = "daily";
const DEFAULT_CHART_TYPE: ChartType = "line";

export default function InsightsPage({ onViewLog }: InsightsPageProps) {
  const { clubId, apiBaseUrl } = useManagerLog();

  const [datePreset, setDatePreset] = useState<DateRangePreset>(DEFAULT_DATE_PRESET);
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  const [granularity, setGranularity] = useState<GranularityType>(DEFAULT_GRANULARITY);
  const [chartType, setChartType] = useState<ChartType>(DEFAULT_CHART_TYPE);

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

  const resetFilters = useCallback(() => {
    setDatePreset(DEFAULT_DATE_PRESET);
    setCustomStartDate(undefined);
    setCustomEndDate(undefined);
    setGranularity(DEFAULT_GRANULARITY);
    setChartType(DEFAULT_CHART_TYPE);
  }, []);

  /**
   * Export metrics data to CSV
   * Generates a CSV file with summary, daily sales, and to-do status
   */
  const exportToCSV = useCallback(() => {
    if (!metrics) return;

    const lines: string[] = [];

    lines.push("Restaurant Manager's Log - Insights Export");
    lines.push(`Date Range: ${dateRange.startDate} to ${dateRange.endDate}`);
    lines.push(`Generated: ${format(new Date(), "yyyy-MM-dd HH:mm:ss")}`);
    lines.push("");

    lines.push("SUMMARY");
    lines.push("Metric,Value");
    lines.push(`Days with Logs,${metrics.summary.daysWithLogs}`);
    lines.push(`Total Sales,$${metrics.summary.totalSales.toFixed(2)}`);
    lines.push(`Average Daily Sales,$${metrics.summary.averageDailySales.toFixed(2)}`);
    lines.push(`Open To-Do Items,${metrics.summary.openToDo}`);
    lines.push(`Completed To-Do Items,${metrics.summary.completedToDo}`);
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
  }, [metrics, dateRange]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const totalToDoItems = (metrics?.toDoStatus.open || 0) + (metrics?.toDoStatus.completed || 0);
  const completionRate =
    totalToDoItems > 0
      ? Math.round(((metrics?.toDoStatus.completed || 0) / totalToDoItems) * 100)
      : 0;

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
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Filters & Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="space-y-2">
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

            <div className="sm:border-l sm:pl-4 space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Granularity</p>
              <div className="flex flex-wrap gap-2">
                {(["daily", "weekly", "monthly"] as GranularityType[]).map((g) => (
                  <Button
                    key={g}
                    variant={granularity === g ? "default" : "outline"}
                    size="sm"
                    onClick={() => setGranularity(g)}
                    data-testid={`button-granularity-${g}`}
                  >
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card data-testid="card-days-logged">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                <CardTitle className="text-sm font-medium">Days Logged</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.summary.daysWithLogs}</div>
                <p className="text-xs text-muted-foreground">entries in selected range</p>
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
                <p className="text-xs text-muted-foreground">combined sales</p>
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
                <p className="text-xs text-muted-foreground">per logged day</p>
              </CardContent>
            </Card>

            <Card data-testid="card-todo-status">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                <CardTitle className="text-sm font-medium">To-Do List Items</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.summary.openToDo} Open</div>
                <p className="text-xs text-muted-foreground">
                  {metrics.summary.completedToDo} completed ({completionRate}% rate)
                </p>
              </CardContent>
            </Card>
          </div>

          <SalesTrendChart
            data={metrics.dailySales}
            chartType={chartType}
            granularity={granularity}
            onChartTypeChange={setChartType}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ToDoStatusPieChart status={metrics.toDoStatus} />
            <SalesBreakdownChart salesByCategory={metrics.salesByCategory} />
          </div>

          {metrics.topDays.length > 0 && (
            <Card data-testid="card-top-days">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Top Performing Days
                </CardTitle>
              </CardHeader>
              <CardContent>
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
          )}
        </>
      )}
    </div>
  );
}
