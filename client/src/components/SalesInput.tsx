import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format, parseISO } from "date-fns";
import AddHistoricalDataDialog from "./AddHistoricalDataDialog";

export type ComparisonPeriod = "none" | "last_year" | "last_week";

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
  hasHistoricalData?: boolean;
  historicalCompareDate?: string;
  clubId?: string;
  apiBaseUrl?: string;
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
  hasHistoricalData,
  historicalCompareDate,
  clubId,
  apiBaseUrl
}: SalesInputProps) {
  const comparisonData = salesData.lastYear;

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

  const formattedHistoricalDate = historicalCompareDate 
    ? format(parseISO(historicalCompareDate), 'MMM d, yyyy')
    : '';

  return (
    <Card data-testid="card-sales">
      <CardHeader className="flex flex-col gap-2">
        <div className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg">{title}</CardTitle>
        </div>
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
            {showComparison && hasHistoricalData && comparisonData.food && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Last Year: ${comparisonData.food}</span>
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
            {showComparison && hasHistoricalData && comparisonData.bar && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Last Year: ${comparisonData.bar}</span>
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
            {showComparison && hasHistoricalData && comparisonData.gaming && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Last Year: ${comparisonData.gaming}</span>
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

          {/* Same day last year comparison - shown when historical data exists */}
          {showComparison && hasHistoricalData && (
            <>
              <div className="flex justify-between items-center text-sm text-muted-foreground">
                <span>Same Day Last Year{comparisonDate ? ` (${comparisonDate})` : ''}:</span>
                <span data-testid="text-comparison-total">${comparisonTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Year-over-Year:</span>
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
          
          {/* Add Historical Data button - only shown when no historical data for same day last year */}
          {showComparison && hasHistoricalData === false && historicalCompareDate && clubId && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                No data for {formattedHistoricalDate}
              </span>
              <AddHistoricalDataDialog
                clubId={clubId}
                apiBaseUrl={apiBaseUrl}
                defaultDate={historicalCompareDate ? parseISO(historicalCompareDate) : undefined}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
