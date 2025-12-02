/**
 * WEEKDAY SALES CHART COMPONENT
 * ==============================
 * A bar chart showing sales performance by day of the week.
 * Helps identify which days perform best/worst for the restaurant.
 * 
 * Features:
 * - Aggregates sales by day of week (Sunday-Saturday)
 * - Shows both total and average sales per day
 * - Customizable chart options
 * - Export to PNG/PDF
 * 
 * @example
 * <WeekdaySalesChart
 *   data={metrics.dailySales}
 *   dateRange="Dec 1 - Dec 31, 2025"
 * />
 */

import { useMemo, useRef, useState } from "react";
import { format, parseISO, getDay } from "date-fns";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarRange } from "lucide-react";
import type { DailySalesData, WeekdaySalesData, ChartOptions } from "@shared/schema";
import ChartOptionsPopover, { DEFAULT_CHART_OPTIONS, CHART_COLOR_THEMES } from "./ChartOptionsPopover";
import ChartExportButton from "./ChartExportButton";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_ABBREVS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface WeekdaySalesChartProps {
  data: DailySalesData[];
  dateRange: string;
  clubName?: string;
}

export default function WeekdaySalesChart({
  data,
  dateRange,
  clubName,
}: WeekdaySalesChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [options, setOptions] = useState<ChartOptions>({
    ...DEFAULT_CHART_OPTIONS,
    showDataLabels: false,
  });

  const weekdayData = useMemo((): WeekdaySalesData[] => {
    const aggregated: Record<number, { totalSales: number; count: number }> = {};

    for (let i = 0; i < 7; i++) {
      aggregated[i] = { totalSales: 0, count: 0 };
    }

    data.forEach((d) => {
      const dayIndex = getDay(parseISO(d.date));
      aggregated[dayIndex].totalSales += d.totalSales;
      aggregated[dayIndex].count += 1;
    });

    return Object.entries(aggregated).map(([dayIndex, { totalSales, count }]) => ({
      dayOfWeek: DAY_NAMES[parseInt(dayIndex)],
      dayIndex: parseInt(dayIndex),
      totalSales,
      averageSales: count > 0 ? totalSales / count : 0,
      count,
    }));
  }, [data]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dayData = weekdayData.find((d) => d.dayOfWeek === label);
      return (
        <div className="bg-card border rounded-lg p-3 shadow-lg">
          <p className="font-medium mb-2">{label}</p>
          <p className="text-sm">
            <span className="text-muted-foreground">Total Sales:</span>{" "}
            <span className="font-bold">{formatCurrency(payload[0]?.value || 0)}</span>
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">Avg per day:</span>{" "}
            <span className="font-medium">{formatCurrency(dayData?.averageSales || 0)}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            ({dayData?.count || 0} {dayData?.count === 1 ? "day" : "days"} logged)
          </p>
        </div>
      );
    }
    return null;
  };

  const themeColors = CHART_COLOR_THEMES[options.colorTheme].colors;
  const primaryColor = themeColors[0];

  if (data.length === 0) {
    return (
      <Card data-testid="card-weekday-sales">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5" />
            Sales by Weekday
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px] flex items-center justify-center text-muted-foreground">
            No sales data available for this period
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-weekday-sales">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5" />
            Sales by Weekday
          </CardTitle>
          <div className="flex items-center gap-1">
            <ChartOptionsPopover
              options={options}
              onOptionsChange={setOptions}
              showCornerStyle={true}
            />
            <ChartExportButton
              chartRef={chartRef}
              title="Sales by Weekday"
              dateRange={dateRange}
              clubName={clubName}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent ref={chartRef}>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekdayData}>
              {options.showGridlines && (
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              )}
              <XAxis
                dataKey="dayOfWeek"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => DAY_ABBREVS[DAY_NAMES.indexOf(value)]}
              />
              <YAxis
                tickFormatter={(value) => `$${value.toLocaleString()}`}
                tick={{ fontSize: 12 }}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar
                dataKey="totalSales"
                name="Total Sales"
                fill={primaryColor}
                radius={options.cornerStyle === "rounded" ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                isAnimationActive={options.enableAnimations}
                label={
                  options.showDataLabels
                    ? {
                        position: "top",
                        formatter: (value: number) => formatCurrency(value),
                        fontSize: 10,
                      }
                    : false
                }
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
