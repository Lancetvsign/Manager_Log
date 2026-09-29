/**
 * SALES TREND CHART COMPONENT
 * ===========================
 * A reusable chart component for displaying sales trends over time.
 * Supports multiple chart types (Line, Bar, Area) with smooth switching.
 * 
 * Features:
 * - Chart type switching without re-fetching data
 * - Granularity support (daily, weekly, monthly aggregation)
 * - Comparison mode with dashed overlay line
 * - Customizable chart options (gridlines, labels, animations, colors)
 * - Export to PNG/PDF
 * - Hover tooltips with date and sales info
 * - Social Club Pro theme colors
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
 *   comparisonData={comparisonMetrics?.dailySales}
 *   chartType="line"
 *   granularity="daily"
 *   options={chartOptions}
 *   onChartTypeChange={setChartType}
 *   onOptionsChange={setChartOptions}
 * />
 */

import { useMemo, useRef, useState } from "react";
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
  LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, BarChart3 as BarChartIcon, LineChart as LineChartIcon, AreaChart as AreaChartIcon } from "lucide-react";
import type { DailySalesData, ChartType, GranularityType, ChartOptions } from "@shared/schema";
import ChartOptionsPopover, { DEFAULT_CHART_OPTIONS, CHART_COLOR_THEMES } from "./ChartOptionsPopover";
import ChartExportButton from "./ChartExportButton";

interface SalesTrendChartProps {
  data: DailySalesData[];
  comparisonData?: DailySalesData[];
  chartType: ChartType;
  granularity: GranularityType;
  dateRange: string;
  clubName?: string;
  onChartTypeChange: (type: ChartType) => void;
}

interface AggregatedDataPoint {
  date: string;
  label: string;
  totalSales: number;
  comparisonSales?: number;
  foodSales: number;
  barSales: number;
  gamingSales: number;
  cateringSales: number;
  comparisonCateringSales?: number;
}

