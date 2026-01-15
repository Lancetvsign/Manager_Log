import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, Minus, GitCompare, Plus, Upload } from "lucide-react";
import { format, parseISO } from "date-fns";

export type ComparisonPeriod = "none" | "last_year" | "last_week";

const COMPARISON_OPTIONS = [
  { value: "none", label: "No Comparison" },
  { value: "last_week", label: "Last Week Today" },
  { value: "last_year", label: "Same Day Last Year" },
] as const;

interface SalesData {
  current: {
    food: string;
    bar: string;
    gaming: string;
  };
  lastYear: {
    food: string;
    bar: string;
    gaming: string;
  };
  lastWeek?: {
    food: string;
    bar: string;
    gaming: string;
  };
}

interface SalesInputProps {
  title: string;
  salesData: SalesData;
  onSalesChange: (field: string, value: string) => void;
  showComparison?: boolean;
  disabled?: boolean;
  comparisonDate?: string;
  comparisonPeriod?: ComparisonPeriod;
  onComparisonPeriodChange?: (period: ComparisonPeriod) => void;
  onAddHistoricalData?: () => void;
  onBulkImport?: () => void;
  hasHistoricalData?: boolean;
  historicalCompareDate?: string;
}

const calculateChange = (current: string, lastYear: string) => {
  const currentNum = parseFloat(current) || 0;
  const lastYearNum = parseFloat(lastYear) || 0;
  
  if (lastYearNum === 0) return { percentage: 0, trend: 'neutral' };
  
  const change = ((currentNum - lastYearNum) / lastYearNum) * 100;
  return {
    percentage: Math.abs(change),
    trend: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral'
  };
};

const getTrendIcon = (trend: string) => {
  switch (trend) {
    case 'up':
      return <TrendingUp className="h-3 w-3 text-green-500" />;
    case 'down':
      return <TrendingDown className="h-3 w-3 text-red-500" />;
    default:
      return <Minus className="h-3 w-3 text-gray-500" />;
  }
};

