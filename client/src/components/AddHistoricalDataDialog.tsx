import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { buildApiUrl } from "@/contexts/ManagerLogContext";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { SalesDataTable } from "./SalesDataTable";
import type { ManagerLog, RunningMaintenanceItem } from "@shared/schema";
import {
  Calendar,
  Loader2,
  Plus,
  Upload,
  Download,
  AlertCircle,
  CheckCircle,
  Info,
  TableProperties,
  Wrench,
  DollarSign,
  Search,
} from "lucide-react";

interface AddHistoricalDataDialogProps {
  clubId: string;
  apiBaseUrl?: string;
  defaultDate?: Date;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onViewComparison?: (startDate: string, endDate: string) => void;
}

export default function AddHistoricalDataDialog({
  clubId,
  apiBaseUrl,
  defaultDate,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onViewComparison,
}: AddHistoricalDataDialogProps) {
  const { toast } = useToast();

  // Dialog state (internal or controlled)
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? controlledOnOpenChange : setInternalOpen;

  // Tab state
  const [mode, setMode] = useState<"view" | "single" | "bulk" | "maintenance">("single");
  const [maintenanceFilter, setMaintenanceFilter] = useState<"all" | "open" | "completed">("all");
  const [maintenanceSearch, setMaintenanceSearch] = useState("");

  // Fetch all logs for View Data tab
  const { data: allLogs, isLoading: isLoadingSales } = useQuery<ManagerLog[]>({
    queryKey: ['/api/manager-logs', clubId],
    queryFn: async () => {
      const url = buildApiUrl('/api/manager-logs', clubId, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch logs');
      return response.json();
    },
    enabled: open,
  });

  // Fetch all running maintenance items for View Data tab
  const { data: allMaintenanceItems, isLoading: isLoadingMaintenance } = useQuery<RunningMaintenanceItem[]>({
    queryKey: ['/api/running-maintenance', clubId],
    queryFn: async () => {
      const url = buildApiUrl('/api/running-maintenance', clubId, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch maintenance items');
      return response.json();
    },
    enabled: open && mode === 'view',
  });

  const sortedMaintenanceItems = useMemo(() => {
    if (!allMaintenanceItems) return [];
    return [...allMaintenanceItems].sort((a, b) => {
      const da = new Date(a.dateAdded).getTime();
      const db2 = new Date(b.dateAdded).getTime();
      return db2 - da;
    });
  }, [allMaintenanceItems]);

  const filteredMaintenanceItems = useMemo(() => {
    let items = sortedMaintenanceItems;
    if (maintenanceFilter !== "all") {
      items = items.filter((item) =>
        maintenanceFilter === "completed" ? item.status === "completed" : item.status !== "completed"
      );
    }
    const query = maintenanceSearch.trim().toLowerCase();
    if (query) {
      items = items.filter((item) =>
        item.title.toLowerCase().includes(query) ||
        (item.description ?? "").toLowerCase().includes(query)
      );
    }
    return items;
  }, [sortedMaintenanceItems, maintenanceFilter, maintenanceSearch]);

  const salesTableData = useMemo(() => {
    if (!allLogs) return [];
    return allLogs.map(log => {
      const d = new Date(log.logDate + "T12:00:00");
      const food = parseFloat(log.foodSales || "0") || 0;
      const bar = parseFloat(log.barSales || "0") || 0;
      const gaming = parseFloat(log.gamingSales || "0") || 0;
      return {
        id: log.id,
        date: log.logDate,
        dayOfWeek: format(d, "EEEE"),
        foodSales: food,
        barSales: bar,
        gamingSales: gaming,
        totalSales: food + bar + gaming,
      };
    });
  }, [allLogs]);

  // Single entry state
  const [historicalDate, setHistoricalDate] = useState<Date | undefined>(defaultDate);
  const [historicalFood, setHistoricalFood] = useState("");
  const [historicalBar, setHistoricalBar] = useState("");
  const [historicalGaming, setHistoricalGaming] = useState("");

  // Bulk import state
  const [isDragOver, setIsDragOver] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreviewData, setCsvPreviewData] = useState<Array<{
    date: string;
    foodSales: number;
    barSales: number;
    gamingSales: number;
    error?: string;
  }>>([]);
  const [csvParseError, setCsvParseError] = useState<string | null>(null);
  const [bulkImportResult, setBulkImportResult] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);

  // Maintenance bulk import state
  const [maintIsDragOver, setMaintIsDragOver] = useState(false);
  const [maintFile, setMaintFile] = useState<File | null>(null);
  const [maintPreviewData, setMaintPreviewData] = useState<Array<{
    title: string; description: string; dateAdded: string; dateCompleted: string; error?: string;
  }>>([]);
  const [maintParseError, setMaintParseError] = useState<string | null>(null);
  const [maintImportResult, setMaintImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [maintProgress, setMaintProgress] = useState(0);
  const maintProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetState = useCallback(() => {
    setMode("single");
    setHistoricalDate(defaultDate);
    setHistoricalFood("");
    setHistoricalBar("");
    setHistoricalGaming("");
    setCsvFile(null);
    setCsvPreviewData([]);
    setCsvParseError(null);
    setBulkImportResult(null);
    setCalendarMonth(defaultDate || new Date());
    setMaintFile(null);
    setMaintPreviewData([]);
    setMaintParseError(null);
    setMaintImportResult(null);
    setMaintProgress(0);
  }, [defaultDate]);

  // Handle dialog open/close
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    setOpen(newOpen);
  }, [resetState, setOpen]);

  // Save single entry mutation
  const saveHistoricalMutation = useMutation({
    mutationFn: async (data: { date: string; foodSales: number; barSales: number; gamingSales: number }) => {
      const url = buildApiUrl("/api/manager-logs/historical", clubId, apiBaseUrl);
      const dateObj = new Date(data.date);
      const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
      const response = await apiRequest("POST", url, {
        logDate: data.date,
        dayOfWeek,
        foodSales: String(data.foodSales),
        barSales: String(data.barSales),
        gamingSales: String(data.gamingSales),
        clubId: clubId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-logs/by-date"] });
      queryClient.invalidateQueries({ queryKey: ["/api/historical-status"] });
      toast({
        title: "Historical data saved",
        description: "Your entry has been saved. To view it in Insights, select \"Year to Date\" or a custom date range — historical data won't appear under \"Last 30 Days\".",
      });
      handleOpenChange(false);
    },
  });

  // CSV parsing function
  const parseCSV = useCallback((text: string) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      setCsvParseError("CSV file must have a header row and at least one data row");
      setCsvPreviewData([]);
      return;
    }

    const header = lines[0].toLowerCase().split(',').map(h => h.trim());
    const dateIdx = header.findIndex(h => h === 'date' || h === 'log_date' || h === 'logdate');
    const foodIdx = header.findIndex(h => h === 'food_sales' || h === 'foodsales' || h === 'food');
    const barIdx = header.findIndex(h => h === 'bar_sales' || h === 'barsales' || h === 'bar');
    const gamingIdx = header.findIndex(h => h === 'gaming_sales' || h === 'gamingsales' || h === 'gaming');

    if (dateIdx === -1) {
      setCsvParseError("CSV must have a 'date' column");
      setCsvPreviewData([]);
      return;
    }

    const parsedRows: typeof csvPreviewData = [];
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = line.split(',').map(v => v.trim());
      const dateStr = values[dateIdx] || '';
      
      let error: string | undefined;
      if (!dateRegex.test(dateStr)) {
        error = "Invalid date format (use YYYY-MM-DD)";
      }
      
      const foodVal = foodIdx >= 0 ? parseFloat(values[foodIdx]) || 0 : 0;
      const barVal = barIdx >= 0 ? parseFloat(values[barIdx]) || 0 : 0;
      const gamingVal = gamingIdx >= 0 ? parseFloat(values[gamingIdx]) || 0 : 0;

      parsedRows.push({
        date: dateStr,
        foodSales: foodVal,
        barSales: barVal,
        gamingSales: gamingVal,
        error,
      });
    }

    if (parsedRows.length === 0) {
      setCsvParseError("No valid data rows found in CSV");
      setCsvPreviewData([]);
      return;
    }

    setCsvParseError(null);
    setCsvPreviewData(parsedRows);
  }, []);

  // Shared file processing used by both click-upload and drag-and-drop
  const processFile = useCallback((file: File) => {
    setCsvFile(file);
    setBulkImportResult(null);
    setImportProgress(0);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseCSV(text);
    };
    reader.onerror = () => {
      setCsvParseError("Failed to read file");
      setCsvPreviewData([]);
    };
    reader.readAsText(file);
  }, [parseCSV]);

  // Handle CSV file upload via file picker
  const handleCsvFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  }, [processFile]);

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processFile(file);
  }, [processFile]);

  // Clear bulk import state
  const clearBulkImport = useCallback(() => {
    setCsvFile(null);
    setCsvPreviewData([]);
    setCsvParseError(null);
    setBulkImportResult(null);
    setImportProgress(0);
  }, []);

  // Bulk import mutation
  const bulkImportMutation = useMutation({
    mutationFn: async (rows: Array<{ date: string; foodSales: number; barSales: number; gamingSales: number }>) => {
      const url = buildApiUrl("/api/manager-logs/bulk-historical", clubId, apiBaseUrl);
      const response = await apiRequest("POST", url, {
        entries: rows.map(row => {
          const dateObj = new Date(row.date);
          const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
          return {
            logDate: row.date,
            dayOfWeek,
            foodSales: row.foodSales.toString(),
            barSales: row.barSales.toString(),
            gamingSales: row.gamingSales.toString(),
            clubId: clubId,
          };
        }),
      });
      return response.json();
    },
    onSuccess: (result: { success: number; failed: number; errors: string[] }) => {
      setBulkImportResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-logs/by-date"] });
      queryClient.invalidateQueries({ queryKey: ["/api/historical-status"] });
      if (result.failed === 0) {
        toast({
          title: `${result.success} records imported`,
          description: "Your historical data has been saved.",
        });
      } else if (result.success > 0) {
        toast({
          title: `${result.success} of ${result.success + result.failed} records imported`,
          description: "To view the imported data in Insights, select \"Year to Date\" or a custom date range.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Simulated import progress (0–100)
  const [importProgress, setImportProgress] = useState(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (bulkImportMutation.isPending) {
      setImportProgress(0);
      progressIntervalRef.current = setInterval(() => {
        setImportProgress(prev => {
          // Ease toward 85%: faster at first, slower as it approaches the cap
          const remaining = 85 - prev;
          const step = Math.max(0.4, remaining * 0.045);
          return Math.min(85, prev + step);
        });
      }, 120);
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (bulkImportMutation.isSuccess) {
        setImportProgress(100);
        const t = setTimeout(() => setImportProgress(0), 1800);
        return () => clearTimeout(t);
      } else {
        setImportProgress(0);
      }
    }
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [bulkImportMutation.isPending, bulkImportMutation.isSuccess]);

  // Download sample CSV
  const downloadSampleCsv = useCallback(() => {
    const sampleCsv = `date,food,bar,gaming
2025-01-01,1820.00,2640.00,890.00
2025-01-02,1550.00,2190.00,710.00
2025-01-03,1380.00,1850.00,520.00
2025-01-04,2100.00,3020.00,1150.00
2025-01-05,2350.00,3480.00,1380.00
2025-01-06,1690.00,2410.00,850.00
2025-01-07,1420.00,2080.00,620.00
2025-01-08,1560.00,2250.00,760.00
2025-01-09,1310.00,1920.00,580.00
2025-01-10,1480.00,2110.00,640.00
2025-01-11,2080.00,2980.00,1090.00
2025-01-12,2410.00,3350.00,1280.00
2025-01-13,1720.00,2530.00,870.00
2025-01-14,1390.00,2040.00,590.00
2025-01-15,1630.00,2380.00,800.00
2025-01-16,1290.00,1880.00,550.00
2025-01-17,1510.00,2170.00,680.00
2025-01-18,2160.00,3090.00,1120.00
2025-01-19,2490.00,3520.00,1340.00
2025-01-20,1780.00,2590.00,920.00
2025-01-21,1450.00,2110.00,660.00
2025-01-22,1590.00,2310.00,790.00
2025-01-23,1330.00,1960.00,570.00
2025-01-24,1470.00,2080.00,650.00
2025-01-25,2090.00,3010.00,1080.00
2025-01-26,2380.00,3400.00,1260.00
2025-01-27,1700.00,2480.00,860.00
2025-01-28,1360.00,1990.00,600.00
2025-01-29,1610.00,2350.00,780.00
2025-01-30,1280.00,1850.00,540.00
2025-01-31,1430.00,2050.00,630.00`;
    const blob = new Blob([sampleCsv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_historical_sales.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // RFC 4180-compliant CSV parser (handles quoted fields with embedded commas)
  const parseCSVRFC4180 = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; }
        else if (ch === '"') { inQuotes = false; i++; }
        else { field += ch; i++; }
      } else {
        if (ch === '"') { inQuotes = true; i++; }
        else if (ch === ',') { row.push(field); field = ''; i++; }
        else if (ch === '\r' && text[i + 1] === '\n') { row.push(field); field = ''; rows.push(row); row = []; i += 2; }
        else if (ch === '\n') { row.push(field); field = ''; rows.push(row); row = []; i++; }
        else { field += ch; i++; }
      }
    }
    if (field || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
  };

  const MAINT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const parseMaintCSV = useCallback((text: string) => {
    const allRows = parseCSVRFC4180(text.trim());
    if (allRows.length < 2) { setMaintParseError("CSV must have a header row and at least one data row"); setMaintPreviewData([]); return; }
    const header = allRows[0].map(h => h.trim().toLowerCase());
    const titleIdx = header.findIndex(h => h === 'title' || h === 'item' || h === 'name');
    const descIdx = header.findIndex(h => h === 'description' || h === 'desc' || h === 'notes');
    const dateAddedIdx = header.findIndex(h => h === 'date_added' || h === 'dateadded' || h === 'date');
    const dateCompletedIdx = header.findIndex(h => h === 'date_completed' || h === 'datecompleted' || h === 'completed');
    if (titleIdx === -1) { setMaintParseError("CSV must have a 'title' column"); setMaintPreviewData([]); return; }
    const rows: typeof maintPreviewData = [];
    for (let i = 1; i < allRows.length; i++) {
      const values = allRows[i];
      if (values.every(v => v.trim() === '')) continue;
      const title = (values[titleIdx] || '').trim();
      const description = descIdx >= 0 ? (values[descIdx] || '').trim() : '';
      const dateAdded = dateAddedIdx >= 0 ? (values[dateAddedIdx] || '').trim() : '';
      const dateCompleted = dateCompletedIdx >= 0 ? (values[dateCompletedIdx] || '').trim() : '';
      let error: string | undefined;
      if (!title) error = "Title is required";
      else if (dateAdded && !MAINT_DATE_RE.test(dateAdded)) error = "Invalid date_added (use YYYY-MM-DD)";
      else if (dateCompleted && !MAINT_DATE_RE.test(dateCompleted)) error = "Invalid date_completed (use YYYY-MM-DD)";
      rows.push({ title, description, dateAdded, dateCompleted, error });
    }
    if (rows.length === 0) { setMaintParseError("No valid data rows found"); setMaintPreviewData([]); return; }
    setMaintParseError(null);
    setMaintPreviewData(rows);
  }, []);

  const processMaintFile = useCallback((file: File) => {
    setMaintFile(file);
    setMaintImportResult(null);
    setMaintProgress(0);
    const reader = new FileReader();
    reader.onload = (e) => parseMaintCSV(e.target?.result as string);
    reader.onerror = () => { setMaintParseError("Failed to read file"); setMaintPreviewData([]); };
    reader.readAsText(file);
  }, [parseMaintCSV]);

  const handleMaintFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processMaintFile(file);
  }, [processMaintFile]);

  const handleMaintDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setMaintIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processMaintFile(file);
  }, [processMaintFile]);

  const handleMaintDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setMaintIsDragOver(true); }, []);
  const handleMaintDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setMaintIsDragOver(false); }, []);

  const clearMaintImport = useCallback(() => {
    setMaintFile(null); setMaintPreviewData([]); setMaintParseError(null); setMaintImportResult(null); setMaintProgress(0);
  }, []);

  const maintBulkImportMutation = useMutation({
    mutationFn: async (rows: typeof maintPreviewData) => {
      const url = buildApiUrl("/api/running-maintenance/bulk-import", clubId, apiBaseUrl);
      const response = await apiRequest("POST", url, {
        entries: rows.map(r => ({
          title: r.title,
          description: r.description || undefined,
          dateAdded: r.dateAdded || undefined,
          dateCompleted: r.dateCompleted || undefined,
        })),
      });
      return response.json();
    },
    onSuccess: (result: { success: number; failed: number; errors: string[] }) => {
      setMaintImportResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/running-maintenance", clubId] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/open", clubId] });
      if (result.failed === 0) {
        toast({ title: `${result.success} items imported`, description: "Maintenance items have been added." });
      } else if (result.success > 0) {
        toast({ title: `${result.success} of ${result.success + result.failed} items imported`, description: `${result.failed} row(s) had errors.` });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (maintBulkImportMutation.isPending) {
      setMaintProgress(0);
      maintProgressRef.current = setInterval(() => {
        setMaintProgress(prev => Math.min(85, prev + Math.max(0.5, (85 - prev) * 0.06)));
      }, 120);
    } else {
      if (maintProgressRef.current) { clearInterval(maintProgressRef.current); maintProgressRef.current = null; }
      if (maintBulkImportMutation.isSuccess) {
        setMaintProgress(100);
        const t = setTimeout(() => setMaintProgress(0), 1800);
        return () => clearTimeout(t);
      } else { setMaintProgress(0); }
    }
    return () => { if (maintProgressRef.current) clearInterval(maintProgressRef.current); };
  }, [maintBulkImportMutation.isPending, maintBulkImportMutation.isSuccess]);

  const downloadMaintSample = useCallback(() => {
    const a = document.createElement('a');
    a.href = '/demo_maintenance.csv';
    a.download = 'demo_maintenance.csv';
    a.click();
  }, []);

  const [calendarMonth, setCalendarMonth] = useState<Date>(historicalDate || new Date());

  const years = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - i);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const dialogContent = (
    <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Data Import</DialogTitle>
        <DialogDescription>
          View, verify, and manage all your sales and maintenance data. Add individual entries or bulk import from CSV.
        </DialogDescription>
      </DialogHeader>
      
      <Tabs value={mode} onValueChange={(v) => setMode(v as "view" | "single" | "bulk" | "maintenance")} className="pt-2">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="single">Single Entry</TabsTrigger>
          <TabsTrigger value="bulk">Sales</TabsTrigger>
          <TabsTrigger value="maintenance" className="gap-1">
            <Wrench className="h-3.5 w-3.5" />
            Maintenance
          </TabsTrigger>
          <TabsTrigger value="view" className="gap-1">
            <TableProperties className="h-3.5 w-3.5" />
            View Data
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="single" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Select Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <Calendar className="h-4 w-4 mr-2" />
                  {historicalDate ? format(historicalDate, "MMMM d, yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="flex items-center gap-1 p-2 border-b">
                  <select
                    value={calendarMonth.getMonth()}
                    onChange={(e) => {
                      const newMonth = new Date(calendarMonth);
                      newMonth.setMonth(parseInt(e.target.value));
                      setCalendarMonth(newMonth);
                    }}
                    className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
                  >
                    {months.map((m, i) => (
                      <option key={m} value={i}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={calendarMonth.getFullYear()}
                    onChange={(e) => {
                      const newMonth = new Date(calendarMonth);
                      newMonth.setFullYear(parseInt(e.target.value));
                      setCalendarMonth(newMonth);
                    }}
                    className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <CalendarComponent
                  mode="single"
                  selected={historicalDate}
                  onSelect={setHistoricalDate}
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  disabled={(date) => date > new Date()}
                  toDate={new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hist-food-sales">Food Sales</Label>
              <Input
                id="hist-food-sales"
                type="number"
                placeholder="0.00"
                value={historicalFood}
                onChange={(e) => setHistoricalFood(e.target.value)}
                data-testid="input-historical-food"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hist-bar-sales">Bar Sales</Label>
              <Input
                id="hist-bar-sales"
                type="number"
                placeholder="0.00"
                value={historicalBar}
                onChange={(e) => setHistoricalBar(e.target.value)}
                data-testid="input-historical-bar"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hist-gaming-sales">Gaming Sales</Label>
              <Input
                id="hist-gaming-sales"
                type="number"
                placeholder="0.00"
                value={historicalGaming}
                onChange={(e) => setHistoricalGaming(e.target.value)}
                data-testid="input-historical-gaming"
              />
            </div>
          </div>
          
          <Button
            className="w-full"
            disabled={!historicalDate || saveHistoricalMutation.isPending}
            onClick={() => {
              if (historicalDate) {
                saveHistoricalMutation.mutate({
                  date: format(historicalDate, "yyyy-MM-dd"),
                  foodSales: parseFloat(historicalFood) || 0,
                  barSales: parseFloat(historicalBar) || 0,
                  gamingSales: parseFloat(historicalGaming) || 0,
                });
              }
            }}
            data-testid="button-save-historical"
          >
            {saveHistoricalMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Historical Data"
            )}
          </Button>
        </TabsContent>
        
        <TabsContent value="bulk" className="space-y-4 pt-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">Required CSV Format</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={downloadSampleCsv}
              >
                <Download className="h-3 w-3 mr-1" />
                Sample CSV
              </Button>
            </div>
            
            <div className="bg-background rounded border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Food Sales</th>
                    <th className="px-3 py-2 text-left font-medium">Bar Sales</th>
                    <th className="px-3 py-2 text-left font-medium">Gaming Sales</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-t border-muted">
                    <td className="px-3 py-1.5">2025-01-01</td>
                    <td className="px-3 py-1.5">1500.00</td>
                    <td className="px-3 py-1.5">2000.00</td>
                    <td className="px-3 py-1.5">500.00</td>
                  </tr>
                  <tr className="border-t border-muted">
                    <td className="px-3 py-1.5">2025-01-02</td>
                    <td className="px-3 py-1.5">1650.00</td>
                    <td className="px-3 py-1.5">2100.00</td>
                    <td className="px-3 py-1.5">475.00</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Info className="h-3 w-3" />
                Date format: YYYY-MM-DD
              </span>
              <span className="flex items-center gap-1">
                <Info className="h-3 w-3" />
                Numbers only, no $ symbols
              </span>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Upload CSV File</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                isDragOver
                  ? "border-primary bg-primary/5"
                  : "hover:border-primary/50"
              }`}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleCsvFileChange}
                className="hidden"
                id="csv-upload-dialog"
                data-testid="input-csv-upload"
              />
              <label htmlFor="csv-upload-dialog" className="cursor-pointer">
                <Upload className={`h-8 w-8 mx-auto mb-2 transition-colors ${isDragOver ? "text-primary" : "text-muted-foreground"}`} />
                <p className="text-sm text-muted-foreground">
                  {csvFile ? csvFile.name : isDragOver ? "Drop your CSV file here" : "Click to upload or drag and drop"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">CSV or TXT file</p>
              </label>
            </div>
          </div>
          
          {csvParseError && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <p className="text-sm text-destructive">{csvParseError}</p>
            </div>
          )}
          
          {csvPreviewData.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Preview ({csvPreviewData.length} rows)</Label>
                <Button variant="ghost" size="sm" onClick={clearBulkImport}>
                  Clear
                </Button>
              </div>
              <div className="max-h-48 overflow-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-right p-2">Food</th>
                      <th className="text-right p-2">Bar</th>
                      <th className="text-right p-2">Gaming</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreviewData.map((row, idx) => (
                      <tr key={idx} className={row.error ? "bg-destructive/10" : ""}>
                        <td className="p-2">
                          {row.date}
                          {row.error && (
                            <span className="text-xs text-destructive ml-1">({row.error})</span>
                          )}
                        </td>
                        <td className="text-right p-2">${row.foodSales.toFixed(2)}</td>
                        <td className="text-right p-2">${row.barSales.toFixed(2)}</td>
                        <td className="text-right p-2">${row.gamingSales.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {bulkImportResult && (
            <div className="space-y-2">
              <div className={`rounded-lg p-3 flex items-start gap-2 ${
                bulkImportResult.failed === 0 
                  ? "bg-green-500/10 border border-green-500/30" 
                  : "bg-amber-500/10 border border-amber-500/30"
              }`}>
                <CheckCircle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                  bulkImportResult.failed === 0 ? "text-green-600" : "text-amber-600"
                }`} />
                <div className="text-sm">
                  <p className={bulkImportResult.failed === 0 ? "text-green-600" : "text-amber-600"}>
                    Imported {bulkImportResult.success} of {bulkImportResult.success + bulkImportResult.failed} records
                  </p>
                  {bulkImportResult.errors.length > 0 && (
                    <ul className="mt-1 text-xs text-muted-foreground">
                      {bulkImportResult.errors.slice(0, 3).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                      {bulkImportResult.errors.length > 3 && (
                        <li>...and {bulkImportResult.errors.length - 3} more errors</li>
                      )}
                    </ul>
                  )}
                </div>
              </div>
              {bulkImportResult.failed === 0 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleOpenChange(false)}
                    data-testid="button-close-import-dialog"
                  >
                    Done
                  </Button>
                </div>
              )}
            </div>
          )}
          
          {(bulkImportMutation.isPending || importProgress > 0) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{importProgress >= 100 ? "Complete" : "Importing..."}</span>
                <span>{Math.round(importProgress)}%</span>
              </div>
              <Progress
                value={importProgress}
                className="h-2 bg-secondary"
              />
            </div>
          )}

          <Button
            className="w-full"
            disabled={csvPreviewData.length === 0 || csvPreviewData.some(r => r.error) || bulkImportMutation.isPending}
            onClick={() => {
              const validRows = csvPreviewData.filter(r => !r.error);
              if (validRows.length > 0) {
                bulkImportMutation.mutate(validRows);
              }
            }}
            data-testid="button-bulk-import"
          >
            {bulkImportMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Import {csvPreviewData.filter(r => !r.error).length} Records
              </>
            )}
          </Button>
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4 pt-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">Required CSV Format</p>
              <Button type="button" variant="outline" size="sm" onClick={downloadMaintSample}>
                <Download className="h-3 w-3 mr-1" />
                Sample CSV
              </Button>
            </div>
            <div className="bg-background rounded border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">title</th>
                    <th className="px-3 py-2 text-left font-medium">description</th>
                    <th className="px-3 py-2 text-left font-medium">date_added</th>
                    <th className="px-3 py-2 text-left font-medium">date_completed</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-t border-muted">
                    <td className="px-3 py-1.5">Replace HVAC filters</td>
                    <td className="px-3 py-1.5">Quarterly replacement</td>
                    <td className="px-3 py-1.5">2025-01-10</td>
                    <td className="px-3 py-1.5">2025-01-18</td>
                  </tr>
                  <tr className="border-t border-muted">
                    <td className="px-3 py-1.5">Fix leaking faucet</td>
                    <td className="px-3 py-1.5">Kitchen prep sink</td>
                    <td className="px-3 py-1.5">2025-02-01</td>
                    <td className="px-3 py-1.5">(leave blank if open)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Info className="h-3 w-3" />Only title is required</span>
              <span className="flex items-center gap-1"><Info className="h-3 w-3" />Dates: YYYY-MM-DD format</span>
              <span className="flex items-center gap-1"><Info className="h-3 w-3" />Leave date_completed blank for open items</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Upload CSV File</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                maintIsDragOver ? "border-primary bg-primary/5" : "hover:border-primary/50"
              }`}
              onDragOver={handleMaintDragOver}
              onDragLeave={handleMaintDragLeave}
              onDrop={handleMaintDrop}
            >
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleMaintFileChange}
                className="hidden"
                id="maintenance-bulk-csv-upload"
                data-testid="input-maintenance-csv-upload"
              />
              <label htmlFor="maintenance-bulk-csv-upload" className="cursor-pointer">
                <Upload className={`h-8 w-8 mx-auto mb-2 transition-colors ${maintIsDragOver ? "text-primary" : "text-muted-foreground"}`} />
                <p className="text-sm text-muted-foreground">
                  {maintFile ? maintFile.name : maintIsDragOver ? "Drop your CSV file here" : "Click to upload or drag and drop"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">CSV or TXT file</p>
              </label>
            </div>
          </div>

          {maintParseError && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <p className="text-sm text-destructive">{maintParseError}</p>
            </div>
          )}

          {maintPreviewData.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Preview ({maintPreviewData.length} rows{maintPreviewData.filter(r => r.error).length > 0 ? `, ${maintPreviewData.filter(r => r.error).length} with errors` : ''})</Label>
                <Button variant="ghost" size="sm" onClick={clearMaintImport}>Clear</Button>
              </div>
              <div className="max-h-48 overflow-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2">Title</th>
                      <th className="text-left p-2">Date Added</th>
                      <th className="text-left p-2">Date Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintPreviewData.map((row, idx) => (
                      <tr key={idx} className={row.error ? "bg-destructive/10" : ""}>
                        <td className="p-2">
                          {row.title}
                          {row.error && <span className="text-xs text-destructive ml-1">({row.error})</span>}
                        </td>
                        <td className="p-2 text-muted-foreground">{row.dateAdded || "—"}</td>
                        <td className="p-2 text-muted-foreground">{row.dateCompleted || "open"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {maintImportResult && (
            <div className={`rounded-lg p-3 flex items-start gap-2 ${maintImportResult.failed === 0 ? "bg-green-500/10 border border-green-500/30" : "bg-amber-500/10 border border-amber-500/30"}`}>
              <CheckCircle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${maintImportResult.failed === 0 ? "text-green-600" : "text-amber-600"}`} />
              <div className="text-sm">
                <p className={maintImportResult.failed === 0 ? "text-green-600" : "text-amber-600"}>
                  Imported {maintImportResult.success} of {maintImportResult.success + maintImportResult.failed} items
                </p>
                {maintImportResult.errors.length > 0 && (
                  <ul className="mt-1 text-xs text-muted-foreground">
                    {maintImportResult.errors.slice(0, 3).map((err, i) => <li key={i}>{err}</li>)}
                    {maintImportResult.errors.length > 3 && <li>...and {maintImportResult.errors.length - 3} more errors</li>}
                  </ul>
                )}
              </div>
            </div>
          )}

          {(maintBulkImportMutation.isPending || maintProgress > 0) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{maintProgress >= 100 ? "Complete" : "Importing..."}</span>
                <span>{Math.round(maintProgress)}%</span>
              </div>
              <Progress value={maintProgress} className="h-2 bg-secondary" />
            </div>
          )}

          <Button
            className="w-full"
            disabled={maintPreviewData.filter(r => !r.error).length === 0 || maintBulkImportMutation.isPending}
            onClick={() => {
              const valid = maintPreviewData.filter(r => !r.error);
              if (valid.length > 0) maintBulkImportMutation.mutate(valid);
            }}
            data-testid="button-maintenance-bulk-import-submit"
          >
            {maintBulkImportMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" />Import {maintPreviewData.filter(r => !r.error).length} Items</>
            )}
          </Button>
        </TabsContent>

        <TabsContent value="view" className="pt-4 space-y-6">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Sales Records
              {!isLoadingSales && (
                <span className="text-xs font-normal text-muted-foreground">({salesTableData.length} entries)</span>
              )}
            </h3>
            {isLoadingSales ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading sales records...</span>
              </div>
            ) : (
              <SalesDataTable data={salesTableData} />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                Maintenance Items
                {!isLoadingMaintenance && (
                  <span className="text-xs font-normal text-muted-foreground">({filteredMaintenanceItems.length} items)</span>
                )}
              </h3>
              {!isLoadingMaintenance && sortedMaintenanceItems.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search by title or description..."
                      value={maintenanceSearch}
                      onChange={(e) => setMaintenanceSearch(e.target.value)}
                      className="pl-7 h-7 text-xs w-48"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    {(["all", "open", "completed"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setMaintenanceFilter(f)}
                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                          maintenanceFilter === f
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border hover-elevate"
                        }`}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {isLoadingMaintenance ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading maintenance items...</span>
              </div>
            ) : filteredMaintenanceItems.length === 0 ? (
              <div className="rounded-md border bg-muted/30 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {sortedMaintenanceItems.length === 0
                    ? "No maintenance items found."
                    : maintenanceSearch.trim()
                    ? `No ${maintenanceFilter === "all" ? "" : maintenanceFilter + " "}maintenance items match "${maintenanceSearch.trim()}".`
                    : `No ${maintenanceFilter} maintenance items.`}
                </p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left font-medium p-3">Title</th>
                      <th className="text-left font-medium p-3">Description</th>
                      <th className="text-left font-medium p-3">Date Added</th>
                      <th className="text-left font-medium p-3">Date Completed</th>
                      <th className="text-left font-medium p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMaintenanceItems.map((item) => (
                      <tr key={item.id} className="border-b last:border-b-0">
                        <td className="p-3 font-medium max-w-[180px] truncate">{item.title}</td>
                        <td className="p-3 text-muted-foreground max-w-[200px] truncate">{item.description || "—"}</td>
                        <td className="p-3 text-muted-foreground">
                          {item.dateAdded ? format(new Date(item.dateAdded), "MMM d, yyyy") : "—"}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {item.dateCompleted ? format(new Date(item.dateCompleted), "MMM d, yyyy") : "—"}
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            item.status === "completed"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                          }`}>
                            {item.status === "completed" ? "Completed" : "Open"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </DialogContent>
  );

  // If trigger is provided, wrap in DialogTrigger
  if (trigger) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1 border-dashed"
          data-testid="button-add-historical"
        >
          <Plus className="h-4 w-4" />
          Add Past Sales for Comparison
        </Button>
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  );
}