export default function SalesTrendChart({
  data,
  comparisonData,
  chartType,
  granularity,
  dateRange,
  clubName,
  onChartTypeChange,
}: SalesTrendChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [options, setOptions] = useState<ChartOptions>(DEFAULT_CHART_OPTIONS);

  const aggregateData = (
    salesData: DailySalesData[],
    gran: GranularityType
  ): Map<string, AggregatedDataPoint> => {
    const grouped = new Map<string, AggregatedDataPoint>();

    salesData.forEach((d) => {
      const dateObj = parseISO(d.date);
      let key: string;
      let label: string;

      if (gran === "daily") {
        key = d.date;
        label = format(dateObj, "MMM d");
      } else if (gran === "weekly") {
        const weekStart = startOfWeek(dateObj, { weekStartsOn: 0 });
        key = format(weekStart, "yyyy-MM-dd");
        label = `Week of ${format(weekStart, "MMM d")}`;
      } else {
        const monthStart = startOfMonth(dateObj);
        key = format(monthStart, "yyyy-MM");
        label = format(monthStart, "MMM yyyy");
      }

      const existing = grouped.get(key) || {
        date: key,
        label,
        totalSales: 0,
        foodSales: 0,
        barSales: 0,
        gamingSales: 0,
        cateringSales: 0,
      };

      grouped.set(key, {
        ...existing,
        totalSales: existing.totalSales + d.totalSales,
        foodSales: existing.foodSales + d.foodSales,
        barSales: existing.barSales + d.barSales,
        gamingSales: existing.gamingSales + d.gamingSales,
        cateringSales: existing.cateringSales + d.cateringSales,
      });
    });

    return grouped;
  };

  const aggregatedData = useMemo((): AggregatedDataPoint[] => {
    const mainData = aggregateData(data, granularity);
    const compData = comparisonData ? aggregateData(comparisonData, granularity) : null;

    const result = Array.from(mainData.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    if (compData && result.length > 0) {
      const compValues = Array.from(compData.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );
      result.forEach((point, index) => {
        if (compValues[index]) {
          point.comparisonSales = compValues[index].totalSales;
          point.comparisonCateringSales = compValues[index].cateringSales;
        }
      });
    }

    return result;
  }, [data, comparisonData, granularity]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatShortCurrency = (value: number) => {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}k`;
    }
    return `$${value}`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = aggregatedData.find((d) => d.label === label);
      return (
        <div className="bg-card border rounded-lg p-3 shadow-lg">
          <p className="font-medium mb-2">{dataPoint?.label || label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              <span className="font-medium">{entry.name}:</span>{" "}
              {formatCurrency(entry.value || 0)}
            </p>
          ))}
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

  const themeColors = CHART_COLOR_THEMES[options.colorTheme].colors;
  const primaryColor = themeColors[0];
  const secondaryColor = themeColors[1] || "hsl(0, 0%, 60%)";
  const cateringColor = themeColors[2] || "hsl(25, 95%, 53%)";

  const lineType = options.smoothing === "curved" ? "monotone" : "linear";
  const barRadius: [number, number, number, number] =
    options.cornerStyle === "rounded" ? [4, 4, 0, 0] : [0, 0, 0, 0];

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

    const hasComparison = comparisonData && comparisonData.length > 0;

    const chartComponents = {
      line: (
        <LineChart data={aggregatedData}>
          {options.showGridlines && (
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          )}
          <XAxis dataKey="label" {...commonAxisProps} />
          <YAxis
            tickFormatter={(value) => `$${value.toLocaleString()}`}
            {...commonAxisProps}
            width={70}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line
            type={lineType}
            dataKey="totalSales"
            name="Current Period"
            stroke={primaryColor}
            strokeWidth={2}
            dot={{ fill: primaryColor, strokeWidth: 2, r: aggregatedData.length <= 10 ? 4 : 2 }}
            activeDot={{ r: 6 }}
            isAnimationActive={options.enableAnimations}
          >
            {options.showDataLabels && (
              <LabelList
                dataKey="totalSales"
                position="top"
                formatter={formatShortCurrency}
                fontSize={10}
              />
            )}
          </Line>
          {hasComparison && (
            <Line
              type={lineType}
              dataKey="comparisonSales"
              name="Comparison Period"
              stroke={secondaryColor}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ fill: secondaryColor, strokeWidth: 2, r: 2 }}
              isAnimationActive={options.enableAnimations}
            />
          )}
          <Line
            type={lineType}
            dataKey="cateringSales"
            name="Catering"
            stroke={cateringColor}
            strokeWidth={2}
            dot={{ fill: cateringColor, strokeWidth: 2, r: aggregatedData.length <= 10 ? 4 : 2 }}
            activeDot={{ r: 6 }}
            isAnimationActive={options.enableAnimations}
          />
          {hasComparison && (
            <Line
              type={lineType}
              dataKey="comparisonCateringSales"
              name="Catering (Comparison)"
              stroke={cateringColor}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              isAnimationActive={options.enableAnimations}
            />
          )}
        </LineChart>
      ),
      bar: (
        <BarChart data={aggregatedData}>
          {options.showGridlines && (
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          )}
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
            name="Current Period"
            fill={primaryColor}
            radius={barRadius}
            isAnimationActive={options.enableAnimations}
          >
            {options.showDataLabels && (
              <LabelList
                dataKey="totalSales"
                position="top"
                formatter={formatShortCurrency}
                fontSize={10}
              />
            )}
          </Bar>
          {hasComparison && (
            <Bar
              dataKey="comparisonSales"
              name="Comparison Period"
              fill={secondaryColor}
              radius={barRadius}
              isAnimationActive={options.enableAnimations}
            />
          )}
          <Bar
            dataKey="cateringSales"
            name="Catering"
            fill={cateringColor}
            radius={barRadius}
            isAnimationActive={options.enableAnimations}
          />
          {hasComparison && (
            <Bar
              dataKey="comparisonCateringSales"
              name="Catering (Comparison)"
              fill={cateringColor}
              opacity={0.35}
              radius={barRadius}
              isAnimationActive={options.enableAnimations}
            />
          )}
        </BarChart>
      ),
      area: (
        <AreaChart data={aggregatedData}>
          {options.showGridlines && (
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          )}
          <XAxis dataKey="label" {...commonAxisProps} />
          <YAxis
            tickFormatter={(value) => `$${value.toLocaleString()}`}
            {...commonAxisProps}
            width={70}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Area
            type={lineType}
            dataKey="totalSales"
            name="Current Period"
            stroke={primaryColor}
            fill={primaryColor}
            fillOpacity={0.3}
            isAnimationActive={options.enableAnimations}
          >
            {options.showDataLabels && (
              <LabelList
                dataKey="totalSales"
                position="top"
                formatter={formatShortCurrency}
                fontSize={10}
              />
            )}
          </Area>
          {hasComparison && (
            <Area
              type={lineType}
              dataKey="comparisonSales"
              name="Comparison Period"
              stroke={secondaryColor}
              fill={secondaryColor}
              fillOpacity={0.1}
              strokeDasharray="5 5"
              isAnimationActive={options.enableAnimations}
            />
          )}
          <Area
            type={lineType}
            dataKey="cateringSales"
            name="Catering"
            stroke={cateringColor}
            fill={cateringColor}
            fillOpacity={0.18}
            isAnimationActive={options.enableAnimations}
          />
          {hasComparison && (
            <Area
              type={lineType}
              dataKey="comparisonCateringSales"
              name="Catering (Comparison)"
              stroke={cateringColor}
              fill={cateringColor}
              fillOpacity={0.06}
              strokeDasharray="5 5"
              isAnimationActive={options.enableAnimations}
            />
          )}
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
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
        <CardTitle className="text-sm font-medium">Sales Trend</CardTitle>
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
          <ChartOptionsPopover
            options={options}
            onOptionsChange={setOptions}
            showCornerStyle={chartType === "bar"}
            showSmoothing={chartType === "line" || chartType === "area"}
          />
          <ChartExportButton
            chartRef={chartRef}
            title="Sales Trend"
            dateRange={dateRange}
            clubName={clubName}
          />
        </div>
      </CardHeader>
      <CardContent ref={chartRef}>{renderChart()}</CardContent>
    </Card>
  );
}
