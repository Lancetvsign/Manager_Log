/**
 * SALES HEATMAP CALENDAR COMPONENT
 * =================================
 * A GitHub-style contribution heatmap showing sales intensity by day.
 * Each day is colored based on total sales relative to the period's maximum.
 * 
 * HOW THE HEATMAP IS GENERATED:
 * 1. Daily sales data is fetched from the metrics API
 * 2. Each day is assigned an intensity level (0-4) based on sales
 * 3. Intensity thresholds are calculated: [0, 25%, 50%, 75%, 100%] of max sales
 * 4. Days are rendered in a calendar grid with colors based on intensity
 * 
 * Intensity levels:
 * - 0: No data (gray)
 * - 1: Low sales (light teal)
 * - 2: Below average (medium-light teal)
 * - 3: Above average (medium-dark teal)
 * - 4: Peak sales (saturated teal)
 * 
 * Features:
 * - Compact grid for short date ranges (7-30 days)
 * - Full calendar grid for longer ranges
 * - Click on day to navigate to log details
 * - Tooltips showing date and sales amount
 * 
 * @example
 * <SalesHeatmapCalendar
 *   data={metrics.dailySales}
 *   startDate="2025-11-01"
 *   endDate="2025-11-30"
 *   onDayClick={(date) => viewLog(date)}
 * />
 */

import { useMemo, useRef } from "react";
import { format, parseISO, eachDayOfInterval, getWeek, getDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CalendarDays } from "lucide-react";
import type { DailySalesData, HeatmapDay, ChartOptions } from "@shared/schema";
import ChartOptionsPopover, { DEFAULT_CHART_OPTIONS } from "./ChartOptionsPopover";
import ChartExportButton from "./ChartExportButton";

const INTENSITY_COLORS = {
  0: "bg-muted",
  1: "bg-primary/20",
  2: "bg-primary/40",
  3: "bg-primary/60",
  4: "bg-primary",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface SalesHeatmapCalendarProps {
  data: DailySalesData[];
  startDate: string;
  endDate: string;
  dateRange: string;
  clubName?: string;
  onDayClick?: (date: string) => void;
}

export default function SalesHeatmapCalendar({
  data,
  startDate,
  endDate,
  dateRange,
  clubName,
  onDayClick,
}: SalesHeatmapCalendarProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  const heatmapData = useMemo((): HeatmapDay[] => {
    const salesMap = new Map<string, number>();
    data.forEach((d) => {
      salesMap.set(d.date, d.totalSales);
    });

    const maxSales = Math.max(...data.map((d) => d.totalSales), 1);

    const days = eachDayOfInterval({
      start: parseISO(startDate),
      end: parseISO(endDate),
    });

    return days.map((date) => {
      const dateStr = format(date, "yyyy-MM-dd");
      const totalSales = salesMap.get(dateStr) || 0;
      const hasData = salesMap.has(dateStr);

      let intensity: 0 | 1 | 2 | 3 | 4 = 0;
      if (hasData && totalSales > 0) {
        const ratio = totalSales / maxSales;
        if (ratio <= 0.25) intensity = 1;
        else if (ratio <= 0.5) intensity = 2;
        else if (ratio <= 0.75) intensity = 3;
        else intensity = 4;
      }

      return {
        date: dateStr,
        totalSales,
        intensity,
        hasData,
        dayOfWeek: DAY_NAMES[getDay(date)],
        weekNumber: getWeek(date),
      };
    });
  }, [data, startDate, endDate]);

  const weekGroups = useMemo(() => {
    const groups: HeatmapDay[][] = [];
    let currentWeek: HeatmapDay[] = [];
    let currentWeekNum = -1;

    heatmapData.forEach((day) => {
      if (day.weekNumber !== currentWeekNum) {
        if (currentWeek.length > 0) {
          groups.push(currentWeek);
        }
        currentWeek = [];
        currentWeekNum = day.weekNumber;
      }
      currentWeek.push(day);
    });

    if (currentWeek.length > 0) {
      groups.push(currentWeek);
    }

    return groups;
  }, [heatmapData]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const isCompact = heatmapData.length <= 31;

  return (
    <Card data-testid="card-heatmap">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
        <CardTitle className="text-sm font-medium">Sales Heatmap</CardTitle>
        <div className="flex items-center gap-1">
          <ChartExportButton
            chartRef={chartRef}
            title="Sales Heatmap"
            dateRange={dateRange}
            clubName={clubName}
          />
        </div>
      </CardHeader>
      <CardContent ref={chartRef}>
        {heatmapData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No sales data available for this period
          </div>
        ) : (
          <div className="space-y-4">
            {isCompact ? (
              <div className="flex flex-wrap gap-1">
                {heatmapData.map((day) => (
                  <Tooltip key={day.date}>
                    <TooltipTrigger asChild>
                      <button
                        className={`w-8 h-8 rounded-sm ${INTENSITY_COLORS[day.intensity]} transition-colors hover:ring-2 hover:ring-primary/50`}
                        onClick={() => day.hasData && onDayClick?.(day.date)}
                        disabled={!day.hasData}
                        data-testid={`heatmap-day-${day.date}`}
                      >
                        <span className="sr-only">{format(parseISO(day.date), "MMM d")}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{format(parseISO(day.date), "EEE, MMM d")}</p>
                      <p className="text-sm">
                        {day.hasData ? formatCurrency(day.totalSales) : "No data"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex gap-1 min-w-fit">
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground pt-5">
                    {DAY_NAMES.map((day) => (
                      <div key={day} className="h-4 flex items-center">
                        {day}
                      </div>
                    ))}
                  </div>

                  {weekGroups.map((week, weekIndex) => (
                    <div key={weekIndex} className="flex flex-col gap-1">
                      {weekIndex === 0 && (
                        <div className="text-xs text-muted-foreground h-4 text-center">
                          {format(parseISO(week[0].date), "MMM")}
                        </div>
                      )}
                      {weekIndex > 0 &&
                        format(parseISO(week[0].date), "d") === "1" && (
                          <div className="text-xs text-muted-foreground h-4 text-center">
                            {format(parseISO(week[0].date), "MMM")}
                          </div>
                        )}
                      {weekIndex > 0 &&
                        format(parseISO(week[0].date), "d") !== "1" && (
                          <div className="h-4" />
                        )}

                      {Array.from({ length: 7 }).map((_, dayIndex) => {
                        const day = week.find(
                          (d) => getDay(parseISO(d.date)) === dayIndex
                        );
                        if (!day) {
                          return <div key={dayIndex} className="w-4 h-4" />;
                        }
                        return (
                          <Tooltip key={day.date}>
                            <TooltipTrigger asChild>
                              <button
                                className={`w-4 h-4 rounded-sm ${INTENSITY_COLORS[day.intensity]} transition-colors hover:ring-2 hover:ring-primary/50`}
                                onClick={() => day.hasData && onDayClick?.(day.date)}
                                disabled={!day.hasData}
                                data-testid={`heatmap-day-${day.date}`}
                              >
                                <span className="sr-only">
                                  {format(parseISO(day.date), "MMM d")}
                                </span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-medium">
                                {format(parseISO(day.date), "EEE, MMM d")}
                              </p>
                              <p className="text-sm">
                                {day.hasData ? formatCurrency(day.totalSales) : "No data"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <span>Less</span>
              {([0, 1, 2, 3, 4] as const).map((intensity) => (
                <div
                  key={intensity}
                  className={`w-4 h-4 rounded-sm ${INTENSITY_COLORS[intensity]}`}
                />
              ))}
              <span>More</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
