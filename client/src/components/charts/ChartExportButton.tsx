/**
 * CHART EXPORT BUTTON COMPONENT
 * ==============================
 * A dropdown button for exporting charts to PNG or PDF format.
 * 
 * Features:
 * - Export to PNG (high-resolution image)
 * - Export to PDF (single-page document)
 * - Includes chart title, date range, and club name in exports
 * - Loading state during export
 * 
 * @example
 * const chartRef = useRef<HTMLDivElement>(null);
 * <ChartExportButton
 *   chartRef={chartRef}
 *   title="Sales Trend"
 *   dateRange="Dec 1 - Dec 31, 2025"
 *   clubName="My Club"
 * />
 */

import { useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Image, FileText, Loader2 } from "lucide-react";
import { exportChart } from "@/lib/chartExport";
import { useToast } from "@/hooks/use-toast";

interface ChartExportButtonProps {
  chartRef: RefObject<HTMLDivElement>;
  title: string;
  dateRange: string;
  clubName?: string;
}

export default function ChartExportButton({
  chartRef,
  title,
  dateRange,
  clubName,
}: ChartExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async (format: "png" | "pdf") => {
    setIsExporting(true);
    try {
      await exportChart(
        chartRef.current,
        format,
        { title, dateRange, clubName },
        { scale: 2, quality: 0.95 }
      );
      toast({
        title: "Export successful",
        description: `Chart exported as ${format.toUpperCase()}`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "There was an error exporting the chart. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={isExporting}
          data-testid="button-chart-export"
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => handleExport("png")}
          data-testid="button-export-png"
        >
          <Image className="h-4 w-4 mr-2" />
          Export as PNG
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport("pdf")}
          data-testid="button-export-pdf"
        >
          <FileText className="h-4 w-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
