/**
 * UNIFIED SALES CHART COMPONENT
 * ==============================
 * A combined chart replacing Sales Trend + Sales Breakdown.
 * Features series toggles for Total/Food/Bar/Gaming and chart type switching.
 *
 * Features:
 * - Multi-select series toggles (Total, Food, Bar, Gaming)
 * - Chart type switching (Line, Bar, Area)
 * - Comparison mode with dashed overlay lines
 * - Granularity support (daily, weekly, monthly aggregation)
 * - Export to PNG/PDF
 */

import { useMemo, useRef, useState } from "react";
import { format, startOfWeek, startOfMonth, parseISO } from "date-fns";
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  AreaChart,
  ComposedChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  BarChart3 as BarChartIcon,
  LineChart as LineChartIcon,
  AreaChart as AreaChartIcon,
} from "lucide-react";
import type { DailySalesData, ChartType, GranularityType } from "@shared/schema";
import ChartExportButton from "./ChartExportButton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings, Grid, Tag, Sparkles } from "lucide-react";

interface SalesChartProps {
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
  total: number;
  food: number;
  bar: number;
  gaming: number;
  comparisonTotal?: number;
  comparisonFood?: number;
  comparisonBar?: number;
  comparisonGaming?: number;
}

type SeriesKey = "total" | "food" | "bar" | "gaming";

const SERIES_COLORS: Record<SeriesKey, { hsl: string; hex: string; bg: string; border: string }> = {
  total: { hsl: "hsl(174, 83.9%, 31.6%)", hex: "#0d9488", bg: "rgba(13, 148, 136, 0.15)", border: "rgba(13, 148, 136, 0.4)" },
  food: { hsl: "hsl(47, 100%, 50%)", hex: "#eab308", bg: "rgba(234, 179, 8, 0.15)", border: "rgba(234, 179, 8, 0.4)" },
  bar: { hsl: "hsl(200, 100%, 50%)", hex: "#0ea5e9", bg: "rgba(14, 165, 233, 0.15)", border: "rgba(14, 165, 233, 0.4)" },
  gaming: { hsl: "hsl(280, 80%, 60%)", hex: "#a855f7", bg: "rgba(168, 85, 247, 0.15)", border: "rgba(168, 85, 247, 0.4)" },
};

const SERIES_LABELS: Record<SeriesKey, string> = {
  total: "Total",
  food: "Food",
  bar: "Bar",
  gaming: "Gaming",
};

