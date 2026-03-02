/**
 * MANAGER LOG LIST / HISTORY COMPONENT
 * =====================================
 * Displays the history of all manager log entries with filtering and detail view.
 * 
 * Features:
 * - Date range filters (All, Last 7 Days, Last 30 Days, Specific Date)
 * - Search by manager name, date, or notes content
 * - List view showing summary cards for each log
 * - Detail view showing full log with maintenance items
 * 
 * Props:
 * - logs: Optional array of logs (falls back to API fetch)
 * - initialSelectedLogId: If provided, opens the detail view for this log ID
 * - onLogSelected: Callback when a log is selected (used for cross-tab navigation)
 * 
 * Data Flow:
 * - Fetches all logs from /api/manager-logs
 * - When a log is selected, fetches its maintenance items from /api/manager-logs/:id/maintenance
 */

import { useState, useEffect, useRef } from "react";
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
  CloudSun, ArrowLeft, Wrench, Clock, Filter, Camera, Paperclip, X
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { ManagerLog, NotePhoto, LogAttachment } from "@shared/schema";
import { useManagerLog, buildApiUrl } from "@/contexts/ManagerLogContext";
import { MaintenanceItemsTable } from "./MaintenanceItemsTable";

interface MaintenanceSnapshotItem {
  id: number;
  itemId: number;
  status: string;
  notes: string | null;
  capturedAt: string;
  description: string;
  createdAt: string;
  photoUrl: string | null;
}

interface RunningMaintenanceItem {
  id: number;
  clubId: string;
  title: string;
  description: string | null;
  status: string;
  dateAdded: string;
  dateCompleted: string | null;
  createdBy: string | null;
  relatedLogDate: string | null;
}

type DateRangeFilter = "all" | "7days" | "30days" | "specific";

interface ManagerLogListProps {
  logs?: ManagerLog[];
  initialSelectedLogId?: number | null;
  onLogSelected?: () => void;
}

