/**
 * SALES BREAKDOWN CHART COMPONENT
 * ================================
 * A reusable pie/donut chart for displaying sales by category.
 * Shows Food, Bar, and Gaming sales with proportions.
 * 
 * Features:
 * - Donut chart visualization
 * - Color-coded segments for each category
 * - Percentage and dollar values displayed
 * - Responsive sizing
 * 
 * HOW TO ADD NEW CATEGORIES:
 * 1. Add the new field to SalesByCategory in shared/schema.ts
 * 2. Compute it in the metrics API (server/routes.ts)
 * 3. Add the category to the COLORS and data array below
 * 
 * @example
 * <SalesBreakdownChart salesByCategory={metrics.salesByCategory} />
 */

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart as PieChartIcon, Utensils, Wine, Gamepad2 } from "lucide-react";
import type { SalesByCategory } from "@shared/schema";

const COLORS = {
  food: "hsl(174, 83.9%, 31.6%)",
  bar: "hsl(217, 91%, 60%)",
  gaming: "hsl(280, 87%, 65%)",
};

interface SalesBreakdownChartProps {
  salesByCategory: SalesByCategory;
}

export default function SalesBreakdownChart({ salesByCategory }: SalesBreakdownChartProps) {
  const total = salesByCategory.total;

  const data = [
    { name: "Food", value: salesByCategory.food, color: COLORS.food, icon: Utensils },
    { name: "Bar", value: salesByCategory.bar, color: COLORS.bar, icon: Wine },
    { name: "Gaming", value: salesByCategory.gaming, color: COLORS.gaming, icon: Gamepad2 },
  ].filter((item) => item.value > 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0];
      const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
      return (
        <div className="bg-card border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{item.name}</p>
          <p className="text-lg font-bold">{formatCurrency(item.value)}</p>
          <p className="text-sm text-muted-foreground">{percentage}% of total</p>
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value }: any) => {
    if (value === 0) return null;

    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

    if (percentage < 5) return null;

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        className="text-xs font-medium"
      >
        {percentage}%
      </text>
    );
  };

  if (total === 0 || data.length === 0) {
    return (
      <Card data-testid="card-sales-breakdown">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChartIcon className="h-5 w-5" />
            Sales Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No categorized sales data in this period
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-sales-breakdown">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieChartIcon className="h-5 w-5" />
          Sales Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                labelLine={false}
                label={renderCustomLabel}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value) => <span className="text-sm">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          {[
            { label: "Food", value: salesByCategory.food, icon: Utensils, color: "text-primary" },
            { label: "Bar", value: salesByCategory.bar, icon: Wine, color: "text-blue-500" },
            { label: "Gaming", value: salesByCategory.gaming, icon: Gamepad2, color: "text-purple-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="text-center" data-testid={`text-sales-${label.toLowerCase()}`}>
              <div className="flex items-center justify-center gap-1 mb-1">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-sm font-medium">{label}</span>
              </div>
              <p className="text-sm text-muted-foreground">{formatCurrency(value)}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
