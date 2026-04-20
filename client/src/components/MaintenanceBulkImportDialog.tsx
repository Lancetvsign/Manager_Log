import { useState, useCallback, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { buildApiUrl } from "@/contexts/ManagerLogContext";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, AlertCircle, CheckCircle, Loader2 } from "lucide-react";

interface MaintenanceBulkImportDialogProps {
  clubId: string;
  apiBaseUrl?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedRow {
  title: string;
  description: string;
  dateAdded: string;
  dateCompleted: string;
  error?: string;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export default function MaintenanceBulkImportDialog({
  clubId,
  apiBaseUrl,
  open,
  onOpenChange,
}: MaintenanceBulkImportDialogProps) {
  const { toast } = useToast();

  const [isDragOver, setIsDragOver] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetState = useCallback(() => {
    setCsvFile(null);
    setPreviewData([]);
    setParseError(null);
    setImportResult(null);
    setImportProgress(0);
  }, []);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) resetState();
    onOpenChange(newOpen);
  }, [resetState, onOpenChange]);

  const parseCSVLine = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            inQuotes = false;
            i++;
          }
        } else {
          field += ch;
          i++;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
          i++;
        } else if (ch === ',') {
          row.push(field);
          field = '';
          i++;
        } else if (ch === '\r' && text[i + 1] === '\n') {
          row.push(field);
          field = '';
          rows.push(row);
          row = [];
          i += 2;
        } else if (ch === '\n') {
          row.push(field);
          field = '';
          rows.push(row);
          row = [];
          i++;
        } else {
          field += ch;
          i++;
        }
      }
    }
    if (field || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  };

  const parseCSV = useCallback((text: string) => {
    const allRows = parseCSVLine(text.trim());
    if (allRows.length < 2) {
      setParseError("CSV must have a header row and at least one data row");
      setPreviewData([]);
      return;
    }

    const header = allRows[0].map(h => h.trim().toLowerCase());
    const titleIdx = header.findIndex(h => h === 'title' || h === 'item' || h === 'name');
    const descIdx = header.findIndex(h => h === 'description' || h === 'desc' || h === 'notes');
    const dateAddedIdx = header.findIndex(h => h === 'date_added' || h === 'dateadded' || h === 'date');
    const dateCompletedIdx = header.findIndex(h => h === 'date_completed' || h === 'datecompleted' || h === 'completed');

    if (titleIdx === -1) {
      setParseError("CSV must have a 'title' column");
      setPreviewData([]);
      return;
    }

    const rows: ParsedRow[] = [];
    for (let i = 1; i < allRows.length; i++) {
      const values = allRows[i];
      if (values.every(v => v.trim() === '')) continue;

      const title = (values[titleIdx] || '').trim();
      const description = descIdx >= 0 ? (values[descIdx] || '').trim() : '';
      const dateAdded = dateAddedIdx >= 0 ? (values[dateAddedIdx] || '').trim() : '';
      const dateCompleted = dateCompletedIdx >= 0 ? (values[dateCompletedIdx] || '').trim() : '';

      let error: string | undefined;
      if (!title) {
        error = "Title is required";
      } else if (dateAdded && !DATE_REGEX.test(dateAdded)) {
        error = `Invalid date_added format (use YYYY-MM-DD)`;
      } else if (dateCompleted && !DATE_REGEX.test(dateCompleted)) {
        error = `Invalid date_completed format (use YYYY-MM-DD)`;
      }

      rows.push({ title, description, dateAdded, dateCompleted, error });
    }

    if (rows.length === 0) {
      setParseError("No valid data rows found");
      setPreviewData([]);
      return;
    }

    setParseError(null);
    setPreviewData(rows);
  }, []);

  const processFile = useCallback((file: File) => {
    setCsvFile(file);
    setImportResult(null);
    setImportProgress(0);
    const reader = new FileReader();
    reader.onload = (e) => parseCSV(e.target?.result as string);
    reader.onerror = () => { setParseError("Failed to read file"); setPreviewData([]); };
    reader.readAsText(file);
  }, [parseCSV]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
  }, []);

  const bulkImportMutation = useMutation({
    mutationFn: async (rows: ParsedRow[]) => {
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
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/running-maintenance", clubId] });
      if (result.failed === 0) {
        toast({ title: `${result.success} items imported`, description: "Maintenance items have been added." });
      } else if (result.success > 0) {
        toast({
          title: `${result.success} of ${result.success + result.failed} items imported`,
          description: `${result.failed} row(s) had errors.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  // Simulated progress bar
  useEffect(() => {
    if (bulkImportMutation.isPending) {
      setImportProgress(0);
      progressIntervalRef.current = setInterval(() => {
        setImportProgress(prev => {
          const remaining = 85 - prev;
          const step = Math.max(0.5, remaining * 0.06);
          return Math.min(85, prev + step);
        });
      }, 120);
    } else {
      if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null; }
      if (bulkImportMutation.isSuccess) {
        setImportProgress(100);
        const t = setTimeout(() => setImportProgress(0), 1800);
        return () => clearTimeout(t);
      } else {
        setImportProgress(0);
      }
    }
    return () => { if (progressIntervalRef.current) clearInterval(progressIntervalRef.current); };
  }, [bulkImportMutation.isPending, bulkImportMutation.isSuccess]);

  const validRows = previewData.filter(r => !r.error);
  const errorRows = previewData.filter(r => r.error);

  const downloadSampleCsv = useCallback(() => {
    const a = document.createElement('a');
    a.href = '/demo_maintenance.csv';
    a.download = 'demo_maintenance.csv';
    a.click();
  }, []);

  const fileInputId = "maintenance-bulk-csv-upload";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Import Maintenance Items</DialogTitle>
          <DialogDescription>
            Upload a CSV file to add multiple maintenance items at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Format guide + sample download */}
          <div className="rounded-md border bg-muted/40 p-3 space-y-2">
            <p className="text-sm font-medium">Required CSV Format</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button type="button" variant="outline" size="sm" onClick={downloadSampleCsv}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download Sample CSV
              </Button>
              <span className="text-xs text-muted-foreground">or follow the format below</span>
            </div>
            <div className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="px-2 py-1 text-left font-medium">title</th>
                    <th className="px-2 py-1 text-left font-medium">description</th>
                    <th className="px-2 py-1 text-left font-medium">date_added</th>
                    <th className="px-2 py-1 text-left font-medium">date_completed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-muted-foreground">
                    <td className="px-2 py-1">Replace HVAC filters</td>
                    <td className="px-2 py-1">6-month cycle</td>
                    <td className="px-2 py-1">2024-11-15</td>
                    <td className="px-2 py-1">2024-12-02</td>
                  </tr>
                  <tr className="text-muted-foreground">
                    <td className="px-2 py-1">Fix leaking faucet</td>
                    <td className="px-2 py-1"></td>
                    <td className="px-2 py-1">2025-01-10</td>
                    <td className="px-2 py-1">(blank = still open)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              <strong>title</strong> is required. Leave <strong>date_completed</strong> blank for open items. Dates must be YYYY-MM-DD.
            </p>
          </div>

          {/* File upload */}
          <div className="space-y-2">
            <Label>Upload CSV File</Label>
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
              className="hidden"
              id={fileInputId}
              data-testid="input-maintenance-csv-upload"
            />
            <div
              className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors ${
                isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById(fileInputId)?.click()}
            >
              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {csvFile ? csvFile.name : isDragOver ? "Drop your CSV file here" : "Click to upload or drag and drop"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">CSV or TXT file</p>
            </div>
          </div>

          {/* Parse error */}
          {parseError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-sm text-destructive">{parseError}</p>
            </div>
          )}

          {/* Preview */}
          {previewData.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Preview ({previewData.length} rows)</Label>
                {errorRows.length > 0 && (
                  <span className="text-xs text-destructive">{errorRows.length} row(s) with errors will be skipped</span>
                )}
              </div>
              <div className="border rounded-md overflow-auto max-h-48">
                <table className="text-xs w-full">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Title</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-left p-2">Date Added</th>
                      <th className="text-left p-2">Date Completed</th>
                      <th className="text-left p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, idx) => (
                      <tr key={idx} className={`border-t ${row.error ? "bg-destructive/5" : ""}`}>
                        <td className="p-2 max-w-[180px] truncate">{row.title || <span className="text-destructive italic">missing</span>}</td>
                        <td className="p-2 max-w-[160px] truncate text-muted-foreground">{row.description}</td>
                        <td className="p-2">{row.dateAdded || <span className="text-muted-foreground italic">today</span>}</td>
                        <td className="p-2">{row.dateCompleted || <span className="text-muted-foreground italic">—</span>}</td>
                        <td className="p-2">
                          {row.error
                            ? <span className="text-destructive">{row.error}</span>
                            : row.dateCompleted
                              ? <span className="text-muted-foreground">Completed</span>
                              : <span className="text-green-600 dark:text-green-400">Open</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {(bulkImportMutation.isPending || importProgress > 0) && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{bulkImportMutation.isPending ? "Importing…" : "Complete"}</span>
                <span>{Math.round(importProgress)}%</span>
              </div>
              <Progress value={importProgress} className="h-2" />
            </div>
          )}

          {/* Import result */}
          {importResult && (
            <div className={`flex items-start gap-2 rounded-md border p-3 ${
              importResult.failed === 0
                ? "border-green-500/50 bg-green-500/10"
                : "border-yellow-500/50 bg-yellow-500/10"
            }`}>
              <CheckCircle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${importResult.failed === 0 ? "text-green-600" : "text-yellow-600"}`} />
              <div className="text-sm">
                <p className="font-medium">
                  {importResult.success} item{importResult.success !== 1 ? "s" : ""} imported successfully
                  {importResult.failed > 0 ? `, ${importResult.failed} failed` : ""}
                </p>
                {importResult.errors.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground list-disc list-inside">
                    {importResult.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                    {importResult.errors.length > 5 && <li>…and {importResult.errors.length - 5} more</li>}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between items-center pt-1">
            {csvFile && !importResult && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetState}
              >
                Clear
              </Button>
            )}
            {!csvFile && <span />}
            <div className="flex gap-2 ml-auto">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                {importResult ? "Close" : "Cancel"}
              </Button>
              {!importResult && (
                <Button
                  type="button"
                  disabled={validRows.length === 0 || bulkImportMutation.isPending}
                  onClick={() => bulkImportMutation.mutate(validRows)}
                  data-testid="button-maintenance-bulk-import-submit"
                >
                  {bulkImportMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Importing…</>
                  ) : (
                    `Import ${validRows.length} Item${validRows.length !== 1 ? "s" : ""}`
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
