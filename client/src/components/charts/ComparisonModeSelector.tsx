/**
 * COMPARISON MODE SELECTOR COMPONENT
 * ====================================
 * Comparison toggle for analytics with preset week functionality.
 * Three options: Off, This Week vs Last Week, TWVSLY (This Week vs Last Year)
 * 
 * When clicking comparison buttons, they automatically set the date range
 * to the current week and compare to the corresponding period.
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
  onPresetWeek?: () => void;
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
  onPresetWeek,
}: ComparisonModeSelectorProps) {
  const comparisonRange = getComparisonDateRange(
    value,
    currentStartDate,
    currentEndDate
  );

  const handlePreviousPeriodClick = () => {
    if (onPresetWeek) {
      onPresetWeek();
    }
    onChange("previousPeriod");
  };

  const handlePreviousYearClick = () => {
    if (onPresetWeek) {
      onPresetWeek();
    }
    onChange("previousYear");
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <GitCompare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Compare</span>
      </div>
      
      <div className="flex gap-1">
        <Button
          variant={value === "none" ? "default" : "outline"}
          size="sm"
          onClick={() => onChange("none")}
          data-testid="button-compare-none"
        >
          Off
        </Button>
        <Button
          variant={value === "previousPeriod" ? "default" : "outline"}
          size="sm"
          onClick={handlePreviousPeriodClick}
          data-testid="button-compare-previousPeriod"
        >
          This Week vs Last Week
        </Button>
        <Button
          variant={value === "previousYear" ? "default" : "outline"}
          size="sm"
          onClick={handlePreviousYearClick}
          data-testid="button-compare-previousYear"
        >
          TWVSLY
        </Button>
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
