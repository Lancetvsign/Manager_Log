import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { buildApiUrl } from "@/contexts/ManagerLogContext";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
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
  Pencil,
  Trash2,
  AlertTriangle,
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

// Unified CSV row types
type SalesRow = {
  rowType: "sales";
  date: string;
  foodSales: number;
  barSales: number;
  gamingSales: number;
  error?: string;
};
type MaintenanceRow = {
  rowType: "maintenance";
  title: string;
  description: string;
  dateAdded: string;
  dateCompleted: string;
  error?: string;
};
type UnknownRow = { rowType: "unknown"; raw: string; error: string };
type UnifiedRow = SalesRow | MaintenanceRow | UnknownRow;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? controlledOnOpenChange : setInternalOpen;

  const [mode, setMode] = useState<"view" | "single" | "import">("single");
  const [maintenanceSearch, setMaintenanceSearch] = useState("");

  // Maintenance edit state
  const [editingMaintItem, setEditingMaintItem] = useState<RunningMaintenanceItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<"open" | "completed">("open");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Unified bulk-select state
  const [selectedMaintIds, setSelectedMaintIds] = useState<Set<number>>(new Set());
  const [selectedSalesIds, setSelectedSalesIds] = useState<Set<number>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  // Unified log view state
  const [unifiedTypeFilter, setUnifiedTypeFilter] = useState<"all" | "sales" | "maintenance">("all");

  // Sales edit state (unified view)
  const [editingSalesEntry, setEditingSalesEntry] = useState<{
    id: number; date: string; dayOfWeek: string;
    foodSales: number; barSales: number; gamingSales: number; totalSales: number;
  } | null>(null);
  const [editFood, setEditFood] = useState("");
  const [editBar, setEditBar] = useState("");
  const [editGaming, setEditGaming] = useState("");
  const [confirmSalesDelete, setConfirmSalesDelete] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: allLogs, isLoading: isLoadingSales } = useQuery<ManagerLog[]>({
    queryKey: ["/api/manager-logs", clubId],
    queryFn: async () => {
      const url = buildApiUrl("/api/manager-logs", clubId, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch logs");
      return response.json();
    },
    enabled: open,
  });

  const { data: allMaintenanceItems, isLoading: isLoadingMaintenance } = useQuery<RunningMaintenanceItem[]>({
    queryKey: ["/api/running-maintenance", clubId],
    queryFn: async () => {
      const url = buildApiUrl("/api/running-maintenance", clubId, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch maintenance items");
      return response.json();
    },
    enabled: open && mode === "view",
  });

  // ── Memos ──────────────────────────────────────────────────────────────────

  const sortedMaintenanceItems = useMemo(() => {
    if (!allMaintenanceItems) return [];
    return [...allMaintenanceItems].sort((a, b) => {
      return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
    });
  }, [allMaintenanceItems]);

  const salesTableData = useMemo(() => {
    if (!allLogs) return [];
    return allLogs.map((log) => {
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

  // Lookup maps for unified log view
  const logByDate = useMemo(() => {
    const map = new Map<string, (typeof salesTableData)[0]>();
    salesTableData.forEach((s) => map.set(s.date, s));
    return map;
  }, [salesTableData]);

  const maintByDate = useMemo(() => {
    const map = new Map<string, RunningMaintenanceItem[]>();
    sortedMaintenanceItems.forEach((item) => {
      if (!item.dateAdded) return;
      const date = String(item.dateAdded).slice(0, 10);
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(item);
    });
    return map;
  }, [sortedMaintenanceItems]);

  const unifiedDates = useMemo(() => {
    const allDates = new Set<string>([
      ...(allLogs?.map((l) => l.logDate) ?? []),
      ...sortedMaintenanceItems
        .map((i) => (i.dateAdded ? String(i.dateAdded).slice(0, 10) : null))
        .filter(Boolean) as string[],
    ]);
    let dates = Array.from(allDates);
    if (unifiedTypeFilter === "sales") dates = dates.filter((d) => logByDate.has(d));
    if (unifiedTypeFilter === "maintenance") dates = dates.filter((d) => maintByDate.has(d));
    const q = maintenanceSearch.trim().toLowerCase();
    if (q) {
      dates = dates.filter((date) => {
        if (date.includes(q)) return true;
        const items = maintByDate.get(date) ?? [];
        return items.some(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            (i.description ?? "").toLowerCase().includes(q)
        );
      });
    }
    return dates.sort((a, b) => b.localeCompare(a));
  }, [allLogs, sortedMaintenanceItems, logByDate, maintByDate, unifiedTypeFilter, maintenanceSearch]);

  // ── Single entry state ─────────────────────────────────────────────────────

  const [historicalDate, setHistoricalDate] = useState<Date | undefined>(defaultDate);
  const [historicalFood, setHistoricalFood] = useState("");
  const [historicalBar, setHistoricalBar] = useState("");
  const [historicalGaming, setHistoricalGaming] = useState("");
  const [calendarMonth, setCalendarMonth] = useState<Date>(defaultDate || new Date());

  // ── Unified import state ───────────────────────────────────────────────────

  const [importIsDragOver, setImportIsDragOver] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importRows, setImportRows] = useState<UnifiedRow[]>([]);
  const [importParseError, setImportParseError] = useState<string | null>(null);
  const [showMaintenanceSection, setShowMaintenanceSection] = useState(false);
  const [importResult, setImportResult] = useState<{
    salesSuccess: number;
    salesFailed: number;
    maintSuccess: number;
    maintFailed: number;
    errors: string[];
  } | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const importProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Reset ──────────────────────────────────────────────────────────────────

  const resetState = useCallback(() => {
    setMode("single");
    setHistoricalDate(defaultDate);
    setHistoricalFood("");
    setHistoricalBar("");
    setHistoricalGaming("");
    setCalendarMonth(defaultDate || new Date());
    setImportFile(null);
    setImportRows([]);
    setImportParseError(null);
    setImportResult(null);
    setImportProgress(0);
    setMaintenanceSearch("");
    setEditingMaintItem(null);
    setEditTitle("");
    setEditDescription("");
    setEditStatus("open");
    setConfirmDelete(false);
    setSelectedMaintIds(new Set());
    setSelectedSalesIds(new Set());
    setShowBulkDeleteDialog(false);
    setUnifiedTypeFilter("all");
    setEditingSalesEntry(null);
    setEditFood("");
    setEditBar("");
    setEditGaming("");
    setConfirmSalesDelete(false);
  }, [defaultDate]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) resetState();
      setOpen(newOpen);
    },
    [resetState, setOpen]
  );

  // ── Single entry mutation ──────────────────────────────────────────────────

  const saveHistoricalMutation = useMutation({
    mutationFn: async (data: { date: string; foodSales: number; barSales: number; gamingSales: number }) => {
      const url = buildApiUrl("/api/manager-logs/historical", clubId, apiBaseUrl);
      const dateObj = new Date(data.date);
      const dayOfWeek = dateObj.toLocaleDateString("en-US", { weekday: "long" });
      const response = await apiRequest("POST", url, {
        logDate: data.date,
        dayOfWeek,
        foodSales: String(data.foodSales),
        barSales: String(data.barSales),
        gamingSales: String(data.gamingSales),
        clubId,
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
        description:
          'Your entry has been saved. To view it in Insights, select "Year to Date" or a custom date range.',
      });
      handleOpenChange(false);
    },
  });

  // ── RFC 4180 CSV parser ────────────────────────────────────────────────────

  const parseCSVRFC4180 = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
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

  // ── Unified CSV parser ─────────────────────────────────────────────────────

  const parseUnifiedCSV = useCallback((text: string) => {
    const allRows = parseCSVRFC4180(text.trim());
    if (allRows.length < 2) {
      setImportParseError("CSV must have a header row and at least one data row");
      setImportRows([]);
      return;
    }

    const header = allRows[0].map((h) => h.trim().toLowerCase());
    const typeIdx = header.findIndex((h) => h === "type");
    const dateIdx = header.findIndex((h) => h === "date" || h === "log_date");
    const foodIdx = header.findIndex((h) => h === "food" || h === "food_sales");
    const barIdx = header.findIndex((h) => h === "bar" || h === "bar_sales");
    const gamingIdx = header.findIndex((h) => h === "gaming" || h === "gaming_sales");
    const titleIdx = header.findIndex((h) => h === "title" || h === "item" || h === "name");
    const descIdx = header.findIndex((h) => h === "description" || h === "desc" || h === "notes");
    const dateAddedIdx = header.findIndex((h) => h === "date_added" || h === "dateadded");
    const dateCompletedIdx = header.findIndex((h) => h === "date_completed" || h === "datecompleted");

    const parsed: UnifiedRow[] = [];

    for (let i = 1; i < allRows.length; i++) {
      const vals = allRows[i];
      if (vals.every((v) => v.trim() === "")) continue;

      const rowType = typeIdx === -1 ? "sales" : (vals[typeIdx] || "").trim().toLowerCase();

      if (rowType === "sales") {
        const dateStr = dateIdx >= 0 ? (vals[dateIdx] || "").trim() : "";
        const rawFood = foodIdx >= 0 ? (vals[foodIdx] || "").trim() : "";
        const rawBar = barIdx >= 0 ? (vals[barIdx] || "").trim() : "";
        const rawGaming = gamingIdx >= 0 ? (vals[gamingIdx] || "").trim() : "";
        let error: string | undefined;
        if (!dateStr) error = "Date is required for sales rows";
        else if (!DATE_RE.test(dateStr)) error = "Invalid date (use YYYY-MM-DD)";
        else if (!rawFood && !rawBar && !rawGaming) error = "At least one sales amount (food, bar, gaming) is required";

        parsed.push({
          rowType: "sales",
          date: dateStr,
          foodSales: parseFloat(rawFood) || 0,
          barSales: parseFloat(rawBar) || 0,
          gamingSales: parseFloat(rawGaming) || 0,
          error,
        });
      } else if (rowType === "maintenance") {
        const title = titleIdx >= 0 ? (vals[titleIdx] || "").trim() : "";
        const description = descIdx >= 0 ? (vals[descIdx] || "").trim() : "";
        const dateAdded = dateAddedIdx >= 0 ? (vals[dateAddedIdx] || "").trim() : "";
        const dateCompleted = dateCompletedIdx >= 0 ? (vals[dateCompletedIdx] || "").trim() : "";
        let error: string | undefined;
        if (!title) error = "Title is required for maintenance rows";
        else if (dateAdded && !DATE_RE.test(dateAdded)) error = "Invalid date_added (use YYYY-MM-DD)";
        else if (dateCompleted && !DATE_RE.test(dateCompleted)) error = "Invalid date_completed (use YYYY-MM-DD)";

        parsed.push({ rowType: "maintenance", title, description, dateAdded, dateCompleted, error });
      } else {
        parsed.push({
          rowType: "unknown",
          raw: vals.join(","),
          error: `Unknown type "${rowType}" — must be "sales" or "maintenance"`,
        });
      }
    }

    if (parsed.length === 0) {
      setImportParseError("No data rows found in CSV");
      setImportRows([]);
      return;
    }

    setImportParseError(null);
    setImportRows(parsed);
  }, []);

  const processImportFile = useCallback(
    (file: File) => {
      setImportFile(file);
      setImportResult(null);
      setImportProgress(0);
      const reader = new FileReader();
      reader.onload = (e) => parseUnifiedCSV(e.target?.result as string);
      reader.onerror = () => {
        setImportParseError("Failed to read file");
        setImportRows([]);
      };
      reader.readAsText(file);
    },
    [parseUnifiedCSV]
  );

  const handleImportFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processImportFile(file);
    },
    [processImportFile]
  );

  const handleImportDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setImportIsDragOver(true);
  }, []);
  const handleImportDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setImportIsDragOver(false);
  }, []);
  const handleImportDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault(); e.stopPropagation(); setImportIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processImportFile(file);
    },
    [processImportFile]
  );

  const clearImport = useCallback(() => {
    setImportFile(null);
    setImportRows([]);
    setImportParseError(null);
    setImportResult(null);
    setImportProgress(0);
  }, []);

  // ── Unified import mutation ────────────────────────────────────────────────

  const unifiedImportMutation = useMutation({
    mutationFn: async (rows: UnifiedRow[]) => {
      const salesRows = rows.filter((r): r is SalesRow => r.rowType === "sales" && !r.error);
      const maintRows = rows.filter((r): r is MaintenanceRow => r.rowType === "maintenance" && !r.error);

      let salesSuccess = 0, salesFailed = 0;
      const errors: string[] = [];

      if (salesRows.length > 0) {
        const salesUrl = buildApiUrl("/api/manager-logs/bulk-historical", clubId, apiBaseUrl);
        const salesResp = await apiRequest("POST", salesUrl, {
          entries: salesRows.map((r) => ({
            logDate: r.date,
            dayOfWeek: new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" }),
            foodSales: r.foodSales.toString(),
            barSales: r.barSales.toString(),
            gamingSales: r.gamingSales.toString(),
            clubId,
          })),
        });
        const salesData = await salesResp.json();
        salesSuccess = salesData.success ?? 0;
        salesFailed = salesData.failed ?? 0;
        if (salesData.errors) errors.push(...salesData.errors);
      }

      let maintSuccess = 0, maintFailed = 0;
      if (maintRows.length > 0) {
        const maintUrl = buildApiUrl("/api/running-maintenance/bulk-import", clubId, apiBaseUrl);
        const maintResp = await apiRequest("POST", maintUrl, {
          entries: maintRows.map((r) => ({
            title: r.title,
            description: r.description || undefined,
            dateAdded: r.dateAdded || undefined,
            dateCompleted: r.dateCompleted || undefined,
          })),
        });
        const maintData = await maintResp.json();
        maintSuccess = maintData.success ?? 0;
        maintFailed = maintData.failed ?? 0;
        if (maintData.errors) errors.push(...maintData.errors);
      }

      return { salesSuccess, salesFailed, maintSuccess, maintFailed, errors };
    },
    onSuccess: (result) => {
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-logs/by-date"] });
      queryClient.invalidateQueries({ queryKey: ["/api/historical-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/running-maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/running-maintenance", clubId] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/open", clubId] });

      const totalSuccess = result.salesSuccess + result.maintSuccess;
      const totalFailed = result.salesFailed + result.maintFailed;
      if (totalFailed === 0) {
        const parts = [];
        if (result.salesSuccess > 0) parts.push(`${result.salesSuccess} sales record${result.salesSuccess !== 1 ? "s" : ""}`);
        if (result.maintSuccess > 0) parts.push(`${result.maintSuccess} maintenance item${result.maintSuccess !== 1 ? "s" : ""}`);
        toast({ title: `Imported ${parts.join(" and ")}`, description: "All data has been saved." });
      } else if (totalSuccess > 0) {
        toast({
          title: `${totalSuccess} of ${totalSuccess + totalFailed} rows imported`,
          description: `${totalFailed} row(s) had errors and were skipped.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  // Progress bar animation
  useEffect(() => {
    if (unifiedImportMutation.isPending) {
      setImportProgress(0);
      importProgressRef.current = setInterval(() => {
        setImportProgress((prev) => Math.min(85, prev + Math.max(0.4, (85 - prev) * 0.045)));
      }, 120);
    } else {
      if (importProgressRef.current) { clearInterval(importProgressRef.current); importProgressRef.current = null; }
      if (unifiedImportMutation.isSuccess) {
        setImportProgress(100);
        const t = setTimeout(() => setImportProgress(0), 1800);
        return () => clearTimeout(t);
      } else {
        setImportProgress(0);
      }
    }
    return () => { if (importProgressRef.current) clearInterval(importProgressRef.current); };
  }, [unifiedImportMutation.isPending, unifiedImportMutation.isSuccess]);

  // ── Download combined sample CSV ───────────────────────────────────────────

  const downloadSampleCsv = useCallback(() => {
    let csv: string;
    if (showMaintenanceSection) {
      csv = [
        "type,date,food,bar,gaming,title,description,date_added,date_completed",
        "sales,2025-01-15,1820.00,2640.00,890.00,,,,",
        "sales,2025-01-16,1550.00,2190.00,710.00,,,,",
        "sales,2025-01-17,1380.00,1850.00,520.00,,,,",
        "maintenance,,,,,Replace HVAC air filters,Quarterly replacement,2025-01-10,2025-01-18",
        "maintenance,,,,,Fix leaking faucet,Kitchen prep sink #2,2025-02-01,",
        "maintenance,,,,,Repair walk-in cooler door,Seal was cracked,2025-03-05,",
      ].join("\n");
    } else {
      csv = [
        "date,food,bar,gaming",
        "2025-01-15,1820.00,2640.00,890.00",
        "2025-01-16,1550.00,2190.00,710.00",
        "2025-01-17,1380.00,1850.00,520.00",
      ].join("\n");
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "data_import_sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [showMaintenanceSection]);

  // ── Maintenance edit mutation ──────────────────────────────────────────────

  const updateMaintenanceMutation = useMutation({
    mutationFn: async ({ id, title, description, status }: { id: number; title: string; description: string; status: "open" | "completed" }) => {
      const url = buildApiUrl(`/api/running-maintenance/${id}`, clubId, apiBaseUrl);
      const response = await apiRequest("PATCH", url, { title, description, status, clubId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/running-maintenance", clubId] });
      toast({ title: "Maintenance item updated", description: "Changes have been saved." });
      setEditingMaintItem(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update maintenance item.", variant: "destructive" });
    },
  });

  const deleteMaintenanceMutation = useMutation({
    mutationFn: async (id: number) => {
      const url = buildApiUrl(`/api/running-maintenance/${id}`, clubId, apiBaseUrl);
      await apiRequest("DELETE", url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/running-maintenance", clubId] });
      toast({ title: "Maintenance item deleted", description: "The item has been removed." });
      setEditingMaintItem(null);
      setConfirmDelete(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete maintenance item.", variant: "destructive" });
      setConfirmDelete(false);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async ({ maintIds, salesIds }: { maintIds: number[]; salesIds: number[] }) => {
      await Promise.all([
        ...maintIds.map((id) => {
          const url = buildApiUrl(`/api/running-maintenance/${id}`, clubId, apiBaseUrl);
          return apiRequest("DELETE", url);
        }),
        ...salesIds.map((id) => {
          const url = buildApiUrl(`/api/manager-logs/${id}`, clubId, apiBaseUrl);
          return apiRequest("DELETE", url);
        }),
      ]);
    },
    onSuccess: (_, { maintIds, salesIds }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/running-maintenance", clubId] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-logs", clubId] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      const total = maintIds.length + salesIds.length;
      toast({ title: "Records deleted", description: `${total} record${total !== 1 ? "s" : ""} removed.` });
      setSelectedMaintIds(new Set());
      setSelectedSalesIds(new Set());
      setShowBulkDeleteDialog(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete some records.", variant: "destructive" });
      setShowBulkDeleteDialog(false);
    },
  });

  const updateSalesMutation = useMutation({
    mutationFn: async (data: { date: string; food: string; bar: string; gaming: string }) => {
      const url = buildApiUrl("/api/manager-logs/historical", clubId, apiBaseUrl);
      const dateObj = new Date(data.date + "T12:00:00");
      const dayOfWeek = dateObj.toLocaleDateString("en-US", { weekday: "long" });
      const response = await apiRequest("POST", url, {
        logDate: data.date,
        dayOfWeek,
        foodSales: data.food,
        barSales: data.bar,
        gamingSales: data.gaming,
        clubId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-logs", clubId] });
      toast({ title: "Sales updated", description: "The sales data has been saved." });
      setEditingSalesEntry(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update sales data.", variant: "destructive" });
    },
  });

  const deleteSalesMutation = useMutation({
    mutationFn: async (id: number) => {
      const url = buildApiUrl(`/api/manager-logs/${id}`, clubId, apiBaseUrl);
      await apiRequest("DELETE", url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manager-logs", clubId] });
      toast({ title: "Record deleted", description: "The sales record has been removed." });
      setEditingSalesEntry(null);
      setConfirmSalesDelete(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete the sales record.", variant: "destructive" });
      setConfirmSalesDelete(false);
    },
  });

  const openMaintEdit = (item: RunningMaintenanceItem) => {
    setEditingMaintItem(item);
    setEditTitle(item.title);
    setEditDescription(item.description || "");
    setEditStatus(item.status as "open" | "completed");
    setConfirmDelete(false);
  };

  // ── Calendar helpers ───────────────────────────────────────────────────────

  const years = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - i);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  // ── Derived counts ─────────────────────────────────────────────────────────

  const validImportRows = importRows.filter((r) => !r.error);
  const salesCount = validImportRows.filter((r) => r.rowType === "sales").length;
  const maintCount = validImportRows.filter((r) => r.rowType === "maintenance").length;
  const errorCount = importRows.filter((r) => r.error).length;

  // ── Dialog content ─────────────────────────────────────────────────────────

  const dialogContent = (
    <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Data Import</DialogTitle>
        <DialogDescription>
          View, verify, and manage all your sales and maintenance data. Add individual entries or bulk import from CSV.
        </DialogDescription>
      </DialogHeader>

      <Tabs
        value={mode}
        onValueChange={(v) => setMode(v as "view" | "single" | "import")}
        className="pt-2"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="single">Single Entry</TabsTrigger>
          <TabsTrigger value="import" className="gap-1">
            <Upload className="h-3.5 w-3.5" />
            Import
          </TabsTrigger>
          <TabsTrigger value="view" className="gap-1">
            <TableProperties className="h-3.5 w-3.5" />
            View Data
          </TabsTrigger>
        </TabsList>

        {/* ── Single Entry Tab ── */}
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
                      const d = new Date(calendarMonth);
                      d.setMonth(parseInt(e.target.value));
                      setCalendarMonth(d);
                    }}
                    className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
                  >
                    {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                  <select
                    value={calendarMonth.getFullYear()}
                    onChange={(e) => {
                      const d = new Date(calendarMonth);
                      d.setFullYear(parseInt(e.target.value));
                      setCalendarMonth(d);
                    }}
                    className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                  >
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
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
              <Input id="hist-food-sales" type="number" placeholder="0.00" value={historicalFood}
                onChange={(e) => setHistoricalFood(e.target.value)} data-testid="input-historical-food" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hist-bar-sales">Bar Sales</Label>
              <Input id="hist-bar-sales" type="number" placeholder="0.00" value={historicalBar}
                onChange={(e) => setHistoricalBar(e.target.value)} data-testid="input-historical-bar" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hist-gaming-sales">Gaming Sales</Label>
              <Input id="hist-gaming-sales" type="number" placeholder="0.00" value={historicalGaming}
                onChange={(e) => setHistoricalGaming(e.target.value)} data-testid="input-historical-gaming" />
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
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
            ) : "Save Historical Data"}
          </Button>
        </TabsContent>

        {/* ── Unified Import Tab ── */}
        <TabsContent value="import" className="space-y-4 pt-4">
          {/* Format guide */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="font-medium text-sm">CSV Format Guide</p>
              <Button type="button" variant="outline" size="sm" onClick={downloadSampleCsv}>
                <Download className="h-3 w-3 mr-1" />
                Sample CSV
              </Button>
            </div>

            {/* Sales rows */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                Sales rows
              </p>
              <div className="bg-background rounded border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">date</th>
                      <th className="px-3 py-2 text-left font-medium">food</th>
                      <th className="px-3 py-2 text-left font-medium">bar</th>
                      <th className="px-3 py-2 text-left font-medium">gaming</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-t border-muted">
                      <td className="px-3 py-1.5">2025-01-15</td>
                      <td className="px-3 py-1.5">1820.00</td>
                      <td className="px-3 py-1.5">2640.00</td>
                      <td className="px-3 py-1.5">890.00</td>
                    </tr>
                    <tr className="border-t border-muted">
                      <td className="px-3 py-1.5">2025-01-16</td>
                      <td className="px-3 py-1.5">1550.00</td>
                      <td className="px-3 py-1.5">2190.00</td>
                      <td className="px-3 py-1.5">710.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3 flex-shrink-0" />
                Date format: YYYY-MM-DD · Numbers only, no $ symbols · At least one sales column required
              </p>
            </div>

            {/* Maintenance toggle */}
            <button
              type="button"
              onClick={() => setShowMaintenanceSection((v) => !v)}
              className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Wrench className="h-3 w-3" />
              {showMaintenanceSection ? "Hide maintenance rows" : "Show maintenance rows"}
            </button>

            {/* Maintenance rows */}
            {showMaintenanceSection && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                  Maintenance rows — add a <code className="bg-muted px-1 rounded">type</code> column set to <code className="bg-muted px-1 rounded">maintenance</code>
                </p>
                <div className="bg-background rounded border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">type</th>
                        <th className="px-3 py-2 text-left font-medium">title</th>
                        <th className="px-3 py-2 text-left font-medium">date_added</th>
                        <th className="px-3 py-2 text-left font-medium">date_completed</th>
                      </tr>
                    </thead>
                    <tbody className="text-muted-foreground">
                      <tr className="border-t border-muted">
                        <td className="px-3 py-1.5 font-medium text-foreground">maintenance</td>
                        <td className="px-3 py-1.5">Fix leaking faucet</td>
                        <td className="px-3 py-1.5">2025-02-01</td>
                        <td className="px-3 py-1.5">2025-02-10</td>
                      </tr>
                      <tr className="border-t border-muted">
                        <td className="px-3 py-1.5 font-medium text-foreground">maintenance</td>
                        <td className="px-3 py-1.5">Replace HVAC filters</td>
                        <td className="px-3 py-1.5">2025-03-05</td>
                        <td className="px-3 py-1.5 italic text-muted-foreground/60">leave blank = Open</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3 flex-shrink-0" />
                  Title required · Fill in date_completed to import as Completed, leave blank to import as Open · Sales rows in the same file need <code className="bg-muted px-1 rounded">type</code> set to <code className="bg-muted px-1 rounded">sales</code>
                </p>
              </div>
            )}
          </div>

          {/* Drop zone */}
          <div className="space-y-2">
            <Label>Upload CSV File</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                importIsDragOver ? "border-primary bg-primary/5" : "hover:border-primary/50"
              }`}
              onDragOver={handleImportDragOver}
              onDragLeave={handleImportDragLeave}
              onDrop={handleImportDrop}
            >
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleImportFileChange}
                className="hidden"
                id="unified-csv-upload"
                data-testid="input-csv-upload"
              />
              <label htmlFor="unified-csv-upload" className="cursor-pointer">
                <Upload className={`h-8 w-8 mx-auto mb-2 transition-colors ${importIsDragOver ? "text-primary" : "text-muted-foreground"}`} />
                <p className="text-sm text-muted-foreground">
                  {importFile ? importFile.name : importIsDragOver ? "Drop your CSV file here" : "Click to upload or drag and drop"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">CSV or TXT file</p>
              </label>
            </div>
          </div>

          {/* Parse error */}
          {importParseError && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-sm text-destructive">{importParseError}</p>
            </div>
          )}

          {/* Preview */}
          {importRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label>
                  Preview — {salesCount} sales, {maintCount} maintenance
                  {errorCount > 0 && <span className="text-destructive ml-1">({errorCount} with errors)</span>}
                </Label>
                <Button variant="ghost" size="sm" onClick={clearImport}>Clear</Button>
              </div>
              <div className="max-h-52 overflow-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2">Type</th>
                      <th className="text-left p-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((row, idx) => (
                      <tr key={idx} className={row.error ? "bg-destructive/10" : ""}>
                        <td className="p-2 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            row.rowType === "sales"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                              : row.rowType === "maintenance"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                              : "bg-destructive/20 text-destructive"
                          }`}>
                            {row.rowType === "unknown" ? "?" : row.rowType}
                          </span>
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {row.rowType === "sales" && (
                            <span>
                              {row.date}{" "}
                              <span className="text-foreground/60">
                                Food ${row.foodSales.toFixed(0)} · Bar ${row.barSales.toFixed(0)} · Gaming ${row.gamingSales.toFixed(0)}
                              </span>
                            </span>
                          )}
                          {row.rowType === "maintenance" && (
                            <span>
                              <span className="font-medium text-foreground">{row.title}</span>
                              {row.dateAdded && <span className="text-foreground/60"> · Added {row.dateAdded}</span>}
                              {row.dateCompleted && <span className="text-foreground/60"> · Completed {row.dateCompleted}</span>}
                            </span>
                          )}
                          {row.rowType === "unknown" && <span className="text-xs">{row.raw.slice(0, 60)}</span>}
                          {row.error && (
                            <span className="text-xs text-destructive block mt-0.5">{row.error}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import result */}
          {importResult && (
            <div className={`rounded-lg p-3 flex items-start gap-2 ${
              importResult.salesFailed === 0 && importResult.maintFailed === 0
                ? "bg-green-500/10 border border-green-500/30"
                : "bg-amber-500/10 border border-amber-500/30"
            }`}>
              <CheckCircle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                importResult.salesFailed === 0 && importResult.maintFailed === 0 ? "text-green-600" : "text-amber-600"
              }`} />
              <div className="text-sm">
                {importResult.salesSuccess > 0 && (
                  <p className="text-green-700 dark:text-green-400">
                    {importResult.salesSuccess} sales record{importResult.salesSuccess !== 1 ? "s" : ""} imported
                  </p>
                )}
                {importResult.maintSuccess > 0 && (
                  <p className="text-green-700 dark:text-green-400">
                    {importResult.maintSuccess} maintenance item{importResult.maintSuccess !== 1 ? "s" : ""} imported
                  </p>
                )}
                {(importResult.salesFailed > 0 || importResult.maintFailed > 0) && (
                  <p className="text-amber-700 dark:text-amber-400">
                    {importResult.salesFailed + importResult.maintFailed} row(s) had errors and were skipped
                  </p>
                )}
                {importResult.errors.length > 0 && (
                  <ul className="mt-1 text-xs text-muted-foreground">
                    {importResult.errors.slice(0, 3).map((err, i) => <li key={i}>{err}</li>)}
                    {importResult.errors.length > 3 && <li>...and {importResult.errors.length - 3} more</li>}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Progress */}
          {(unifiedImportMutation.isPending || importProgress > 0) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{importProgress >= 100 ? "Complete" : "Importing..."}</span>
                <span>{Math.round(importProgress)}%</span>
              </div>
              <Progress value={importProgress} className="h-2 bg-secondary" />
            </div>
          )}

          {/* Import button */}
          <Button
            className="w-full"
            disabled={validImportRows.length === 0 || unifiedImportMutation.isPending}
            onClick={() => {
              if (validImportRows.length > 0) unifiedImportMutation.mutate(importRows);
            }}
            data-testid="button-bulk-import"
          >
            {unifiedImportMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Import {salesCount > 0 ? `${salesCount} Sales` : ""}
                {salesCount > 0 && maintCount > 0 ? " + " : ""}
                {maintCount > 0 ? `${maintCount} Maintenance` : ""}
                {salesCount === 0 && maintCount === 0 ? "Data" : ""}
              </>
            )}
          </Button>
        </TabsContent>

        {/* ── View Data Tab ── */}
        <TabsContent value="view" className="pt-4 space-y-4">

          {/* Controls bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by date or maintenance title..."
                value={maintenanceSearch}
                onChange={(e) => setMaintenanceSearch(e.target.value)}
                className="pl-7 h-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-1">
              {(["all", "sales", "maintenance"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setUnifiedTypeFilter(f)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    unifiedTypeFilter === f
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover-elevate"
                  }`}
                >
                  {f === "all" ? "All" : f === "sales" ? "Sales" : "Maintenance"}
                </button>
              ))}
            </div>
            {(selectedMaintIds.size + selectedSalesIds.size) > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBulkDeleteDialog(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete ({selectedMaintIds.size + selectedSalesIds.size})
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
              {unifiedDates.length} day{unifiedDates.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Unified date-grouped log */}
          {(isLoadingSales || isLoadingMaintenance) ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading records...</span>
            </div>
          ) : unifiedDates.length === 0 ? (
            <div className="rounded-md border bg-muted/30 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {maintenanceSearch.trim()
                  ? `No records match "${maintenanceSearch.trim()}".`
                  : "No records found."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {unifiedDates.map((date) => {
                const salesEntry = logByDate.get(date);
                const maintItems = maintByDate.get(date) ?? [];
                const d = new Date(date + "T12:00:00");
                const fmt = (n: number) =>
                  "$" + n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                return (
                  <div key={date} className="rounded-md border bg-card">
                    {/* Date header */}
                    <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 rounded-t-md">
                      <span className="text-sm font-semibold">{format(d, "MMM d, yyyy")}</span>
                      <span className="text-xs text-muted-foreground">{format(d, "EEEE")}</span>
                    </div>

                    <div className="divide-y">
                      {/* Sales row */}
                      {unifiedTypeFilter !== "maintenance" && (
                        <div className={`flex items-center gap-3 px-4 py-3 ${salesEntry && selectedSalesIds.has(salesEntry.id) ? "bg-muted/30" : ""}`}>
                          {salesEntry ? (
                            <input
                              type="checkbox"
                              className="cursor-pointer flex-shrink-0"
                              checked={selectedSalesIds.has(salesEntry.id)}
                              onChange={(e) => {
                                const next = new Set(selectedSalesIds);
                                if (e.target.checked) next.add(salesEntry.id);
                                else next.delete(salesEntry.id);
                                setSelectedSalesIds(next);
                              }}
                              aria-label={`Select sales entry for ${date}`}
                            />
                          ) : (
                            <span className="w-4 flex-shrink-0" />
                          )}
                          <DollarSign className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          {salesEntry ? (
                            <>
                              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm flex-1 min-w-0">
                                <span className="text-muted-foreground">
                                  Food <span className="font-medium text-foreground">{fmt(salesEntry.foodSales)}</span>
                                </span>
                                <span className="text-muted-foreground">
                                  Bar <span className="font-medium text-foreground">{fmt(salesEntry.barSales)}</span>
                                </span>
                                <span className="text-muted-foreground">
                                  Gaming <span className="font-medium text-foreground">{fmt(salesEntry.gamingSales)}</span>
                                </span>
                                <span className="font-medium">
                                  Total <span className="text-primary">{fmt(salesEntry.totalSales)}</span>
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditingSalesEntry(salesEntry);
                                  setEditFood(String(salesEntry.foodSales));
                                  setEditBar(String(salesEntry.barSales));
                                  setEditGaming(String(salesEntry.gamingSales));
                                  setConfirmSalesDelete(false);
                                }}
                                aria-label="Edit sales entry"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <span className="text-sm text-muted-foreground italic">No sales entry</span>
                          )}
                        </div>
                      )}

                      {/* Maintenance rows */}
                      {unifiedTypeFilter !== "sales" &&
                        maintItems.map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-center gap-3 px-4 py-2.5 ${selectedMaintIds.has(item.id) ? "bg-muted/30" : ""}`}
                          >
                            <input
                              type="checkbox"
                              className="cursor-pointer flex-shrink-0"
                              checked={selectedMaintIds.has(item.id)}
                              onChange={(e) => {
                                const next = new Set(selectedMaintIds);
                                if (e.target.checked) next.add(item.id);
                                else next.delete(item.id);
                                setSelectedMaintIds(next);
                              }}
                              aria-label={`Select ${item.title}`}
                            />
                            <Wrench className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium block truncate">{item.title}</span>
                              {item.description && (
                                <span className="text-xs text-muted-foreground block truncate">{item.description}</span>
                              )}
                            </div>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${
                                item.status === "completed"
                                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                              }`}
                            >
                              {item.status === "completed" ? "Completed" : "Open"}
                            </span>
                            {item.dateCompleted && (
                              <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:block">
                                Done {format(new Date(item.dateCompleted), "MMM d")}
                              </span>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openMaintEdit(item)}
                              data-testid={`button-edit-maint-${item.id}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Sales edit dialog */}
      <Dialog open={!!editingSalesEntry} onOpenChange={(open) => { if (!open) { setEditingSalesEntry(null); setConfirmSalesDelete(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Edit Sales — {editingSalesEntry ? format(new Date(editingSalesEntry.date + "T12:00:00"), "MMM d, yyyy") : ""}
            </DialogTitle>
            <DialogDescription>
              Update or delete the sales record for this date.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-food">Food Sales</Label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    id="edit-food"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editFood}
                    onChange={(e) => setEditFood(e.target.value)}
                    className="pl-6"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-bar">Bar Sales</Label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    id="edit-bar"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editBar}
                    onChange={(e) => setEditBar(e.target.value)}
                    className="pl-6"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-gaming">Gaming Sales</Label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    id="edit-gaming"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editGaming}
                    onChange={(e) => setEditGaming(e.target.value)}
                    className="pl-6"
                  />
                </div>
              </div>
            </div>
            {editingSalesEntry && (
              <p className="text-xs text-muted-foreground">
                Total:{" "}
                <span className="font-medium text-foreground">
                  ${(
                    (parseFloat(editFood) || 0) +
                    (parseFloat(editBar) || 0) +
                    (parseFloat(editGaming) || 0)
                  ).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 flex-wrap">
            <Button
              variant={confirmSalesDelete ? "destructive" : "outline"}
              size="sm"
              onClick={() => {
                if (confirmSalesDelete && editingSalesEntry) {
                  deleteSalesMutation.mutate(editingSalesEntry.id);
                } else {
                  setConfirmSalesDelete(true);
                }
              }}
              disabled={deleteSalesMutation.isPending}
            >
              {deleteSalesMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              {confirmSalesDelete ? "Confirm Delete" : "Delete Record"}
            </Button>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => { setEditingSalesEntry(null); setConfirmSalesDelete(false); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (!editingSalesEntry) return;
                  updateSalesMutation.mutate({
                    date: editingSalesEntry.date,
                    food: editFood.trim() || "0",
                    bar: editBar.trim() || "0",
                    gaming: editGaming.trim() || "0",
                  });
                }}
                disabled={updateSalesMutation.isPending}
              >
                {updateSalesMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Maintenance edit dialog (nested, uses Radix portal so it renders outside) */}
      <Dialog open={!!editingMaintItem} onOpenChange={(open) => { if (!open) { setEditingMaintItem(null); setConfirmDelete(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Edit Maintenance Item
            </DialogTitle>
            <DialogDescription>
              Update the title, description, or status of this maintenance item.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Status toggle + metadata row */}
            {editingMaintItem && (
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={editStatus === "open" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setEditStatus("open")}
                  >
                    Open
                  </Button>
                  <Button
                    type="button"
                    variant={editStatus === "completed" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setEditStatus("completed")}
                  >
                    Completed
                  </Button>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">Added:</span>{" "}
                    {editingMaintItem.dateAdded
                      ? format(new Date(editingMaintItem.dateAdded), "MMM d, yyyy")
                      : "—"}
                  </span>
                  {editingMaintItem.dateCompleted && (
                    <span>
                      <span className="font-medium text-foreground">Completed:</span>{" "}
                      {format(new Date(editingMaintItem.dateCompleted), "MMM d, yyyy")}
                    </span>
                  )}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-maint-title">Title</Label>
              <Input
                id="edit-maint-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Maintenance item title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-maint-desc">Description / Notes</Label>
              <Textarea
                id="edit-maint-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional notes or description"
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between gap-2 pt-2 border-t">
              <Button
                variant={confirmDelete ? "destructive" : "ghost"}
                size="sm"
                onClick={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                  } else if (editingMaintItem) {
                    deleteMaintenanceMutation.mutate(editingMaintItem.id);
                  }
                }}
                disabled={deleteMaintenanceMutation.isPending || updateMaintenanceMutation.isPending}
              >
                {deleteMaintenanceMutation.isPending ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Deleting...</>
                ) : confirmDelete ? (
                  <><AlertTriangle className="h-3.5 w-3.5 mr-1.5" />Confirm Delete?</>
                ) : (
                  <><Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete</>
                )}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditingMaintItem(null)}
                  disabled={updateMaintenanceMutation.isPending || deleteMaintenanceMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (editingMaintItem) {
                      updateMaintenanceMutation.mutate({
                        id: editingMaintItem.id,
                        title: editTitle.trim(),
                        description: editDescription.trim(),
                        status: editStatus,
                      });
                    }
                  }}
                  disabled={!editTitle.trim() || updateMaintenanceMutation.isPending || deleteMaintenanceMutation.isPending}
                >
                  {updateMaintenanceMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                  ) : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk-delete confirmation dialog */}
      <Dialog open={showBulkDeleteDialog} onOpenChange={(open) => { if (!open) setShowBulkDeleteDialog(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete {selectedMaintIds.size + selectedSalesIds.size} Record{(selectedMaintIds.size + selectedSalesIds.size) !== 1 ? "s" : ""}?
            </DialogTitle>
            <DialogDescription>
              {selectedSalesIds.size > 0 && selectedMaintIds.size > 0
                ? `${selectedSalesIds.size} sales record${selectedSalesIds.size !== 1 ? "s" : ""} and ${selectedMaintIds.size} maintenance item${selectedMaintIds.size !== 1 ? "s" : ""} will be permanently removed.`
                : selectedSalesIds.size > 0
                ? `${selectedSalesIds.size} sales record${selectedSalesIds.size !== 1 ? "s" : ""} will be permanently removed.`
                : `${selectedMaintIds.size} maintenance item${selectedMaintIds.size !== 1 ? "s" : ""} will be permanently removed.`}
              {" "}This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowBulkDeleteDialog(false)}
              disabled={bulkDeleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => bulkDeleteMutation.mutate({ maintIds: Array.from(selectedMaintIds), salesIds: Array.from(selectedSalesIds) })}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</>
              ) : (
                `Delete ${selectedMaintIds.size + selectedSalesIds.size} Record${(selectedMaintIds.size + selectedSalesIds.size) !== 1 ? "s" : ""}`
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DialogContent>
  );

  if (trigger) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
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
