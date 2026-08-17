/**
 * UNIFIED SALES CHART COMPONENT
 * ==============================
 * A combined chart replacing Sales Trend + Sales Breakdown.
 * Features series toggles for Total/Food/Bar/Gaming and chart type switching.
 *
 * Features:
 * - Multi-select series toggles (Total, Food, Bar, Gaming)
 * - Chart type switching (Line, Bar, Area)
 * - Comparison mode with dashed overlay lines (merged by label)
 * - Granularity support (daily, weekly, monthly aggregation)
 * - Export to PNG/PDF
 */

import { useMemo, useRef, useState } from "react";
import { format, startOfWeek, startOfMonth, parseISO } from "date-fns";
import {
  ResponsiveContainer,
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
import type { DailySalesData, ChartType, GranularityType, ComparisonPeriod } from "@shared/schema";
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
  comparisonPeriod?: ComparisonPeriod;
}

interface AggregatedPoint {
  label: string;
  sortKey: string;
  total: number;
  food: number;
  bar: number;
  gaming: number;
}

interface MergedSalesPoint {
  label: string;
  sortKey: string;
  current_total: number;
  current_food: number;
  current_bar: number;
  current_gaming: number;
  compare_total?: number;
  compare_food?: number;
  compare_bar?: number;
  compare_gaming?: number;
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

function aggregateByGranularity(
  salesData: DailySalesData[],
  gran: GranularityType
): AggregatedPoint[] {
  const grouped = new Map<string, AggregatedPoint>();

  salesData.forEach((d) => {
    const dateObj = parseISO(d.date);
    let label: string;
    let sortKey: string;

    if (gran === "daily") {
      label = format(dateObj, "MMM d");
      sortKey = d.date;
    } else if (gran === "weekly") {
      const weekStart = startOfWeek(dateObj, { weekStartsOn: 0 });
      label = `Wk ${format(weekStart, "MMM d")}`;
      sortKey = format(weekStart, "yyyy-MM-dd");
    } else {
      const monthStart = startOfMonth(dateObj);
      label = format(monthStart, "MMM yyyy");
      sortKey = format(monthStart, "yyyy-MM-dd");
    }

    const existing = grouped.get(sortKey) || {
      label,
      sortKey,
      total: 0,
      food: 0,
      bar: 0,
      gaming: 0,
    };

    grouped.set(sortKey, {
      ...existing,
      total: existing.total + d.totalSales,
      food: existing.food + d.foodSales,
      bar: existing.bar + d.barSales,
      gaming: existing.gaming + d.gamingSales,
    });
  });

  return Array.from(grouped.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function mergeSalesSeries(
  current: AggregatedPoint[],
  compare?: AggregatedPoint[]
): MergedSalesPoint[] {
  const merged: MergedSalesPoint[] = [];

  for (let i = 0; i < current.length; i++) {
    const p = current[i];
    const compPoint = compare && i < compare.length ? compare[i] : undefined;

    merged.push({
      label: p.label,
      sortKey: p.sortKey,
      current_total: p.total ?? 0,
      current_food: p.food ?? 0,
      current_bar: p.bar ?? 0,
      current_gaming: p.gaming ?? 0,
      compare_total: compPoint?.total,
      compare_food: compPoint?.food,
      compare_bar: compPoint?.bar,
      compare_gaming: compPoint?.gaming,
    });
  }

  return merged;
}

export default function SalesChart({
  data,
  comparisonData,
  chartType,
  granularity,
  dateRange,
  clubName,
  onChartTypeChange,
  comparisonPeriod,
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
    setVisible({ total: false, food: false, bar: false, gaming: false, [key]: true });
  }

  const effectiveGranularity: GranularityType = useMemo(() => {
    if (comparisonPeriod === "previousYear" && data.length >= 60) {
      return "monthly";
    }
    return granularity;
  }, [comparisonPeriod, data.length, granularity]);

  const mergedData = useMemo((): MergedSalesPoint[] => {
    const currentAggregated = aggregateByGranularity(data, effectiveGranularity);
    const compareAggregated = comparisonData
      ? aggregateByGranularity(comparisonData, effectiveGranularity)
      : undefined;
    return mergeSalesSeries(currentAggregated, compareAggregated);
  }, [data, comparisonData, effectiveGranularity]);

  const hasCompare = useMemo(() => {
    return mergedData.some(
      (p) =>
        p.compare_total !== undefined ||
        p.compare_food !== undefined ||
        p.compare_bar !== undefined ||
        p.compare_gaming !== undefined
    );
  }, [mergedData]);

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
      const currentItems = payload.filter((p: any) => p.dataKey?.startsWith("current_"));
      const compareItems = payload.filter((p: any) => p.dataKey?.startsWith("compare_"));

      return (
        <div className="bg-card border rounded-lg p-3 shadow-lg min-w-[180px]">
          <p className="font-medium mb-2 border-b pb-1">{label}</p>
          {currentItems.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-muted-foreground mb-1">Current Period</p>
              {currentItems.map((entry: any, index: number) => {
                const seriesKey = entry.dataKey.replace("current_", "") as SeriesKey;
                return (
                  <p key={index} className="text-sm" style={{ color: SERIES_COLORS[seriesKey]?.hex || entry.color }}>
                    <span className="font-medium">{SERIES_LABELS[seriesKey] || entry.name}:</span>{" "}
                    {formatCurrency(entry.value || 0)}
                  </p>
                );
              })}
            </div>
          )}
          {compareItems.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Comparison Period</p>
              {compareItems.map((entry: any, index: number) => {
                const seriesKey = entry.dataKey.replace("compare_", "") as SeriesKey;
                return (
                  <p key={index} className="text-sm opacity-70" style={{ color: SERIES_COLORS[seriesKey]?.hex || entry.color }}>
                    <span className="font-medium">{SERIES_LABELS[seriesKey] || entry.name}:</span>{" "}
                    {formatCurrency(entry.value || 0)}
                  </p>
                );
              })}
            </div>
          )}
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

  const renderLineOrArea = (key: SeriesKey) => {
    if (!visible[key]) return null;

    const currentKey = `current_${key}` as const;
    const compareKey = `compare_${key}` as const;
    const color = SERIES_COLORS[key].hsl;

    if (chartType === "area") {
      return (
        <>
          <Area
            key={currentKey}
            type={lineType}
            dataKey={currentKey}
            name={SERIES_LABELS[key]}
            stroke={color}
            fill={color}
            fillOpacity={0.15}
            isAnimationActive={enableAnimations}
          >
            {showDataLabels && (
              <LabelList
                dataKey={currentKey}
                position="top"
                formatter={formatShortCurrency}
                fontSize={10}
              />
            )}
          </Area>
          {hasCompare && (
            <Line
              key={compareKey}
              type={lineType}
              dataKey={compareKey}
              name={`${SERIES_LABELS[key]} (Prev)`}
              stroke={color}
              strokeWidth={2}
              strokeDasharray="6 6"
              opacity={0.6}
              dot={false}
              isAnimationActive={enableAnimations}
            />
          )}
        </>
      );
    }

    return (
      <>
        <Line
          key={currentKey}
          type={lineType}
          dataKey={currentKey}
          name={SERIES_LABELS[key]}
          stroke={color}
          strokeWidth={2}
          dot={{ fill: color, strokeWidth: 2, r: mergedData.length <= 10 ? 4 : 2 }}
          activeDot={{ r: 6 }}
          isAnimationActive={enableAnimations}
        >
          {showDataLabels && (
            <LabelList
              dataKey={currentKey}
              position="top"
              formatter={formatShortCurrency}
              fontSize={10}
            />
          )}
        </Line>
        {hasCompare && (
          <Line
            key={compareKey}
            type={lineType}
            dataKey={compareKey}
            name={`${SERIES_LABELS[key]} (Prev)`}
            stroke={color}
            strokeWidth={2}
            strokeDasharray="6 6"
            opacity={0.6}
            dot={false}
            isAnimationActive={enableAnimations}
          />
        )}
      </>
    );
  };

  const renderBars = (key: SeriesKey) => {
    if (!visible[key]) return null;

    const currentKey = `current_${key}` as const;
    const compareKey = `compare_${key}` as const;
    const color = SERIES_COLORS[key].hsl;

    return (
      <>
        <Bar
          key={currentKey}
          dataKey={currentKey}
          name={SERIES_LABELS[key]}
          fill={color}
          radius={barRadius}
          isAnimationActive={enableAnimations}
        >
          {showDataLabels && (
            <LabelList
              dataKey={currentKey}
              position="top"
              formatter={formatShortCurrency}
              fontSize={10}
            />
          )}
        </Bar>
        {hasCompare && (
          <Bar
            key={compareKey}
            dataKey={compareKey}
            name={`${SERIES_LABELS[key]} (Prev)`}
            fill={color}
            opacity={0.35}
            radius={barRadius}
            isAnimationActive={enableAnimations}
          />
        )}
      </>
    );
  };

  const renderChart = () => {
    if (mergedData.length === 0) {
      return (
        <div className="h-[280px] flex items-center justify-center text-muted-foreground">
          No sales data available for this period
        </div>
      );
    }

    return (
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={mergedData}>
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

            {chartType === "bar" ? (
              <>
                {renderBars("total")}
                {renderBars("food")}
                {renderBars("bar")}
                {renderBars("gaming")}
              </>
            ) : (
              <>
                {renderLineOrArea("total")}
                {renderLineOrArea("food")}
                {renderLineOrArea("bar")}
                {renderLineOrArea("gaming")}
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const chipBase = "px-3 py-1 rounded-md text-xs font-medium border transition cursor-pointer";

  return (
    <Card data-testid="card-sales-chart">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-row items-center justify-between space-y-0 gap-1">
            <CardTitle className="text-sm font-medium">Sales</CardTitle>
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
          {hasCompare && (
            <div className="text-xs text-muted-foreground">
              Solid = Current Period | Dashed/Lighter = Comparison Period
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent ref={chartRef}>{renderChart()}</CardContent>
    </Card>
  );
}
