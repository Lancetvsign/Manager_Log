/**
 * INSIGHTS PAGE
 * =============
 * Displays analytics and metrics for the restaurant manager's log.
 * Provides visual insights into sales trends, to-do item status, and top performing days.
 * 
 * Features:
 * - Date range filtering (Last 7 Days, Last 30 Days, This Month, Custom)
 * - Summary cards with key metrics
 * - Sales trend line chart
 * - To-Do status bar chart
 * - Top days table with navigation to log details
 * 
 * Data Flow:
 * 1. User selects date range via filter buttons or date pickers
 * 2. Component fetches from /api/metrics with clubId, startDate, endDate
 * 3. API aggregates data from manager_logs and maintenance_items tables
 * 4. Results displayed in cards, charts, and tables
 * 
 * HOW TO ADD NEW METRICS:
 * 1. Add the metric type in shared/schema.ts (MetricsResponse interface)
 * 2. Compute the metric in server/routes.ts metrics endpoint
 * 3. Display the metric in this component (add card, chart, or table)
 */

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { 
  BarChart3, TrendingUp, Calendar, DollarSign, 
  Loader2, FileText, CheckCircle, AlertCircle, Eye
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { 
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip, BarChart, Bar, Cell, Legend
} from "recharts";
import type { MetricsResponse } from "@shared/schema";
import { useManagerLog, buildApiUrl } from "@/contexts/ManagerLogContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

type DateRangePreset = "7days" | "30days" | "thisMonth" | "custom";

interface InsightsPageProps {
  onViewLog?: (logId: number, logDate: string) => void;
}

export default function InsightsPage({ onViewLog }: InsightsPageProps) {
  const { clubId, apiBaseUrl } = useManagerLog();
  
  const [datePreset, setDatePreset] = useState<DateRangePreset>("30days");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);

  const dateRange = useMemo(() => {
    const today = new Date();
    
    switch (datePreset) {
      case "7days":
        return {
          startDate: format(subDays(today, 7), 'yyyy-MM-dd'),
          endDate: format(today, 'yyyy-MM-dd')
        };
      case "30days":
        return {
          startDate: format(subDays(today, 30), 'yyyy-MM-dd'),
          endDate: format(today, 'yyyy-MM-dd')
        };
      case "thisMonth":
        return {
          startDate: format(startOfMonth(today), 'yyyy-MM-dd'),
          endDate: format(endOfMonth(today), 'yyyy-MM-dd')
        };
      case "custom":
        if (customStartDate && customEndDate) {
          return {
            startDate: format(customStartDate, 'yyyy-MM-dd'),
            endDate: format(customEndDate, 'yyyy-MM-dd')
          };
        }
        return {
          startDate: format(subDays(today, 30), 'yyyy-MM-dd'),
          endDate: format(today, 'yyyy-MM-dd')
        };
      default:
        return {
          startDate: format(subDays(today, 30), 'yyyy-MM-dd'),
          endDate: format(today, 'yyyy-MM-dd')
        };
    }
  }, [datePreset, customStartDate, customEndDate]);

  const { data: metrics, isLoading, isError } = useQuery<MetricsResponse>({
    queryKey: ['/api/metrics', clubId, dateRange.startDate, dateRange.endDate],
    queryFn: async () => {
      const url = buildApiUrl('/api/metrics', clubId, apiBaseUrl, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      });
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch metrics');
      }
      return response.json();
    }
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatShortDate = (dateStr: string) => {
    return format(new Date(dateStr + 'T00:00:00'), 'MMM d');
  };

  const totalToDoItems = (metrics?.toDoStatus.open || 0) + (metrics?.toDoStatus.completed || 0);
  const completionRate = totalToDoItems > 0 
    ? Math.round((metrics?.toDoStatus.completed || 0) / totalToDoItems * 100) 
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
            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg mb-2">Unable to load insights</p>
            <p className="text-sm">Please try again later or select a different date range.</p>
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
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Date Range
          </CardTitle>
        </CardHeader>
        <CardContent>
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
                      disabled={(date) => customEndDate ? date > customEndDate : false}
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
                      disabled={(date) => customStartDate ? date < customStartDate : false}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {datePreset === "custom" && customStartDate && customEndDate && (
            <p className="text-sm text-muted-foreground mt-2">
              {format(customStartDate, 'MMM d, yyyy')} - {format(customEndDate, 'MMM d, yyyy')}
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
                No entries were found for this date range. Try expanding your dates or start logging daily activity.
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
                <p className="text-xs text-muted-foreground">
                  entries in selected range
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-total-sales">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(metrics.summary.totalSales)}</div>
                <p className="text-xs text-muted-foreground">
                  combined sales
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-avg-sales">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                <CardTitle className="text-sm font-medium">Average Daily Sales</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(metrics.summary.averageDailySales)}</div>
                <p className="text-xs text-muted-foreground">
                  per logged day
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-todo-status">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
                <CardTitle className="text-sm font-medium">To-Do Items</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics.summary.openToDo} Open
                </div>
                <p className="text-xs text-muted-foreground">
                  {metrics.summary.completedToDo} completed ({completionRate}% rate)
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2" data-testid="card-sales-trend">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Sales Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                {metrics.dailySales.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={metrics.dailySales}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={formatShortDate}
                          tick={{ fontSize: 12 }}
                          className="text-muted-foreground"
                        />
                        <YAxis 
                          tickFormatter={(value) => `$${value.toLocaleString()}`}
                          tick={{ fontSize: 12 }}
                          className="text-muted-foreground"
                          width={80}
                        />
                        <Tooltip 
                          formatter={(value: number) => [formatCurrency(value), 'Sales']}
                          labelFormatter={(label) => format(new Date(label + 'T00:00:00'), 'EEEE, MMM d, yyyy')}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="totalSales" 
                          stroke="hsl(174, 83.9%, 31.6%)" 
                          strokeWidth={2}
                          dot={{ fill: 'hsl(174, 83.9%, 31.6%)', strokeWidth: 2, r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No sales data available for this period
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-todo-chart">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  To-Do Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {totalToDoItems > 0 ? (
                  <>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          data={[
                            { name: 'Open', value: metrics.toDoStatus.open },
                            { name: 'Completed', value: metrics.toDoStatus.completed }
                          ]}
                          layout="vertical"
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 12 }} />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            tick={{ fontSize: 12 }}
                            width={80}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px'
                            }}
                          />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                            <Cell fill="hsl(var(--destructive))" />
                            <Cell fill="hsl(174, 83.9%, 31.6%)" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center justify-center gap-4 mt-4">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-destructive" />
                        <span className="text-sm">{metrics.toDoStatus.open} Open</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-primary" />
                        <span className="text-sm">{metrics.toDoStatus.completed} Completed</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                    No to-do items in this period
                  </div>
                )}
              </CardContent>
            </Card>
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
                        <p className="font-medium">{format(new Date(day.date + 'T00:00:00'), 'MMM d, yyyy')}</p>
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
