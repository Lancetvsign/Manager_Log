import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus, Target, Plus, DollarSign, ChevronDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import AddHistoricalDataDialog from "./AddHistoricalDataDialog";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts";

export type ComparisonPeriod = "none" | "last_year" | "last_week";

interface SalesData {
  current: {
    food: string;
    bar: string;
    gaming: string;
    catering: string;
  };
  lastYear: {
    food: string;
    bar: string;
    gaming: string;
    catering: string;
  };
  lastWeek?: {
    food: string;
    bar: string;
    gaming: string;
    catering: string;
  };
}

interface BudgetData {
  foodSales: string;
  barSales: string;
  gamingSales: string;
  cateringSales: string;
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
  budget?: BudgetData;
  onBudgetSave?: (budget: Partial<BudgetData>) => void;
  hasLastWeekData?: boolean;
  collapsible?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const calculateChange = (current: string, comparison: string) => {
  const currentNum = parseFloat(current) || 0;
  const comparisonNum = parseFloat(comparison) || 0;
  
  if (comparisonNum === 0) return { percentage: 0, trend: 'neutral' };
  
  const change = ((currentNum - comparisonNum) / comparisonNum) * 100;
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
  apiBaseUrl,
  budget,
  onBudgetSave,
  hasLastWeekData,
  collapsible = false,
  isOpen = true,
  onOpenChange,
}: SalesInputProps) {
  const [comparisonMode, setComparisonMode] = useState<"lastYear" | "lastWeek" | "budget">("lastYear");
  const stripDecimals = (val: string | null | undefined) => {
    if (!val) return "";
    const n = parseFloat(val);
    return isNaN(n) ? val : n.toString();
  };

  const [localBudgetFood, setLocalBudgetFood] = useState(stripDecimals(budget?.foodSales));
  const [localBudgetBar, setLocalBudgetBar] = useState(stripDecimals(budget?.barSales));
  const [localBudgetGaming, setLocalBudgetGaming] = useState(stripDecimals(budget?.gamingSales));
  const [localBudgetCatering, setLocalBudgetCatering] = useState(stripDecimals(budget?.cateringSales));

  // Sync each field independently: saving one budget must not reset a different
  // field the manager is still typing while the query refetches.
  useEffect(() => {
    if (budget && document.activeElement?.id !== "budget-food-sales") setLocalBudgetFood(stripDecimals(budget.foodSales));
  }, [budget?.foodSales]);
  useEffect(() => {
    if (budget && document.activeElement?.id !== "budget-bar-sales") setLocalBudgetBar(stripDecimals(budget.barSales));
  }, [budget?.barSales]);
  useEffect(() => {
    if (budget && document.activeElement?.id !== "budget-gaming-sales") setLocalBudgetGaming(stripDecimals(budget.gamingSales));
  }, [budget?.gamingSales]);
  useEffect(() => {
    if (budget && document.activeElement?.id !== "budget-catering-sales") setLocalBudgetCatering(stripDecimals(budget.cateringSales));
  }, [budget?.cateringSales]);

  const saveBudgetOnBlur = useCallback((field: keyof BudgetData, value: string) => {
    onBudgetSave?.({ [field]: value });
  }, [onBudgetSave]);

  const budgetComparison = budget
    ? { food: budget.foodSales, bar: budget.barSales, gaming: budget.gamingSales, catering: budget.cateringSales }
    : { food: "", bar: "", gaming: "", catering: "" };

  const activeComparison = comparisonMode === "lastWeek"
    ? (salesData.lastWeek || { food: "", bar: "", gaming: "", catering: "" })
    : comparisonMode === "budget"
    ? budgetComparison
    : salesData.lastYear;

  const hasActiveComparisonData = comparisonMode === "lastWeek"
    ? !!(salesData.lastWeek && Object.values(salesData.lastWeek).some(value => value !== ""))
    : comparisonMode === "budget"
    ? !!(budget && ((parseFloat(budget.foodSales) || 0) + (parseFloat(budget.barSales) || 0) + (parseFloat(budget.gamingSales) || 0) + (parseFloat(budget.cateringSales) || 0)) > 0)
    : !!hasHistoricalData;

  const comparisonLabel = comparisonMode === "lastWeek" ? "Last Week" : comparisonMode === "budget" ? "Budget" : "Last Year";

  const foodChange = calculateChange(salesData.current.food, activeComparison.food);
  const barChange = calculateChange(salesData.current.bar, activeComparison.bar);
  const gamingChange = calculateChange(salesData.current.gaming, activeComparison.gaming);
  const cateringChange = calculateChange(salesData.current.catering, activeComparison.catering);

  const currentTotal = 
    (parseFloat(salesData.current.food) || 0) +
    (parseFloat(salesData.current.bar) || 0) +
    (parseFloat(salesData.current.gaming) || 0) +
    (parseFloat(salesData.current.catering) || 0);

  const comparisonTotal = 
    (parseFloat(activeComparison.food) || 0) +
    (parseFloat(activeComparison.bar) || 0) +
    (parseFloat(activeComparison.gaming) || 0) +
    (parseFloat(activeComparison.catering) || 0);

  const difference = currentTotal - comparisonTotal;
  const diffPercentage = comparisonTotal !== 0 ? (difference / comparisonTotal) * 100 : 0;

  const formattedHistoricalDate = historicalCompareDate 
    ? format(parseISO(historicalCompareDate), 'MMM d, yyyy')
    : '';

  const budgetTotal = budget
    ? (parseFloat(budget.foodSales) || 0) + (parseFloat(budget.barSales) || 0) + (parseFloat(budget.gamingSales) || 0) + (parseFloat(budget.cateringSales) || 0)
    : 0;

  const hasBudget = budget && budgetTotal > 0;

  const localBudgetTotal = 
    (parseFloat(localBudgetFood) || 0) +
    (parseFloat(localBudgetBar) || 0) +
    (parseFloat(localBudgetGaming) || 0) +
    (parseFloat(localBudgetCatering) || 0);

  const totalSales =
    (parseFloat(salesData.current.food) || 0) +
    (parseFloat(salesData.current.bar) || 0) +
    (parseFloat(salesData.current.gaming) || 0) +
    (parseFloat(salesData.current.catering) || 0);

  const cardHeader = (
    <CardHeader className={`flex flex-col gap-2${collapsible ? " cursor-pointer hover-elevate rounded-t-lg" : ""}`}>
      <div className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-lg">{title}</CardTitle>
        {collapsible && (
          <div className="flex items-center gap-3">
            {!isOpen && (
              <span className="text-sm text-muted-foreground font-medium">
                Total: ${totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
            <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        )}
      </div>
    </CardHeader>
  );

  return (
    <Collapsible open={collapsible ? isOpen : true} onOpenChange={collapsible ? onOpenChange : undefined}>
    <Card data-testid="card-sales">
      {collapsible ? (
        <CollapsibleTrigger asChild>{cardHeader}</CollapsibleTrigger>
      ) : cardHeader}
      <CollapsibleContent>
      <CardContent className="space-y-3">
        {/* Daily Budget Section */}
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-semibold flex items-center gap-1.5 uppercase tracking-wide text-muted-foreground">
              <Target className="h-4 w-4" />
              Daily Budget
            </span>
          </div>
          <div className="overflow-x-auto">
            <div className="flex min-w-[640px] items-end gap-2">
            <div className="min-w-[7rem] max-w-[11rem] flex-1 space-y-1.5">
              <Label htmlFor="budget-food-sales" className="text-sm font-medium">
                Food Sales
              </Label>
              <Input
                id="budget-food-sales"
                type="number"
                placeholder="0"
                value={localBudgetFood}
                onChange={(e) => setLocalBudgetFood(e.target.value)}
                onBlur={() => saveBudgetOnBlur("foodSales", localBudgetFood)}
                disabled={disabled}
                className="h-8 px-2 tabular-nums"
                data-testid="input-budget-food"
              />
            </div>
            <div className="min-w-[7rem] max-w-[11rem] flex-1 space-y-1.5">
              <Label htmlFor="budget-bar-sales" className="text-sm font-medium">
                Bar Sales
              </Label>
              <Input
                id="budget-bar-sales"
                type="number"
                placeholder="0"
                value={localBudgetBar}
                onChange={(e) => setLocalBudgetBar(e.target.value)}
                onBlur={() => saveBudgetOnBlur("barSales", localBudgetBar)}
                disabled={disabled}
                className="h-8 px-2 tabular-nums"
                data-testid="input-budget-bar"
              />
            </div>
            <div className="min-w-[7rem] max-w-[11rem] flex-1 space-y-1.5">
              <Label htmlFor="budget-gaming-sales" className="text-sm font-medium">
                Gaming Sales
              </Label>
              <Input
                id="budget-gaming-sales"
                type="number"
                placeholder="0"
                value={localBudgetGaming}
                onChange={(e) => setLocalBudgetGaming(e.target.value)}
                onBlur={() => saveBudgetOnBlur("gamingSales", localBudgetGaming)}
                disabled={disabled}
                className="h-8 px-2 tabular-nums"
                data-testid="input-budget-gaming"
              />
            </div>
            <div className="min-w-[7rem] max-w-[11rem] flex-1 space-y-1.5">
              <Label htmlFor="budget-catering-sales" className="text-sm font-medium">
                Catering
              </Label>
              <Input
                id="budget-catering-sales"
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                value={localBudgetCatering}
                onChange={(e) => setLocalBudgetCatering(e.target.value)}
                onBlur={() => saveBudgetOnBlur("cateringSales", localBudgetCatering)}
                disabled={disabled}
                className="h-8 px-2 tabular-nums"
                data-testid="input-budget-catering"
              />
            </div>
            <div className="ml-auto flex h-8 shrink-0 items-center gap-2 whitespace-nowrap">
              <span className="font-medium text-sm">Total:</span>
              <span className="text-xl font-bold">${localBudgetTotal.toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
            </div>
            </div>
          </div>
        </div>

        {/* Today's Sales Section */}
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold flex items-center gap-1.5 uppercase tracking-wide text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              Today's Sales
            </span>
          </div>
          <div className="overflow-x-auto">
            <div className="flex min-w-[640px] items-start gap-2">
            <div className="min-w-[7rem] max-w-[11rem] flex-1 space-y-1.5">
              <Label htmlFor="food-sales" className="text-sm font-medium">
                Food Sales
              </Label>
              <Input
                id="food-sales"
                type="number"
                placeholder="0"
                value={salesData.current.food}
                onChange={(e) => onSalesChange('food', e.target.value)}
                disabled={disabled}
                className="h-8 px-2 tabular-nums"
                data-testid="input-food-sales"
              />
              {showComparison && hasActiveComparisonData && activeComparison.food && (
                <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <span>{comparisonLabel}: ${activeComparison.food}</span>
                  <Badge variant="outline" className="flex items-center space-x-1">
                    {getTrendIcon(foodChange.trend)}
                    <span data-testid="text-food-change">{foodChange.percentage.toFixed(1)}%</span>
                  </Badge>
                </div>
              )}
            </div>

            <div className="min-w-[7rem] max-w-[11rem] flex-1 space-y-1.5">
              <Label htmlFor="bar-sales" className="text-sm font-medium">
                Bar Sales
              </Label>
              <Input
                id="bar-sales"
                type="number"
                placeholder="0"
                value={salesData.current.bar}
                onChange={(e) => onSalesChange('bar', e.target.value)}
                disabled={disabled}
                className="h-8 px-2 tabular-nums"
                data-testid="input-bar-sales"
              />
              {showComparison && hasActiveComparisonData && activeComparison.bar && (
                <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <span>{comparisonLabel}: ${activeComparison.bar}</span>
                  <Badge variant="outline" className="flex items-center space-x-1">
                    {getTrendIcon(barChange.trend)}
                    <span data-testid="text-bar-change">{barChange.percentage.toFixed(1)}%</span>
                  </Badge>
                </div>
              )}
            </div>

            <div className="min-w-[7rem] max-w-[11rem] flex-1 space-y-1.5">
              <Label htmlFor="gaming-sales" className="text-sm font-medium">
                Gaming Sales
              </Label>
              <Input
                id="gaming-sales"
                type="number"
                placeholder="0"
                value={salesData.current.gaming}
                onChange={(e) => onSalesChange('gaming', e.target.value)}
                disabled={disabled}
                className="h-8 px-2 tabular-nums"
                data-testid="input-gaming-sales"
              />
              {showComparison && hasActiveComparisonData && activeComparison.gaming && (
                <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <span>{comparisonLabel}: ${activeComparison.gaming}</span>
                  <Badge variant="outline" className="flex items-center space-x-1">
                    {getTrendIcon(gamingChange.trend)}
                    <span data-testid="text-gaming-change">{gamingChange.percentage.toFixed(1)}%</span>
                  </Badge>
                </div>
              )}
            </div>

            <div className="min-w-[7rem] max-w-[11rem] flex-1 space-y-1.5">
              <Label htmlFor="catering-sales" className="text-sm font-medium">
                Catering
              </Label>
              <Input
                id="catering-sales"
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                value={salesData.current.catering}
                onChange={(e) => onSalesChange('catering', e.target.value)}
                disabled={disabled}
                className="h-8 px-2 tabular-nums"
                data-testid="input-catering-sales"
              />
              {showComparison && hasActiveComparisonData && activeComparison.catering && (
                <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <span>{comparisonLabel}: ${activeComparison.catering}</span>
                  <Badge variant="outline" className="flex items-center space-x-1">
                    {getTrendIcon(cateringChange.trend)}
                    <span data-testid="text-catering-change">{cateringChange.percentage.toFixed(1)}%</span>
                  </Badge>
                </div>
              )}
            </div>

            <div className="ml-auto mt-[20px] flex h-8 shrink-0 items-center gap-2 whitespace-nowrap">
              <span className="font-medium text-sm">Total:</span>
              <span className="text-xl font-bold" data-testid="text-total-sales">
                ${currentTotal.toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </span>
            </div>
            </div>
          </div>
        </div>

        {/* Comparison Section */}
        <div className="space-y-3">

          {/* Comparison Chart */}
          {showComparison && (hasActiveComparisonData || hasHistoricalData) && (
            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {comparisonMode === "lastWeek" ? "Last Week Comparison" : comparisonMode === "budget" ? "Budget Comparison" : "Year-over-Year Comparison"}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant={comparisonMode === "lastYear" ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => setComparisonMode("lastYear")}
                      data-testid="button-compare-last-year"
                    >
                      Last Year
                    </Button>
                    <Button
                      variant={comparisonMode === "lastWeek" ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => setComparisonMode("lastWeek")}
                      disabled={!hasLastWeekData}
                      data-testid="button-compare-last-week"
                    >
                      Last Week
                    </Button>
                    <Button
                      variant={comparisonMode === "budget" ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => setComparisonMode("budget")}
                      disabled={!hasBudget}
                      data-testid="button-compare-budget"
                    >
                      Budget
                    </Button>
                  </div>
                </div>
                {hasActiveComparisonData && (
                  <span 
                    className={`text-sm font-semibold flex items-center gap-1 ${
                      difference >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                    data-testid="text-sales-difference"
                  >
                    {difference >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {difference >= 0 ? '+' : ''}{diffPercentage.toFixed(1)}%
                  </span>
                )}
              </div>
              
              {hasActiveComparisonData ? (
                <>
                  <div className="h-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { 
                            category: 'Food', 
                            comparison: parseFloat(activeComparison.food) || 0,
                            today: parseFloat(salesData.current.food) || 0
                          },
                          { 
                            category: 'Bar', 
                            comparison: parseFloat(activeComparison.bar) || 0,
                            today: parseFloat(salesData.current.bar) || 0
                          },
                          { 
                            category: 'Gaming', 
                            comparison: parseFloat(activeComparison.gaming) || 0,
                            today: parseFloat(salesData.current.gaming) || 0
                          },
                          {
                            category: 'Catering',
                            comparison: parseFloat(activeComparison.catering) || 0,
                            today: parseFloat(salesData.current.catering) || 0
                          },
                          { 
                            category: 'Total', 
                            comparison: comparisonTotal,
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
                            name === 'comparison' ? comparisonLabel : 'Today'
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
                          formatter={(value) => value === 'comparison' ? comparisonLabel : 'Today'}
                          wrapperStyle={{ fontSize: '11px' }}
                        />
                        <Bar 
                          dataKey="comparison" 
                          fill="#94a3b8"
                          radius={[3, 3, 0, 0]}
                          name="comparison"
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
                  
                  <div className="flex justify-between items-center text-xs pt-1 border-t border-muted/50">
                    <div className="text-muted-foreground">
                      <span className="font-medium">{comparisonLabel} Total:</span> ${comparisonTotal.toFixed(2)}
                    </div>
                    <div className={`font-semibold ${difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {difference >= 0 ? '+' : ''}${difference.toFixed(2)}
                    </div>
                    <div className="text-muted-foreground">
                      <span className="font-medium">Today Total:</span> <span data-testid="text-comparison-total">${currentTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground py-2">
                  No {comparisonLabel.toLowerCase()} data available for comparison.
                </p>
              )}
            </div>
          )}
          
          {showComparison && comparisonMode === "lastYear" && hasHistoricalData === false && historicalCompareDate && clubId && (
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
                  trigger={
                    <Button variant="outline" size="sm" className="gap-1 border-dashed">
                      <Plus className="h-3 w-3" />
                      Add Past Sales
                    </Button>
                  }
                />
              </div>
            </div>
          )}
        </div>

      </CardContent>
      </CollapsibleContent>
    </Card>
    </Collapsible>
  );
}
