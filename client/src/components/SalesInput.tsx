import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, Minus, GitCompare } from "lucide-react";

export type ComparisonPeriod = "none" | "last_year";

const COMPARISON_OPTIONS = [
  { value: "none", label: "No Comparison" },
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
}

interface SalesInputProps {
  title: string;
  salesData: SalesData;
  onSalesChange: (field: string, value: string) => void;
  showComparison?: boolean;
  disabled?: boolean;
  comparisonDate?: string;
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
  comparisonDate
}: SalesInputProps) {
  const [comparisonPeriod, setComparisonPeriod] = useState<ComparisonPeriod>("none");
  const showComparisonData = comparisonPeriod !== "none";

  const foodChange = calculateChange(salesData.current.food, salesData.lastYear.food);
  const barChange = calculateChange(salesData.current.bar, salesData.lastYear.bar);
  const gamingChange = calculateChange(salesData.current.gaming, salesData.lastYear.gaming);

  const currentTotal = 
    (parseFloat(salesData.current.food) || 0) +
    (parseFloat(salesData.current.bar) || 0) +
    (parseFloat(salesData.current.gaming) || 0);

  const lastYearTotal = 
    (parseFloat(salesData.lastYear.food) || 0) +
    (parseFloat(salesData.lastYear.bar) || 0) +
    (parseFloat(salesData.lastYear.gaming) || 0);

  const difference = currentTotal - lastYearTotal;
  const diffPercentage = lastYearTotal !== 0 ? (difference / lastYearTotal) * 100 : 0;

  const hasComparisonData = lastYearTotal > 0;

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
              onValueChange={(value) => setComparisonPeriod(value as ComparisonPeriod)}
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
            {showComparisonData && hasComparisonData && salesData.lastYear.food && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Comparison: ${salesData.lastYear.food}</span>
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
            {showComparisonData && hasComparisonData && salesData.lastYear.bar && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Comparison: ${salesData.lastYear.bar}</span>
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
            {showComparisonData && hasComparisonData && salesData.lastYear.gaming && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Comparison: ${salesData.lastYear.gaming}</span>
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
                <span data-testid="text-comparison-total">${lastYearTotal.toFixed(2)}</span>
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