export default function ManagerLogList({ 
  logs: propLogs, 
  initialSelectedLogId,
  onLogSelected 
}: ManagerLogListProps) {
  const { clubId, apiBaseUrl } = useManagerLog();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLog, setSelectedLog] = useState<ManagerLog | null>(null);
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>("all");
  const [specificDate, setSpecificDate] = useState<Date | undefined>(undefined);
  
  const { data: apiLogs, isLoading, error } = useQuery<ManagerLog[]>({
    queryKey: ['/api/manager-logs', clubId],
    queryFn: async () => {
      const url = buildApiUrl('/api/manager-logs', clubId, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch logs');
      return response.json();
    },
  });

  const { data: snapshotItems, isLoading: isLoadingSnapshot } = useQuery<MaintenanceSnapshotItem[]>({
    queryKey: ['/api/manager-logs', selectedLog?.id, 'maintenance-snapshot', clubId],
    queryFn: async () => {
      if (!selectedLog?.id) return [];
      const url = buildApiUrl(`/api/manager-logs/${selectedLog.id}/maintenance-snapshot`, clubId, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch maintenance snapshot');
      }
      return response.json();
    },
    enabled: !!selectedLog?.id,
  });

  // Fetch running maintenance items for the selected log's date (with daily reset behavior)
  const { data: runningMaintenanceByDate, isLoading: isLoadingRunningMaintenance } = useQuery<RunningMaintenanceItem[]>({
    queryKey: ['/api/running-maintenance/by-date', selectedLog?.logDate, clubId],
    queryFn: async () => {
      if (!selectedLog?.logDate) return [];
      const url = buildApiUrl(`/api/running-maintenance/by-date/${selectedLog.logDate}`, clubId, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch running maintenance for date');
      }
      return response.json();
    },
    enabled: !!selectedLog?.logDate,
  });

  const { data: notePhotos = [], isLoading: isLoadingPhotos } = useQuery<NotePhoto[]>({
    queryKey: ['/api/logs', selectedLog?.id, 'note-photos', clubId],
    queryFn: async () => {
      if (!selectedLog?.id) return [];
      const url = buildApiUrl(`/api/logs/${selectedLog.id}/note-photos`, clubId, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!selectedLog?.id,
  });

  const { data: logAttachments = [], isLoading: isLoadingAttachments } = useQuery<LogAttachment[]>({
    queryKey: ['/api/logs', selectedLog?.id, 'attachments', clubId],
    queryFn: async () => {
      if (!selectedLog?.id) return [];
      const url = buildApiUrl(`/api/logs/${selectedLog.id}/attachments`, clubId, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!selectedLog?.id,
  });

  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  const { data: specificDateLog, isLoading: isLoadingSpecificDate } = useQuery<ManagerLog>({
    queryKey: ['/api/manager-logs/by-date', specificDate ? format(specificDate, 'yyyy-MM-dd') : '', clubId],
    queryFn: async () => {
      if (!specificDate) return null;
      const dateStr = format(specificDate, 'yyyy-MM-dd');
      const url = buildApiUrl(`/api/manager-logs/by-date/${dateStr}`, clubId, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch log');
      }
      return response.json();
    },
    enabled: !!specificDate && dateFilter === "specific",
  });
  
  const logs = apiLogs && apiLogs.length > 0 ? apiLogs : (propLogs || []);

  /**
   * Handle initial log selection from cross-tab navigation
   * When navigating from Maintenance tab, this opens the specified log directly.
   * Uses a ref to track if we've already processed this initialSelectedLogId
   * to prevent re-triggering on every apiLogs refetch.
   */
  const processedLogIdRef = useRef<number | null>(null);
  
  useEffect(() => {
    // Only process if we have a new initialSelectedLogId that we haven't handled yet
    if (initialSelectedLogId && 
        apiLogs && 
        processedLogIdRef.current !== initialSelectedLogId) {
      const logToSelect = apiLogs.find(log => log.id === initialSelectedLogId);
      if (logToSelect) {
        setSelectedLog(logToSelect);
        processedLogIdRef.current = initialSelectedLogId;
        if (onLogSelected) {
          onLogSelected();
        }
      }
    }
    
    // Reset ref when initialSelectedLogId becomes null (user navigated away)
    if (!initialSelectedLogId) {
      processedLogIdRef.current = null;
    }
  }, [initialSelectedLogId, apiLogs, onLogSelected]);

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

        {/* Weather */}
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

        {/* Operational Notes */}
        {selectedLog.salesNotes && (
          <Card>
            <CardHeader>
              <CardTitle>Operational Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{selectedLog.salesNotes}</p>
            </CardContent>
          </Card>
        )}

        {/* Maintenance Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Maintenance Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{selectedLog.dailyNotes || "No notes recorded."}</p>
          </CardContent>
        </Card>

        {/* Photos */}
        {(isLoadingPhotos || notePhotos.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Photos
                {notePhotos.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {notePhotos.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingPhotos ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    const operationalPhotos = notePhotos.filter(p => p.noteType === "operational");
                    const maintenancePhotos = notePhotos.filter(p => p.noteType === "maintenance");
                    return (
                      <>
                        {operationalPhotos.length > 0 && (
                          <div>
                            {maintenancePhotos.length > 0 && (
                              <h4 className="text-sm font-medium text-muted-foreground mb-3">Operational Photos</h4>
                            )}
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                              {operationalPhotos.map((photo) => (
                                <button
                                  key={photo.id}
                                  type="button"
                                  aria-label="View operational photo full size"
                                  className="relative aspect-square rounded-md overflow-visible border border-border hover-elevate cursor-pointer"
                                  onClick={() => setLightboxPhoto(photo.url)}
                                >
                                  <img
                                    src={photo.url}
                                    alt="Operational photo"
                                    className="w-full h-full object-cover rounded-md"
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {maintenancePhotos.length > 0 && (
                          <div>
                            {operationalPhotos.length > 0 && (
                              <h4 className="text-sm font-medium text-muted-foreground mb-3">Maintenance Photos</h4>
                            )}
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                              {maintenancePhotos.map((photo) => (
                                <button
                                  key={photo.id}
                                  type="button"
                                  aria-label="View maintenance photo full size"
                                  className="relative aspect-square rounded-md overflow-visible border border-border hover-elevate cursor-pointer"
                                  onClick={() => setLightboxPhoto(photo.url)}
                                >
                                  <img
                                    src={photo.url}
                                    alt="Maintenance photo"
                                    className="w-full h-full object-cover rounded-md"
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* File Attachments */}
        {(isLoadingAttachments || logAttachments.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Paperclip className="h-5 w-5" />
                Attachments
                {logAttachments.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {logAttachments.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingAttachments ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
                  {logAttachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center justify-between gap-2 p-3 rounded-md border">
                      <div className="flex items-center gap-3 min-w-0">
                        {attachment.fileType?.startsWith("image/") ? (
                          <Camera className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{attachment.fileName}</p>
                          {attachment.fileSize && (
                            <p className="text-xs text-muted-foreground">
                              {attachment.fileSize < 1024 * 1024
                                ? `${(attachment.fileSize / 1024).toFixed(1)} KB`
                                : `${(attachment.fileSize / (1024 * 1024)).toFixed(1)} MB`}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" asChild className="shrink-0">
                        <a
                          href={attachment.publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Lightbox for full-size photo viewing */}
        {lightboxPhoto && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            onClick={() => setLightboxPhoto(null)}
          >
            <Button
              variant="outline"
              size="icon"
              aria-label="Close photo viewer"
              className="absolute top-4 right-4 bg-background/80"
              onClick={() => setLightboxPhoto(null)}
            >
              <X className="h-5 w-5" />
            </Button>
            <img
              src={lightboxPhoto}
              alt="Full size photo"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-md"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* Running Maintenance List (items as of this date with daily reset behavior) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Running Maintenance List
              {runningMaintenanceByDate && runningMaintenanceByDate.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {runningMaintenanceByDate.filter(i => i.status === "open").length} Open
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingRunningMaintenance ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : runningMaintenanceByDate && runningMaintenanceByDate.length > 0 ? (
              <div className="space-y-2">
                {runningMaintenanceByDate.map((item) => (
                  <div 
                    key={item.id} 
                    className={`p-3 rounded-lg border ${
                      item.status === "completed" 
                        ? "bg-muted/50 border-muted line-through opacity-60" 
                        : "bg-card"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{item.title}</div>
                        {item.description && (
                          <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                        )}
                      </div>
                      <Badge variant={item.status === "open" ? "default" : "secondary"}>
                        {item.status === "open" ? "Open" : "Completed"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Added: {format(new Date(item.dateAdded), "MMM d, yyyy")}
                      {item.dateCompleted && (
                        <span className="ml-2">
                          | Completed: {format(new Date(item.dateCompleted), "MMM d, yyyy")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No maintenance items were recorded for this date.
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
