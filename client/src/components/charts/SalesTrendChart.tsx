/**
 * SALES TREND CHART COMPONENT
 * ===========================
 * A reusable chart component for displaying sales trends over time.
 * Supports multiple chart types (Line, Bar, Area) with smooth switching.
 * 
 * Features:
 * - Chart type switching without re-fetching data
 * - Granularity support (daily, weekly, monthly aggregation)
 * - Hover tooltips with date and sales info
 * - Social Club Pro theme colors
 * - Graceful handling of sparse data (1-2 points)
 * 
 * HOW TO ADD NEW CHART TYPES:
 * 1. Add the new type to ChartType in shared/schema.ts
 * 2. Add the chart component import from recharts
 * 3. Add a case in the renderChart function below
 * 4. Update the chart type selector options
 * 
 * @example
 * <SalesTrendChart
 *   data={metrics.dailySales}
 *   chartType="line"
 *   granularity="daily"
 *   onChartTypeChange={setChartType}
 * />
 */

import { useMemo } from "react";
import { format, startOfWeek, startOfMonth, parseISO } from "date-fns";
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  AreaChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, BarChart3 as BarChartIcon, LineChart as LineChartIcon, AreaChart as AreaChartIcon } from "lucide-react";
import type { DailySalesData, ChartType, GranularityType } from "@shared/schema";

const PRIMARY_COLOR = "hsl(174, 83.9%, 31.6%)";

interface SalesTrendChartProps {
  data: DailySalesData[];
  chartType: ChartType;
  granularity: GranularityType;
  onChartTypeChange: (type: ChartType) => void;
}

interface AggregatedDataPoint {
  date: string;
  label: string;
  totalSales: number;
  foodSales: number;
  barSales: number;
  gamingSales: number;
}

export default function SalesTrendChart({
  data,
  chartType,
  granularity,
  onChartTypeChange,
}: SalesTrendChartProps) {
  /**
   * Aggregate data based on granularity setting
   * - daily: no aggregation, use raw data
   * - weekly: group by week start (Sunday)
   * - monthly: group by month
   */
  const aggregatedData = useMemo((): AggregatedDataPoint[] => {
    if (granularity === "daily") {
      return data.map((d) => ({
        date: d.date,
        label: format(parseISO(d.date), "MMM d"),
        totalSales: d.totalSales,
        foodSales: d.foodSales,
        barSales: d.barSales,
        gamingSales: d.gamingSales,
      }));
    }

    const grouped: Record<string, AggregatedDataPoint> = {};

    data.forEach((d) => {
      const dateObj = parseISO(d.date);
      let key: string;
      let label: string;

      if (granularity === "weekly") {
        const weekStart = startOfWeek(dateObj, { weekStartsOn: 0 });
        key = format(weekStart, "yyyy-MM-dd");
        label = `Week of ${format(weekStart, "MMM d")}`;
      } else {
        const monthStart = startOfMonth(dateObj);
        key = format(monthStart, "yyyy-MM");
        label = format(monthStart, "MMM yyyy");
      }

      if (!grouped[key]) {
        grouped[key] = {
          date: key,
          label,
          totalSales: 0,
          foodSales: 0,
          barSales: 0,
          gamingSales: 0,
        };
      }

      grouped[key].totalSales += d.totalSales;
      grouped[key].foodSales += d.foodSales;
      grouped[key].barSales += d.barSales;
      grouped[key].gamingSales += d.gamingSales;
    });

    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  }, [data, granularity]);

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
      const dataPoint = aggregatedData.find((d) => d.label === label);
      return (
        <div className="bg-card border rounded-lg p-3 shadow-lg">
          <p className="font-medium mb-1">{dataPoint?.label || label}</p>
          <p className="text-primary font-bold">
            {formatCurrency(payload[0]?.value || 0)}
          </p>
        </div>
      );
    }
    return null;
  };

  const chartTypes: { type: ChartType; icon: typeof LineChartIcon; label: string }[] = [
    { type: "line", icon: LineChartIcon, label: "Line" },
    { type: "bar", icon: BarChartIcon, label: "Bar" },
    { type: "area", icon: AreaChartIcon, label: "Area" },
  ];

  const commonAxisProps = {
    tick: { fontSize: 12 },
    className: "text-muted-foreground",
  };

  const renderChart = () => {
    if (aggregatedData.length === 0) {
      return (
        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
          No sales data available for this period
        </div>
      );
    }

    const chartComponents = {
      line: (
        <LineChart data={aggregatedData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" {...commonAxisProps} />
          <YAxis
            tickFormatter={(value) => `$${value.toLocaleString()}`}
            {...commonAxisProps}
            width={70}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line
            type="monotone"
            dataKey="totalSales"
            name="Total Sales"
            stroke={PRIMARY_COLOR}
            strokeWidth={2}
            dot={{ fill: PRIMARY_COLOR, strokeWidth: 2, r: aggregatedData.length <= 10 ? 4 : 2 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      ),
      bar: (
        <BarChart data={aggregatedData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" {...commonAxisProps} />
          <YAxis
            tickFormatter={(value) => `$${value.toLocaleString()}`}
            {...commonAxisProps}
            width={70}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar
            dataKey="totalSales"
            name="Total Sales"
            fill={PRIMARY_COLOR}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      ),
      area: (
        <AreaChart data={aggregatedData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" {...commonAxisProps} />
          <YAxis
            tickFormatter={(value) => `$${value.toLocaleString()}`}
            {...commonAxisProps}
            width={70}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Area
            type="monotone"
            dataKey="totalSales"
            name="Total Sales"
            stroke={PRIMARY_COLOR}
            fill={PRIMARY_COLOR}
            fillOpacity={0.3}
          />
        </AreaChart>
      ),
    };

    return (
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          {chartComponents[chartType]}
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <Card data-testid="card-sales-trend">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Sales Trend
          </CardTitle>
          <div className="flex items-center gap-1">
            {chartTypes.map(({ type, icon: Icon, label }) => (
              <Button
                key={type}
                variant={chartType === type ? "default" : "outline"}
                size="sm"
                onClick={() => onChartTypeChange(type)}
                className="gap-1"
                data-testid={`button-chart-${type}`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>{renderChart()}</CardContent>
    </Card>
  );
}
