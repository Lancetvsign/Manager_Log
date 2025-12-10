import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

export default function SalesInput({ title, salesData, onSalesChange, showComparison = true, disabled = false }: SalesInputProps) {
  const foodChange = calculateChange(salesData.current.food, salesData.lastYear.food);
  const barChange = calculateChange(salesData.current.bar, salesData.lastYear.bar);
  const gamingChange = calculateChange(salesData.current.gaming, salesData.lastYear.gaming);

  return (
    <Card data-testid="card-sales">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
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
            {showComparison && salesData.lastYear.food && (
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
            {showComparison && salesData.lastYear.bar && (
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
            {showComparison && salesData.lastYear.gaming && (
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

        {/* Total */}
        <div className="border-t pt-4">
          <div className="flex justify-between items-center">
            <span className="font-medium">Total Sales:</span>
            <span className="text-xl font-bold" data-testid="text-total-sales">
              ${(
                (parseFloat(salesData.current.food) || 0) +
                (parseFloat(salesData.current.bar) || 0) +
                (parseFloat(salesData.current.gaming) || 0)
              ).toFixed(2)}
            </span>
          </div>
          {showComparison && (
            <div className="text-sm text-muted-foreground mt-1">
              Last year total: ${(
                (parseFloat(salesData.lastYear.food) || 0) +
                (parseFloat(salesData.lastYear.bar) || 0) +
                (parseFloat(salesData.lastYear.gaming) || 0)
              ).toFixed(2)}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}