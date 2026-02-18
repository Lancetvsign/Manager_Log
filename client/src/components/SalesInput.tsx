import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format, parseISO } from "date-fns";
import AddHistoricalDataDialog from "./AddHistoricalDataDialog";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts";

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
        <div className="border-t pt-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="font-medium">Total Sales:</span>
            <span className="text-xl font-bold" data-testid="text-total-sales">
              ${currentTotal.toFixed(2)}
            </span>
          </div>

          {/* Year-over-Year Sparkline Chart - shown when historical data exists */}
          {showComparison && hasHistoricalData && (
            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Year-over-Year Comparison
                </span>
                <span 
                  className={`text-sm font-semibold flex items-center gap-1 ${
                    difference >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                  data-testid="text-sales-difference"
                >
                  {difference >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {difference >= 0 ? '+' : ''}{diffPercentage.toFixed(1)}%
                </span>
              </div>
              
              {/* Grouped Bar Chart - Category Comparison */}
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { 
                        category: 'Food', 
                        lastYear: parseFloat(comparisonData.food) || 0,
                        today: parseFloat(salesData.current.food) || 0
                      },
                      { 
                        category: 'Bar', 
                        lastYear: parseFloat(comparisonData.bar) || 0,
                        today: parseFloat(salesData.current.bar) || 0
                      },
                      { 
                        category: 'Gaming', 
                        lastYear: parseFloat(comparisonData.gaming) || 0,
                        today: parseFloat(salesData.current.gaming) || 0
                      },
                      { 
                        category: 'Total', 
                        lastYear: comparisonTotal,
                        today: currentTotal
                      }
                    ]}
                    margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                    barCategoryGap="15%"
                    barGap={2}
                  >
                    <XAxis 
                      dataKey="category" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis hide domain={[0, 'auto']} />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        `$${value.toFixed(2)}`, 
                        name === 'lastYear' ? 'Last Year' : 'Today'
                      ]}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '12px'
                      }}
                      cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                    />
                    <Legend 
                      formatter={(value) => value === 'lastYear' ? 'Last Year' : 'Today'}
                      wrapperStyle={{ fontSize: '11px' }}
                    />
                    <Bar 
                      dataKey="lastYear" 
                      fill="#94a3b8"
                      radius={[3, 3, 0, 0]}
                      name="lastYear"
                    />
                    <Bar 
                      dataKey="today" 
                      fill={difference >= 0 ? '#22c55e' : '#ef4444'}
                      radius={[3, 3, 0, 0]}
                      name="today"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              {/* Summary values */}
              <div className="flex justify-between items-center text-xs pt-1 border-t border-muted/50">
                <div className="text-muted-foreground">
                  <span className="font-medium">Last Year Total:</span> ${comparisonTotal.toFixed(2)}
                </div>
                <div className={`font-semibold ${difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {difference >= 0 ? '+' : ''}${difference.toFixed(2)}
                </div>
                <div className="text-muted-foreground">
                  <span className="font-medium">Today Total:</span> <span data-testid="text-comparison-total">${currentTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
          
          {showComparison && hasHistoricalData === false && historicalCompareDate && clubId && (
            <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">No comparison data for {formattedHistoricalDate}</span>
                  <p className="text-xs text-muted-foreground">Add past sales to unlock year-over-year charts and trends</p>
                </div>
                <AddHistoricalDataDialog
                  clubId={clubId}
                  apiBaseUrl={apiBaseUrl}
                  defaultDate={historicalCompareDate ? parseISO(historicalCompareDate) : undefined}
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
