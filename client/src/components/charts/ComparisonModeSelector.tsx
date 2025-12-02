/**
 * COMPARISON MODE SELECTOR COMPONENT
 * ====================================
 * A dropdown selector for enabling comparison mode in analytics.
 * Allows users to compare current period against historical periods.
 * 
 * HOW TO EXTEND COMPARISON MODE:
 * 1. Add new preset to ComparisonPeriod type in shared/schema.ts
 * 2. Add date calculation logic in getComparisonDateRange function below
 * 3. Add UI option in this component
 * 4. Update InsightsPage to handle the new comparison type
 * 
 * @example
 * <ComparisonModeSelector
 *   value="previousPeriod"
 *   onChange={setComparisonPeriod}
 *   currentStartDate="2025-12-01"
 *   currentEndDate="2025-12-31"
 * />
 */

import { useState } from "react";
import { format, subDays, subMonths, subYears, differenceInDays, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { GitCompare, Calendar } from "lucide-react";
import type { ComparisonPeriod } from "@shared/schema";

interface ComparisonModeSelectorProps {
  value: ComparisonPeriod;
  onChange: (value: ComparisonPeriod) => void;
  currentStartDate: string;
  currentEndDate: string;
  customCompareStart?: Date;
  customCompareEnd?: Date;
  onCustomCompareStartChange?: (date: Date | undefined) => void;
  onCustomCompareEndChange?: (date: Date | undefined) => void;
}

const COMPARISON_OPTIONS: { value: ComparisonPeriod; label: string }[] = [
  { value: "none", label: "No Comparison" },
  { value: "previousPeriod", label: "Previous Period" },
  { value: "previousMonth", label: "Previous Month" },
  { value: "previousYear", label: "Previous Year" },
  { value: "custom", label: "Custom Range" },
];

/**
 * Calculates the comparison date range based on the selected period
 * 
 * @param period - The comparison period type
 * @param currentStart - Current period start date (YYYY-MM-DD)
 * @param currentEnd - Current period end date (YYYY-MM-DD)
 * @param customStart - Optional custom start date
 * @param customEnd - Optional custom end date
 * @returns Object with startDate and endDate strings
 */
export function getComparisonDateRange(
  period: ComparisonPeriod,
  currentStart: string,
  currentEnd: string,
  customStart?: Date,
  customEnd?: Date
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

    case "previousMonth":
      return {
        startDate: format(subMonths(start, 1), "yyyy-MM-dd"),
        endDate: format(subMonths(end, 1), "yyyy-MM-dd"),
      };

    case "previousYear":
      return {
        startDate: format(subYears(start, 1), "yyyy-MM-dd"),
        endDate: format(subYears(end, 1), "yyyy-MM-dd"),
      };

    case "custom":
      if (customStart && customEnd) {
        return {
          startDate: format(customStart, "yyyy-MM-dd"),
          endDate: format(customEnd, "yyyy-MM-dd"),
        };
      }
      return null;

    default:
      return null;
  }
}

export default function ComparisonModeSelector({
  value,
  onChange,
  currentStartDate,
  currentEndDate,
  customCompareStart,
  customCompareEnd,
  onCustomCompareStartChange,
  onCustomCompareEndChange,
}: ComparisonModeSelectorProps) {
  const comparisonRange = getComparisonDateRange(
    value,
    currentStartDate,
    currentEndDate,
    customCompareStart,
    customCompareEnd
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <GitCompare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Compare To</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={value} onValueChange={(v) => onChange(v as ComparisonPeriod)}>
          <SelectTrigger className="w-[180px]" data-testid="select-comparison-period">
            <SelectValue placeholder="Select comparison" />
          </SelectTrigger>
          <SelectContent>
            {COMPARISON_OPTIONS.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                data-testid={`option-comparison-${option.value}`}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {value === "custom" && (
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-compare-start">
                  <Calendar className="h-4 w-4 mr-1" />
                  {customCompareStart
                    ? format(customCompareStart, "MMM d, yyyy")
                    : "Start"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={customCompareStart}
                  onSelect={onCustomCompareStartChange}
                  disabled={(date) =>
                    customCompareEnd ? date > customCompareEnd : false
                  }
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground">to</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-compare-end">
                  <Calendar className="h-4 w-4 mr-1" />
                  {customCompareEnd
                    ? format(customCompareEnd, "MMM d, yyyy")
                    : "End"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={customCompareEnd}
                  onSelect={onCustomCompareEndChange}
                  disabled={(date) =>
                    customCompareStart ? date < customCompareStart : false
                  }
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {comparisonRange && value !== "none" && (
          <span className="text-sm text-muted-foreground">
            ({format(parseISO(comparisonRange.startDate), "MMM d")} -{" "}
            {format(parseISO(comparisonRange.endDate), "MMM d, yyyy")})
          </span>
        )}
      </div>
    </div>
  );
}