export default function SalesChart({
  data,
  comparisonData,
  chartType,
  granularity,
  dateRange,
  clubName,
  onChartTypeChange,
}: SalesChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [showGridlines, setShowGridlines] = useState(true);
  const [enableAnimations, setEnableAnimations] = useState(true);
  const [showDataLabels, setShowDataLabels] = useState(false);
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    total: true,
    food: false,
    bar: false,
    gaming: false,
  });

  function toggleSeries(key: SeriesKey) {
    setVisible((v) => ({ ...v, [key]: !v[key] }));
  }

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
        total: 0,
        food: 0,
        bar: 0,
        gaming: 0,
      };

      grouped.set(key, {
        ...existing,
        total: existing.total + d.totalSales,
        food: existing.food + d.foodSales,
        bar: existing.bar + d.barSales,
        gaming: existing.gaming + d.gamingSales,
      });
    });

    return grouped;
  };

  const aggregatedData = useMemo((): AggregatedDataPoint[] => {
    const mainData = aggregateData(data, granularity);
    const compDataMap = comparisonData ? aggregateData(comparisonData, granularity) : null;

    const result = Array.from(mainData.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    if (compDataMap && result.length > 0) {
      const compValues = Array.from(compDataMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );
      result.forEach((point, index) => {
        if (index < compValues.length) {
          point.comparisonTotal = compValues[index].total;
          point.comparisonFood = compValues[index].food;
          point.comparisonBar = compValues[index].bar;
          point.comparisonGaming = compValues[index].gaming;
        }
      });
    }

    return result;
  }, [data, comparisonData, granularity]);

  const hasComparisonData = aggregatedData.some(
    (d) => d.comparisonTotal !== undefined || d.comparisonFood !== undefined || d.comparisonBar !== undefined || d.comparisonGaming !== undefined
  );

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

  const lineType = "monotone";
  const barRadius: [number, number, number, number] = [4, 4, 0, 0];

  const commonAxisProps = {
    tick: { fontSize: 12 },
    className: "text-muted-foreground",
  };

  const hasComparison = comparisonData && comparisonData.length > 0;

  const renderSeries = () => {
    const series: SeriesKey[] = ["total", "food", "bar", "gaming"];
    const comparisonKeys: Record<SeriesKey, keyof AggregatedDataPoint> = {
      total: "comparisonTotal",
      bar: "comparisonBar",
      food: "comparisonFood",
      gaming: "comparisonGaming",
    };

    if (chartType === "line") {
      return series.map(
        (key) =>
          visible[key] && (
            <Line
              key={key}
              type={lineType}
              dataKey={key}
              name={SERIES_LABELS[key]}
              stroke={SERIES_COLORS[key].hsl}
              strokeWidth={2}
              dot={{ fill: SERIES_COLORS[key].hsl, strokeWidth: 2, r: aggregatedData.length <= 10 ? 4 : 2 }}
              activeDot={{ r: 6 }}
              isAnimationActive={enableAnimations}
            >
              {showDataLabels && (
                <LabelList
                  dataKey={key}
                  position="top"
                  formatter={formatShortCurrency}
                  fontSize={10}
                />
              )}
            </Line>
          )
      );
    }

    if (chartType === "area") {
      return series.map(
        (key) =>
          visible[key] && (
            <Area
              key={key}
              type={lineType}
              dataKey={key}
              name={SERIES_LABELS[key]}
              stroke={SERIES_COLORS[key].hsl}
              fill={SERIES_COLORS[key].hsl}
              fillOpacity={0.15}
              isAnimationActive={enableAnimations}
            >
              {showDataLabels && (
                <LabelList
                  dataKey={key}
                  position="top"
                  formatter={formatShortCurrency}
                  fontSize={10}
                />
              )}
            </Area>
          )
      );
    }

    return series.map(
      (key) =>
        visible[key] && (
          <Bar
            key={key}
            dataKey={key}
            name={SERIES_LABELS[key]}
            fill={SERIES_COLORS[key].hsl}
            radius={barRadius}
            isAnimationActive={enableAnimations}
          >
            {showDataLabels && (
              <LabelList
                dataKey={key}
                position="top"
                formatter={formatShortCurrency}
                fontSize={10}
              />
            )}
          </Bar>
        )
    );
  };

  const renderComparisonSeries = () => {
    if (!hasComparisonData) return null;

    const series: SeriesKey[] = ["total", "food", "bar", "gaming"];
    const comparisonKeys: Record<SeriesKey, string> = {
      total: "comparisonTotal",
      food: "comparisonFood",
      bar: "comparisonBar",
      gaming: "comparisonGaming",
    };

    if (chartType === "line") {
      return series.map(
        (key) =>
          visible[key] && (
            <Line
              key={`comp-${key}`}
              type={lineType}
              dataKey={comparisonKeys[key]}
              name={`${SERIES_LABELS[key]} (Prev)`}
              stroke={SERIES_COLORS[key].hsl}
              strokeWidth={2}
              strokeDasharray="5 5"
              strokeOpacity={0.5}
              dot={false}
              isAnimationActive={enableAnimations}
            />
          )
      );
    }

    if (chartType === "area") {
      return series.map(
        (key) =>
          visible[key] && (
            <Area
              key={`comp-${key}`}
              type={lineType}
              dataKey={comparisonKeys[key]}
              name={`${SERIES_LABELS[key]} (Prev)`}
              stroke={SERIES_COLORS[key].hsl}
              fill={SERIES_COLORS[key].hsl}
              fillOpacity={0.05}
              strokeDasharray="5 5"
              strokeOpacity={0.5}
              isAnimationActive={enableAnimations}
            />
          )
      );
    }

    if (chartType === "bar") {
      return series.map(
        (key) =>
          visible[key] && (
            <Line
              key={`comp-${key}`}
              type={lineType}
              dataKey={comparisonKeys[key]}
              name={`${SERIES_LABELS[key]} (Prev)`}
              stroke={SERIES_COLORS[key].hsl}
              strokeWidth={2}
              strokeDasharray="5 5"
              strokeOpacity={0.6}
              dot={false}
              isAnimationActive={enableAnimations}
            />
          )
      );
    }

    return null;
  };

  const renderChart = () => {
    if (aggregatedData.length === 0) {
      return (
        <div className="h-[280px] flex items-center justify-center text-muted-foreground">
          No sales data available for this period
        </div>
      );
    }

    const commonChildren = (
      <>
        {showGridlines && (
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.15} />
        )}
        <XAxis dataKey="label" {...commonAxisProps} />
        <YAxis
          tickFormatter={(value) => `$${value.toLocaleString()}`}
          {...commonAxisProps}
          width={70}
        />
        <Tooltip content={<CustomTooltip />} />
      </>
    );

    const ChartComponent =
      chartType === "line" ? LineChart : chartType === "area" ? AreaChart : ComposedChart;

    return (
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ChartComponent data={aggregatedData}>
            {commonChildren}
            {renderSeries()}
            {renderComparisonSeries()}
          </ChartComponent>
        </ResponsiveContainer>
      </div>
    );
  };

  const chipBase = "px-3 py-1 rounded-md text-xs font-medium border transition cursor-pointer";

  return (
    <Card data-testid="card-sales-chart">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Sales
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    data-testid="button-chart-options"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56" align="end">
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm">Chart Options</h4>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Grid className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="gridlines" className="text-sm">Gridlines</Label>
                      </div>
                      <Switch
                        id="gridlines"
                        checked={showGridlines}
                        onCheckedChange={setShowGridlines}
                        data-testid="switch-gridlines"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="labels" className="text-sm">Data Labels</Label>
                      </div>
                      <Switch
                        id="labels"
                        checked={showDataLabels}
                        onCheckedChange={setShowDataLabels}
                        data-testid="switch-labels"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-muted-foreground" />
                        <Label htmlFor="animations" className="text-sm">Animations</Label>
                      </div>
                      <Switch
                        id="animations"
                        checked={enableAnimations}
                        onCheckedChange={setEnableAnimations}
                        data-testid="switch-animations"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <ChartExportButton
                chartRef={chartRef}
                title="Sales"
                dateRange={dateRange}
                clubName={clubName}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["total", "food", "bar", "gaming"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleSeries(key)}
                className={`${chipBase} ${
                  visible[key]
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                }`}
                style={
                  visible[key]
                    ? {
                        backgroundColor: SERIES_COLORS[key].bg,
                        borderColor: SERIES_COLORS[key].border,
                        color: SERIES_COLORS[key].hex,
                      }
                    : undefined
                }
                data-testid={`chip-${key}`}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full mr-1.5"
                  style={{ backgroundColor: SERIES_COLORS[key].hex }}
                />
                {SERIES_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent ref={chartRef}>{renderChart()}</CardContent>
    </Card>
  );
}
