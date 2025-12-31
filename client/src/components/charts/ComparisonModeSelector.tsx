/**
 * COMPARISON MODE SELECTOR COMPONENT
 * ====================================
 * Simplified comparison toggle for analytics.
 * Three options: Off, Prior [N] Days (dynamic), Last Year
 * 
 * The middle option dynamically shows the actual number of days being compared
 * based on the current date range selection (e.g., "Prior 7 Days", "Prior 30 Days").
 * 
 * @example
 * <ComparisonModeSelector
 *   value="previousPeriod"
 *   onChange={setComparisonPeriod}
 *   currentStartDate="2025-12-01"
 *   currentEndDate="2025-12-31"
 * />
 */

import { format, subDays, subYears, differenceInDays, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { GitCompare } from "lucide-react";
import type { ComparisonPeriod } from "@shared/schema";

interface ComparisonModeSelectorProps {
  value: ComparisonPeriod;
  onChange: (value: ComparisonPeriod) => void;
  currentStartDate: string;
  currentEndDate: string;
}

function getDynamicPeriodLabel(startDate: string, endDate: string): string {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const days = differenceInDays(end, start) + 1;
  
  if (days === 1) return "Prior Day";
  if (days === 7) return "Prior Week";
  if (days >= 28 && days <= 31) return "Prior Month";
  return `Prior ${days} Days`;
}

/**
 * Calculates the comparison date range based on the selected period
 */
export function getComparisonDateRange(
  period: ComparisonPeriod,
  currentStart: string,
  currentEnd: string
): { startDate: string; endDate: string } | null {
  if (period === "none") {
    return null;
  }

  const start = parseISO(currentStart);
  const end = parseISO(currentEnd);
  const daysDiff = differenceInDays(end, start);

  switch (period) {
    case "previousPeriod":
      const prevEnd = subDays(start, 1);
      const prevStart = subDays(prevEnd, daysDiff);
      return {
        startDate: format(prevStart, "yyyy-MM-dd"),
        endDate: format(prevEnd, "yyyy-MM-dd"),
      };

    case "previousYear":
      return {
        startDate: format(subYears(start, 1), "yyyy-MM-dd"),
        endDate: format(subYears(end, 1), "yyyy-MM-dd"),
      };

    default:
      return null;
  }
}

export default function ComparisonModeSelector({
  value,
  onChange,
  currentStartDate,
  currentEndDate,
}: ComparisonModeSelectorProps) {
  const comparisonRange = getComparisonDateRange(
    value,
    currentStartDate,
    currentEndDate
  );

  const dynamicPeriodLabel = getDynamicPeriodLabel(currentStartDate, currentEndDate);

  const comparisonOptions: { value: ComparisonPeriod; label: string }[] = [
    { value: "none", label: "Off" },
    { value: "previousPeriod", label: dynamicPeriodLabel },
    { value: "previousYear", label: "Last Year" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <GitCompare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Compare</span>
      </div>
      
      <div className="flex gap-1">
        {comparisonOptions.map((option) => (
          <Button
            key={option.value}
            variant={value === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(option.value)}
            data-testid={`button-compare-${option.value}`}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {comparisonRange && value !== "none" && (
        <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
          vs {format(parseISO(comparisonRange.startDate), "MMM d")} –{" "}
          {format(parseISO(comparisonRange.endDate), "MMM d, yyyy")}
        </span>
      )}
    </div>
  );
}
