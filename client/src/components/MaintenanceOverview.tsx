/**
 * MAINTENANCE OVERVIEW PAGE
 * =========================
 * Displays all maintenance items across all daily logs with filtering capabilities.
 * This page provides a consolidated view of maintenance tasks, helping managers
 * track open issues and review completed work.
 * 
 * Features:
 * - Filter by status (All, Open, Completed)
 * - Filter by date range (Last 7 Days, Last 30 Days, All)
 * - View maintenance items with their associated log dates
 * - Navigate to the full daily log for any item
 * 
 * Data Flow:
 * 1. Component fetches from /api/maintenance-items with query params
 * 2. API joins maintenance_items with manager_logs to get dates
 * 3. Results displayed in a table with truncated notes
 * 4. "View Log" button navigates to the History detail view
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { format, subDays } from "date-fns";
import { 
  Wrench, Clock, CheckCircle, AlertCircle, 
  Loader2, Filter, ExternalLink, Calendar
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { MaintenanceItemWithLog } from "@shared/schema";
import { useManagerLog, buildApiUrl } from "@/contexts/ManagerLogContext";

// Filter types for status and date range
type StatusFilter = "all" | "open" | "completed";
type DateRangeFilter = "all" | "7days" | "30days";

interface MaintenanceOverviewProps {
  onViewLog?: (logId: number, logDate: string) => void;
}

/**
 * MaintenanceOverview Component
 * 
 * @param onViewLog - Callback when user clicks "View Log" to navigate to full log entry
 */
export default function MaintenanceOverview({ onViewLog }: MaintenanceOverviewProps) {
  const { clubId, apiBaseUrl } = useManagerLog();
  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>("30days");

  /**
   * Calculate date range based on filter selection
   * Returns { startDate, endDate } for API query params
   */
  const getDateRange = () => {
    const today = new Date();
    const endDate = format(today, 'yyyy-MM-dd');
    
    if (dateFilter === "7days") {
      return {
        startDate: format(subDays(today, 7), 'yyyy-MM-dd'),
        endDate
      };
    } else if (dateFilter === "30days") {
      return {
        startDate: format(subDays(today, 30), 'yyyy-MM-dd'),
        endDate
      };
    }
    return {}; // "all" - no date filter
  };

  /**
   * Fetch maintenance items with current filters
   * Uses explicit queryFn since we need to pass query parameters
   */
  const { data: items, isLoading, error } = useQuery<MaintenanceItemWithLog[]>({
    queryKey: ['/api/maintenance-items', statusFilter, dateFilter, clubId],
    queryFn: async () => {
      const dateRange = getDateRange();
      const params: Record<string, string> = { clubId };
      
      if (statusFilter !== "all") {
        params.status = statusFilter;
      }
      if (dateRange.startDate) {
        params.startDate = dateRange.startDate;
      }
      if (dateRange.endDate) {
        params.endDate = dateRange.endDate;
      }
      
      const queryString = new URLSearchParams(params).toString();
      const response = await fetch(`${apiBaseUrl}/api/maintenance-items?${queryString}`);
      if (!response.ok) {
        throw new Error('Failed to fetch maintenance items');
      }
      return response.json();
    },
  });

  /**
   * Truncate notes to ~80-100 characters for table display
   */
  const truncateNotes = (notes: string | null): string => {
    if (!notes) return "-";
    if (notes.length <= 80) return notes;
    return notes.substring(0, 80) + "...";
  };

  /**
   * Handle "View Log" button click
   * Navigates to the full daily log entry
   */
  const handleViewLog = (logId: number, logDate: string) => {
    if (onViewLog) {
      onViewLog(logId, logDate);
    }
  };

  /**
   * Get count of items by status for display
   */
  const openCount = items?.filter(item => item.status === "open").length || 0;
  const completedCount = items?.filter(item => item.status === "completed").length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Wrench className="h-6 w-6" />
          Maintenance List
        </h2>
        {items && (
          <div className="flex gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {openCount} Open
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              {completedCount} Completed
            </Badge>
          </div>
        )}
      </div>

      {/* Filters Card */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            {/* Status Filter */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Filter className="h-4 w-4" />
                Filter by Status
              </Label>
              <div className="flex gap-2">
                <Button
                  variant={statusFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("all")}
                  data-testid="button-status-all"
                >
                  All
                </Button>
                <Button
                  variant={statusFilter === "open" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("open")}
                  data-testid="button-status-open"
                >
                  <AlertCircle className="h-4 w-4 mr-1" />
                  Open
                </Button>
                <Button
                  variant={statusFilter === "completed" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("completed")}
                  data-testid="button-status-completed"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Completed
                </Button>
              </div>
            </div>

            {/* Date Range Filter */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Date Range
              </Label>
              <div className="flex gap-2">
                <Button
                  variant={dateFilter === "7days" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateFilter("7days")}
                  data-testid="button-date-7days"
                >
                  Last 7 Days
                </Button>
                <Button
                  variant={dateFilter === "30days" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateFilter("30days")}
                  data-testid="button-date-30days"
                >
                  Last 30 Days
                </Button>
                <Button
                  variant={dateFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateFilter("all")}
                  data-testid="button-date-all"
                >
                  All Time
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Count */}
      <div className="text-sm text-muted-foreground">
        Showing {items?.length || 0} maintenance items
        {statusFilter !== "all" && ` (${statusFilter})`}
        {dateFilter === "7days" && " from the last 7 days"}
        {dateFilter === "30days" && " from the last 30 days"}
      </div>

      {/* Maintenance Items Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span className="text-muted-foreground">Loading maintenance items...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Failed to load maintenance items. Please try again.</p>
            </div>
          ) : !items || items.length === 0 ? (
            <div className="text-center py-12">
              <Wrench className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                No maintenance items found for this range/status.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your filters or add maintenance items from the daily log.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-2 p-4 bg-muted/50 text-sm font-medium border-b min-w-[600px]">
                <div className="col-span-2">Date</div>
                <div className="col-span-4">Description</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-3">Notes</div>
                <div className="col-span-1">Action</div>
              </div>
              
              {/* Table Body */}
              <div className="divide-y min-w-[600px]">
                {items.map((item) => (
                  <div 
                    key={item.id} 
                    className="grid grid-cols-12 gap-2 p-4 items-center hover-elevate"
                    data-testid={`maintenance-row-${item.id}`}
                  >
                    {/* Date Column */}
                    <div className="col-span-2">
                      <div className="flex items-center gap-1 text-sm font-medium">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {item.logDate}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.dayOfWeek}
                      </div>
                    </div>
                    
                    {/* Description Column */}
                    <div className="col-span-4 text-sm">
                      {item.description}
                    </div>
                    
                    {/* Status Column */}
                    <div className="col-span-2">
                      <Badge 
                        variant={item.status === "completed" ? "default" : "secondary"}
                        className="flex items-center gap-1 w-fit"
                      >
                        {item.status === "completed" ? (
                          <CheckCircle className="h-3 w-3" />
                        ) : (
                          <AlertCircle className="h-3 w-3" />
                        )}
                        {item.status === "completed" ? "Completed" : "Open"}
                      </Badge>
                    </div>
                    
                    {/* Notes Column */}
                    <div className="col-span-3 text-sm text-muted-foreground">
                      {truncateNotes(item.notes)}
                    </div>
                    
                    {/* Action Column */}
                    <div className="col-span-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewLog(item.managerLogId, item.logDate)}
                        data-testid={`button-view-log-${item.id}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
