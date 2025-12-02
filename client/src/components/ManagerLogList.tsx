import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, subDays } from "date-fns";
import { 
  Search, Eye, Calendar as CalendarIcon, DollarSign, Loader2, 
  CloudSun, ArrowLeft, Wrench, CheckCircle, AlertCircle, 
  Clock, Filter
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { ManagerLog, MaintenanceItem } from "@shared/schema";

type DateRangeFilter = "all" | "7days" | "30days" | "specific";

interface ManagerLogListProps {
  logs?: ManagerLog[];
}

export default function ManagerLogList({ logs: propLogs }: ManagerLogListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLog, setSelectedLog] = useState<ManagerLog | null>(null);
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>("all");
  const [specificDate, setSpecificDate] = useState<Date | undefined>(undefined);
  
  const { data: apiLogs, isLoading, error } = useQuery<ManagerLog[]>({
    queryKey: ['/api/manager-logs'],
  });

  const { data: maintenanceItems, isLoading: isLoadingMaintenance } = useQuery<MaintenanceItem[]>({
    queryKey: ['/api/manager-logs', selectedLog?.id, 'maintenance'],
    queryFn: async () => {
      if (!selectedLog?.id) return [];
      const response = await fetch(`/api/manager-logs/${selectedLog.id}/maintenance`);
      if (!response.ok) {
        throw new Error('Failed to fetch maintenance items');
      }
      return response.json();
    },
    enabled: !!selectedLog?.id,
  });

  const { data: specificDateLog, isLoading: isLoadingSpecificDate } = useQuery<ManagerLog>({
    queryKey: ['/api/manager-logs/by-date', specificDate ? format(specificDate, 'yyyy-MM-dd') : ''],
    enabled: !!specificDate && dateFilter === "specific",
  });
  
  const logs = apiLogs && apiLogs.length > 0 ? apiLogs : (propLogs || []);

  const getFilteredLogs = () => {
    let filtered = logs;

    if (dateFilter === "7days") {
      const sevenDaysAgo = subDays(new Date(), 7);
      filtered = logs.filter(log => new Date(log.logDate) >= sevenDaysAgo);
    } else if (dateFilter === "30days") {
      const thirtyDaysAgo = subDays(new Date(), 30);
      filtered = logs.filter(log => new Date(log.logDate) >= thirtyDaysAgo);
    } else if (dateFilter === "specific" && specificDate) {
      const dateStr = format(specificDate, 'yyyy-MM-dd');
      filtered = logs.filter(log => log.logDate === dateStr);
    }

    if (searchTerm) {
      filtered = filtered.filter(log =>
        log.managerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.logDate.includes(searchTerm) ||
        (log.dailyNotes?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
      );
    }

    return filtered;
  };

  const filteredLogs = getFilteredLogs();

  const calculateTotal = (food: string | null, bar: string | null, gaming: string | null) => {
    return (parseFloat(food || "0") || 0) + (parseFloat(bar || "0") || 0) + (parseFloat(gaming || "0") || 0);
  };

  const truncateNotes = (notes: string | null, maxLength: number = 100) => {
    if (!notes) return "No notes";
    return notes.length > maxLength ? notes.substring(0, maxLength) + "..." : notes;
  };

  const handleViewSpecificDate = () => {
    if (specificDateLog) {
      setSelectedLog(specificDateLog);
    }
  };

  const handleDateFilterChange = (filter: DateRangeFilter) => {
    setDateFilter(filter);
    if (filter !== "specific") {
      setSpecificDate(undefined);
    }
  };

  if (selectedLog) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-2xl font-bold">Log Entry Details</h2>
          <Button 
            variant="outline" 
            onClick={() => setSelectedLog(null)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Button>
        </div>

        {/* Header Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                <span>{selectedLog.logDate} - {selectedLog.dayOfWeek}</span>
              </div>
              <Badge variant="secondary">{selectedLog.managerName}</Badge>
            </CardTitle>
          </CardHeader>
        </Card>

        {/* Weather Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CloudSun className="h-5 w-5" />
                Weather on This Day
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{selectedLog.weather || "No weather data available"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CloudSun className="h-5 w-5" />
                Weather 1 Year Prior
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{selectedLog.weatherLastYear || "No historical weather data available"}</p>
            </CardContent>
          </Card>
        </div>

        {/* Sales Data */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Sales Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium">Food Sales</h4>
                <p className="text-2xl font-bold">${selectedLog.foodSales || "0.00"}</p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Bar Sales</h4>
                <p className="text-2xl font-bold">${selectedLog.barSales || "0.00"}</p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Gaming Sales</h4>
                <p className="text-2xl font-bold">${selectedLog.gamingSales || "0.00"}</p>
              </div>
            </div>
            <div className="border-t pt-4 mt-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <span className="font-medium">Total Sales:</span>
                <span className="text-xl font-bold">
                  ${selectedLog.totalSales || calculateTotal(selectedLog.foodSales, selectedLog.barSales, selectedLog.gamingSales).toFixed(2)}
                </span>
              </div>
            </div>
            {(selectedLog.dailyNumber || selectedLog.weeklyNumber) && (
              <div className="border-t pt-4 mt-4 flex gap-4 flex-wrap">
                {selectedLog.dailyNumber && (
                  <div>
                    <span className="font-medium">Daily Number:</span> {selectedLog.dailyNumber}
                  </div>
                )}
                {selectedLog.weeklyNumber && (
                  <div>
                    <span className="font-medium">Weekly Number:</span> {selectedLog.weeklyNumber}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sales Notes */}
        {selectedLog.salesNotes && (
          <Card>
            <CardHeader>
              <CardTitle>Sales Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{selectedLog.salesNotes}</p>
            </CardContent>
          </Card>
        )}

        {/* Daily Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{selectedLog.dailyNotes || "No notes recorded."}</p>
          </CardContent>
        </Card>

        {/* Maintenance Items */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Maintenance Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingMaintenance ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Loading maintenance items...</span>
              </div>
            ) : maintenanceItems && maintenanceItems.length > 0 ? (
              <div className="border rounded-lg divide-y">
                <div className="grid grid-cols-12 gap-2 p-3 bg-muted/50 text-sm font-medium">
                  <div className="col-span-5">Description</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-5">Notes</div>
                </div>
                {maintenanceItems.map((item) => (
                  <div 
                    key={item.id} 
                    className="grid grid-cols-12 gap-2 p-3 items-center"
                    data-testid={`maintenance-item-${item.id}`}
                  >
                    <div className="col-span-5 text-sm">{item.description}</div>
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
                    <div className="col-span-5 text-sm text-muted-foreground">
                      {item.notes || "-"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No maintenance items recorded for this date.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-2xl font-bold">Manager Log History</h2>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-48 md:w-64"
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Date Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col md:flex-row md:items-end gap-4">
              {/* Quick Filters */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Filter className="h-4 w-4" />
                  Quick Filters
                </Label>
                <div className="flex gap-2">
                  <Button
                    variant={dateFilter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleDateFilterChange("all")}
                    data-testid="button-filter-all"
                  >
                    All Logs
                  </Button>
                  <Button
                    variant={dateFilter === "7days" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleDateFilterChange("7days")}
                    data-testid="button-filter-7days"
                  >
                    <Clock className="h-4 w-4 mr-1" />
                    Last 7 Days
                  </Button>
                  <Button
                    variant={dateFilter === "30days" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleDateFilterChange("30days")}
                    data-testid="button-filter-30days"
                  >
                    <Clock className="h-4 w-4 mr-1" />
                    Last 30 Days
                  </Button>
                </div>
              </div>

              {/* Specific Date Picker */}
              <div className="space-y-2">
                <Label>Select Specific Date</Label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={dateFilter === "specific" ? "default" : "outline"}
                        className="w-48 justify-start text-left font-normal"
                        data-testid="button-date-picker"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {specificDate ? format(specificDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={specificDate}
                        onSelect={(date) => {
                          setSpecificDate(date);
                          setDateFilter("specific");
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {specificDate && dateFilter === "specific" && specificDateLog && (
                    <Button
                      variant="secondary"
                      onClick={handleViewSpecificDate}
                      data-testid="button-view-specific-date"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                  )}
                </div>
                {specificDate && dateFilter === "specific" && isLoadingSpecificDate && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading...
                  </p>
                )}
                {specificDate && dateFilter === "specific" && !isLoadingSpecificDate && !specificDateLog && (
                  <p className="text-sm text-muted-foreground">No log found for this date.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results count */}
        <div className="text-sm text-muted-foreground">
          Showing {filteredLogs.length} of {logs.length} log entries
          {dateFilter === "7days" && " from the last 7 days"}
          {dateFilter === "30days" && " from the last 30 days"}
          {dateFilter === "specific" && specificDate && ` for ${format(specificDate, "PPP")}`}
        </div>
      </div>

      {/* Log List */}
      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="text-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground">Loading log entries...</p>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-muted-foreground">Failed to load log entries. Please try again.</p>
            </CardContent>
          </Card>
        ) : filteredLogs.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-muted-foreground">
                {searchTerm || dateFilter !== "all" 
                  ? 'No log entries match your filters.' 
                  : 'No log entries found. Create your first entry!'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredLogs.map((log) => (
            <Card key={log.id} className="hover-elevate" data-testid={`card-log-${log.id}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  {/* Left side - Main info */}
                  <div className="flex-1 space-y-3 min-w-0">
                    {/* Header row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-semibold">{log.logDate}</span>
                      <Badge variant="outline">{log.dayOfWeek}</Badge>
                      <Badge variant="secondary">{log.managerName}</Badge>
                    </div>

                    {/* Weather */}
                    {log.weather && (
                      <div className="flex items-center gap-2 text-sm">
                        <CloudSun className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">{log.weather.split(',')[0]}</span>
                      </div>
                    )}

                    {/* Total Sales */}
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">Total Sales:</span>
                      <span className="font-bold text-lg">
                        ${log.totalSales || calculateTotal(log.foodSales, log.barSales, log.gamingSales).toFixed(2)}
                      </span>
                    </div>

                    {/* Notes preview */}
                    <div className="text-sm text-muted-foreground">
                      {truncateNotes(log.dailyNotes)}
                    </div>
                  </div>

                  {/* Right side - View button */}
                  <Button
                    variant="outline"
                    onClick={() => setSelectedLog(log)}
                    data-testid={`button-view-${log.id}`}
                    className="flex-shrink-0"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
