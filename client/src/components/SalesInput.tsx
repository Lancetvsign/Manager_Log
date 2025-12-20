import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

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

export default function SalesInput({ title, salesData, onSalesChange, showComparison = true, disabled = false, comparisonDate }: SalesInputProps) {
  const [compareToLastYear, setCompareToLastYear] = useState(false);

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

  const hasLastYearData = lastYearTotal > 0;

  return (
    <Card data-testid="card-sales">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-lg">{title}</CardTitle>
        {showComparison && (
          <div className="flex items-center gap-2 flex-wrap">
            <Label htmlFor="compare-toggle" className="text-sm text-muted-foreground cursor-pointer">
              Compare to last year
            </Label>
            <Switch
              id="compare-toggle"
              checked={compareToLastYear}
              onCheckedChange={setCompareToLastYear}
              disabled={!hasLastYearData}
              data-testid="switch-compare-last-year"
            />
            {compareToLastYear && hasLastYearData && comparisonDate && (
              <span className="text-xs text-muted-foreground">
                (vs. {comparisonDate})
              </span>
            )}
            {!hasLastYearData && (
              <span className="text-xs text-muted-foreground">
                No data for comparison
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
            {compareToLastYear && salesData.lastYear.food && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Last year: ${salesData.lastYear.food}</span>
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
            {compareToLastYear && salesData.lastYear.bar && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Last year: ${salesData.lastYear.bar}</span>
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
            {compareToLastYear && salesData.lastYear.gaming && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Last year: ${salesData.lastYear.gaming}</span>
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

          {/* Last year comparison - only when toggle is ON */}
          {compareToLastYear && hasLastYearData && (
            <>
              <div className="flex justify-between items-center text-sm text-muted-foreground">
                <span>Last Year Total:</span>
                <span data-testid="text-last-year-total">${lastYearTotal.toFixed(2)}</span>
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
        </div>
      </CardContent>
    </Card>
  );
}