export default function SalesInput({ 
  title, 
  salesData, 
  onSalesChange, 
  showComparison = true, 
  disabled = false, 
  comparisonDate,
  comparisonPeriod: externalPeriod,
  onComparisonPeriodChange,
  onAddHistoricalData,
  onBulkImport,
  hasHistoricalData,
  historicalCompareDate
}: SalesInputProps) {
  const [localComparisonPeriod, setLocalComparisonPeriod] = useState<ComparisonPeriod>("none");
  const comparisonPeriod = externalPeriod ?? localComparisonPeriod;
  const showComparisonData = comparisonPeriod !== "none";
  
  const handlePeriodChange = (value: ComparisonPeriod) => {
    setLocalComparisonPeriod(value);
    onComparisonPeriodChange?.(value);
  };

  // Get comparison data based on selected period
  const comparisonData = comparisonPeriod === "last_week" ? (salesData.lastWeek || { food: "", bar: "", gaming: "" }) : salesData.lastYear;

  const foodChange = calculateChange(salesData.current.food, comparisonData.food);
  const barChange = calculateChange(salesData.current.bar, comparisonData.bar);
  const gamingChange = calculateChange(salesData.current.gaming, comparisonData.gaming);

  const currentTotal = 
    (parseFloat(salesData.current.food) || 0) +
    (parseFloat(salesData.current.bar) || 0) +
    (parseFloat(salesData.current.gaming) || 0);

  const comparisonTotal = 
    (parseFloat(comparisonData.food) || 0) +
    (parseFloat(comparisonData.bar) || 0) +
    (parseFloat(comparisonData.gaming) || 0);

  const difference = currentTotal - comparisonTotal;
  const diffPercentage = comparisonTotal !== 0 ? (difference / comparisonTotal) * 100 : 0;

  const hasComparisonData = comparisonTotal > 0;

  // Format the historical compare date for display
  const formattedHistoricalDate = historicalCompareDate 
    ? format(parseISO(historicalCompareDate), 'MMM d, yyyy')
    : '';

  return (
    <Card data-testid="card-sales">
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-lg">{title}</CardTitle>
        {showComparison && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <GitCompare className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground hidden sm:inline">Compare:</span>
            </div>
            <Select
              value={comparisonPeriod}
              onValueChange={(value) => handlePeriodChange(value as ComparisonPeriod)}
            >
              <SelectTrigger 
                className="w-[160px] h-8 text-xs bg-primary/10 border-primary/30 focus:ring-primary"
                data-testid="select-comparison-period"
              >
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {COMPARISON_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showComparisonData && comparisonDate && (
              <span className="text-xs text-muted-foreground">
                (vs. {comparisonDate})
              </span>
            )}
            
            {/* Subtle historical data notification - only shown when no historical data */}
            {hasHistoricalData === false && historicalCompareDate && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="hidden sm:inline">
                  No historical data for {formattedHistoricalDate}.
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onAddHistoricalData}
                  data-testid="btn-add-last-year"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add last year
                </Button>
                {onBulkImport && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onBulkImport}
                    data-testid="btn-bulk-import"
                  >
                    <Upload className="h-3 w-3 mr-1" />
                    Bulk import
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Food Sales */}
          <div className="space-y-2">
            <Label htmlFor="food-sales" className="text-sm font-medium">
              Food Sales
            </Label>
            <Input
              id="food-sales"
              type="number"
              placeholder="0.00"
              value={salesData.current.food}
              onChange={(e) => onSalesChange('food', e.target.value)}
              disabled={disabled}
              data-testid="input-food-sales"
            />
            {showComparisonData && hasComparisonData && comparisonData.food && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Comparison: ${comparisonData.food}</span>
                <Badge variant="outline" className="flex items-center space-x-1">
                  {getTrendIcon(foodChange.trend)}
                  <span data-testid="text-food-change">{foodChange.percentage.toFixed(1)}%</span>
                </Badge>
              </div>
            )}
          </div>

          {/* Bar Sales */}
          <div className="space-y-2">
            <Label htmlFor="bar-sales" className="text-sm font-medium">
              Bar Sales
            </Label>
            <Input
              id="bar-sales"
              type="number"
              placeholder="0.00"
              value={salesData.current.bar}
              onChange={(e) => onSalesChange('bar', e.target.value)}
              disabled={disabled}
              data-testid="input-bar-sales"
            />
            {showComparisonData && hasComparisonData && comparisonData.bar && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Comparison: ${comparisonData.bar}</span>
                <Badge variant="outline" className="flex items-center space-x-1">
                  {getTrendIcon(barChange.trend)}
                  <span data-testid="text-bar-change">{barChange.percentage.toFixed(1)}%</span>
                </Badge>
              </div>
            )}
          </div>

          {/* Gaming Sales */}
          <div className="space-y-2">
            <Label htmlFor="gaming-sales" className="text-sm font-medium">
              Gaming Sales
            </Label>
            <Input
              id="gaming-sales"
              type="number"
              placeholder="0.00"
              value={salesData.current.gaming}
              onChange={(e) => onSalesChange('gaming', e.target.value)}
              disabled={disabled}
              data-testid="input-gaming-sales"
            />
            {showComparisonData && hasComparisonData && comparisonData.gaming && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Comparison: ${comparisonData.gaming}</span>
                <Badge variant="outline" className="flex items-center space-x-1">
                  {getTrendIcon(gamingChange.trend)}
                  <span data-testid="text-gaming-change">{gamingChange.percentage.toFixed(1)}%</span>
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* Totals Section */}
        <div className="border-t pt-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-medium">Total Sales:</span>
            <span className="text-xl font-bold" data-testid="text-total-sales">
              ${currentTotal.toFixed(2)}
            </span>
          </div>

          {/* Comparison totals - only when comparison is selected */}
          {showComparisonData && hasComparisonData && (
            <>
              <div className="flex justify-between items-center text-sm text-muted-foreground">
                <span>Comparison Total:</span>
                <span data-testid="text-comparison-total">${comparisonTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Difference:</span>
                <span 
                  className={`text-sm font-semibold flex items-center gap-1 ${
                    difference >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                  data-testid="text-sales-difference"
                >
                  {difference >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {difference >= 0 ? '+' : ''}${difference.toFixed(2)} ({diffPercentage >= 0 ? '+' : ''}{diffPercentage.toFixed(1)}%)
                </span>
              </div>
            </>
          )}
          {showComparisonData && !hasComparisonData && (
            <div className="text-sm text-muted-foreground italic">
              No data available for comparison period
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
