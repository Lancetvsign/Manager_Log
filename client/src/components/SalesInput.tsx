import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus, Pencil, Check, X, Target, Plus, DollarSign } from "lucide-react";
import { format, parseISO } from "date-fns";
import AddHistoricalDataDialog from "./AddHistoricalDataDialog";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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

interface BudgetData {
  foodSales: string;
  barSales: string;
  gamingSales: string;
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
  onBudgetSave?: (budget: BudgetData) => void;
  hasLastWeekData?: boolean;
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
}: SalesInputProps) {
  const [comparisonMode, setComparisonMode] = useState<"lastYear" | "lastWeek" | "budget">("lastYear");
  const [budgetEditOpen, setBudgetEditOpen] = useState(false);
  const [editBudgetFood, setEditBudgetFood] = useState("");
  const [editBudgetBar, setEditBudgetBar] = useState("");
  const [editBudgetGaming, setEditBudgetGaming] = useState("");

  const budgetComparison = budget
    ? { food: budget.foodSales, bar: budget.barSales, gaming: budget.gamingSales }
    : { food: "", bar: "", gaming: "" };

  const activeComparison = comparisonMode === "lastWeek"
    ? (salesData.lastWeek || { food: "", bar: "", gaming: "" })
    : comparisonMode === "budget"
    ? budgetComparison
    : salesData.lastYear;

  const hasActiveComparisonData = comparisonMode === "lastWeek"
    ? !!(salesData.lastWeek && (salesData.lastWeek.food !== undefined && salesData.lastWeek.food !== null && salesData.lastWeek.food !== ""))
    : comparisonMode === "budget"
    ? !!(budget && ((parseFloat(budget.foodSales) || 0) + (parseFloat(budget.barSales) || 0) + (parseFloat(budget.gamingSales) || 0)) > 0)
    : !!hasHistoricalData;

  const comparisonLabel = comparisonMode === "lastWeek" ? "Last Week" : comparisonMode === "budget" ? "Budget" : "Last Year";

  const foodChange = calculateChange(salesData.current.food, activeComparison.food);
  const barChange = calculateChange(salesData.current.bar, activeComparison.bar);
  const gamingChange = calculateChange(salesData.current.gaming, activeComparison.gaming);

  const currentTotal = 
    (parseFloat(salesData.current.food) || 0) +
    (parseFloat(salesData.current.bar) || 0) +
    (parseFloat(salesData.current.gaming) || 0);

  const comparisonTotal = 
    (parseFloat(activeComparison.food) || 0) +
    (parseFloat(activeComparison.bar) || 0) +
    (parseFloat(activeComparison.gaming) || 0);

  const difference = currentTotal - comparisonTotal;
  const diffPercentage = comparisonTotal !== 0 ? (difference / comparisonTotal) * 100 : 0;

  const formattedHistoricalDate = historicalCompareDate 
    ? format(parseISO(historicalCompareDate), 'MMM d, yyyy')
    : '';

  const budgetTotal = budget
    ? (parseFloat(budget.foodSales) || 0) + (parseFloat(budget.barSales) || 0) + (parseFloat(budget.gamingSales) || 0)
    : 0;

  const hasBudget = budget && budgetTotal > 0;

  const openBudgetEdit = () => {
    setEditBudgetFood(budget?.foodSales || "");
    setEditBudgetBar(budget?.barSales || "");
    setEditBudgetGaming(budget?.gamingSales || "");
    setBudgetEditOpen(true);
  };

  const saveBudget = () => {
    if (onBudgetSave) {
      onBudgetSave({
        foodSales: editBudgetFood,
        barSales: editBudgetBar,
        gamingSales: editBudgetGaming,
      });
    }
    setBudgetEditOpen(false);
  };

  return (
    <Card data-testid="card-sales">
      <CardHeader className="flex flex-col gap-2">
        <div className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Daily Budget Section */}
        <div className="rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-semibold flex items-center gap-1.5 uppercase tracking-wide text-muted-foreground">
              <Target className="h-4 w-4" />
              Daily Budget
            </span>
            {!disabled && (
              <Button
                variant="ghost"
                size="sm"
                onClick={openBudgetEdit}
                data-testid="button-edit-budget"
                className="gap-1"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            )}
          </div>
          {hasBudget ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Food Sales</Label>
                  <p className="text-2xl font-bold">${(parseFloat(budget?.foodSales || "0") || 0).toFixed(2)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Bar Sales</Label>
                  <p className="text-2xl font-bold">${(parseFloat(budget?.barSales || "0") || 0).toFixed(2)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Gaming Sales</Label>
                  <p className="text-2xl font-bold">${(parseFloat(budget?.gamingSales || "0") || 0).toFixed(2)}</p>
                </div>
              </div>
              <div className="border-t pt-3">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Budget Total:</span>
                  <span className="text-xl font-bold">${budgetTotal.toFixed(2)}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No budget set. {!disabled && "Click the edit button to set daily budget targets."}
            </p>
          )}
        </div>

        {/* Today's Sales Section */}
        <div className="rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-semibold flex items-center gap-1.5 uppercase tracking-wide text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              Today's Sales
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              {showComparison && hasActiveComparisonData && activeComparison.food && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{comparisonLabel}: ${activeComparison.food}</span>
                  <Badge variant="outline" className="flex items-center space-x-1">
                    {getTrendIcon(foodChange.trend)}
                    <span data-testid="text-food-change">{foodChange.percentage.toFixed(1)}%</span>
                  </Badge>
                </div>
              )}
            </div>

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
              {showComparison && hasActiveComparisonData && activeComparison.bar && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{comparisonLabel}: ${activeComparison.bar}</span>
                  <Badge variant="outline" className="flex items-center space-x-1">
                    {getTrendIcon(barChange.trend)}
                    <span data-testid="text-bar-change">{barChange.percentage.toFixed(1)}%</span>
                  </Badge>
                </div>
              )}
            </div>

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
              {showComparison && hasActiveComparisonData && activeComparison.gaming && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{comparisonLabel}: ${activeComparison.gaming}</span>
                  <Badge variant="outline" className="flex items-center space-x-1">
                    {getTrendIcon(gamingChange.trend)}
                    <span data-testid="text-gaming-change">{gamingChange.percentage.toFixed(1)}%</span>
                  </Badge>
                </div>
              )}
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="flex justify-between items-center">
              <span className="font-medium">Total Sales:</span>
              <span className="text-xl font-bold" data-testid="text-total-sales">
                ${currentTotal.toFixed(2)}
              </span>
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
                <div className="flex items-center gap-2">
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
                  {clubId && (
                    <AddHistoricalDataDialog
                      clubId={clubId}
                      apiBaseUrl={apiBaseUrl}
                      trigger={
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs px-2 gap-1 border-dashed"
                          data-testid="button-add-historical-comparison"
                        >
                          <Plus className="h-3 w-3" />
                          Add Data
                        </Button>
                      }
                    />
                  )}
                </div>
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
                />
              </div>
            </div>
          )}
        </div>

        {/* Budget Edit Dialog */}
        <Dialog open={budgetEditOpen} onOpenChange={setBudgetEditOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Set Daily Budget</DialogTitle>
              <DialogDescription>
                Set your daily sales budget targets for this club.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Food Sales Budget</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={editBudgetFood}
                  onChange={(e) => setEditBudgetFood(e.target.value)}
                  data-testid="input-budget-food"
                />
              </div>
              <div className="space-y-2">
                <Label>Bar Sales Budget</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={editBudgetBar}
                  onChange={(e) => setEditBudgetBar(e.target.value)}
                  data-testid="input-budget-bar"
                />
              </div>
              <div className="space-y-2">
                <Label>Gaming Sales Budget</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={editBudgetGaming}
                  onChange={(e) => setEditBudgetGaming(e.target.value)}
                  data-testid="input-budget-gaming"
                />
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm text-muted-foreground">
                  Total: ${((parseFloat(editBudgetFood) || 0) + (parseFloat(editBudgetBar) || 0) + (parseFloat(editBudgetGaming) || 0)).toFixed(2)}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setBudgetEditOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveBudget} data-testid="button-save-budget">
                    Save Budget
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
