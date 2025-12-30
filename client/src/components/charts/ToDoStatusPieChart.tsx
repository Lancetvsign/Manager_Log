/**
 * TO-DO STATUS PIE CHART COMPONENT
 * ================================
 * A reusable pie/donut chart for displaying to-do item status distribution.
 * Shows Open vs Completed items with counts and percentages.
 * 
 * Features:
 * - Donut chart visualization
 * - Color-coded segments (teal for completed, red for open)
 * - Raw counts and percentages displayed
 * - Responsive sizing
 * 
 * @example
 * <ToDoStatusPieChart
 *   open={5}
 *   completed={12}
 * />
 */

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import type { ToDoStatus } from "@shared/schema";

const COLORS = {
  open: "hsl(var(--destructive))",
  completed: "hsl(174, 83.9%, 31.6%)",
};

interface ToDoStatusPieChartProps {
  status: ToDoStatus;
}

export default function ToDoStatusPieChart({ status }: ToDoStatusPieChartProps) {
  const total = status.open + status.completed;
  const completionRate = total > 0 ? Math.round((status.completed / total) * 100) : 0;

  const data = [
    { name: "Open", value: status.open, color: COLORS.open },
    { name: "Completed", value: status.completed, color: COLORS.completed },
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0];
      const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
      return (
        <div className="bg-card border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{item.name}</p>
          <p className="text-lg font-bold">{item.value} items</p>
          <p className="text-sm text-muted-foreground">{percentage}% of total</p>
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value, name }: any) => {
    if (value === 0) return null;
    
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

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

  if (total === 0) {
    return (
      <Card data-testid="card-todo-chart">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Maintenance List Status
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="h-36 flex items-center justify-center text-muted-foreground">
            No maintenance items in this period
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-todo-chart">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Maintenance List Status
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={65}
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
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-2 flex items-center justify-center gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-2" data-testid="text-todo-open">
            <span className="h-2 w-2 rounded-full bg-destructive" />
            {status.open} Open
          </div>
          <div className="flex items-center gap-2" data-testid="text-todo-completed">
            <span className="h-2 w-2 rounded-full bg-primary" />
            {status.completed} Completed
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-1" data-testid="text-completion-rate">
          {completionRate}% completion rate
        </p>
      </CardContent>
    </Card>
  );
}
