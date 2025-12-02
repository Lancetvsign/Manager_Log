/**
 * CHART EXPORT UTILITIES
 * ======================
 * Functions for exporting charts to PNG and PDF formats.
 * Uses html2canvas for DOM-to-canvas conversion and jsPDF for PDF generation.
 * 
 * HOW EXPORT FUNCTIONS WORK:
 * 1. html2canvas captures the chart DOM element as a canvas
 * 2. For PNG: Canvas is converted to base64 and downloaded
 * 3. For PDF: jsPDF creates a document and adds the canvas as an image
 * 4. Metadata (title, date range, club name) is added to the export
 * 
 * @example
 * // Export a chart element as PNG
 * const chartRef = useRef<HTMLDivElement>(null);
 * await exportChartToPng(chartRef.current, {
 *   title: "Sales Trend",
 *   dateRange: "Dec 1 - Dec 31, 2025",
 *   clubName: "My Club",
 * });
 */

import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import type { ChartExportConfig } from "@shared/schema";

interface ExportMetadata {
  title: string;
  dateRange: string;
  clubName?: string;
}

const DEFAULT_EXPORT_CONFIG: ChartExportConfig = {
  format: "png",
  includeTitle: true,
  includeDateRange: true,
  includeClubName: true,
  quality: 0.95,
  scale: 2,
};

/**
 * Captures a DOM element as a canvas using html2canvas
 */
async function captureElementAsCanvas(
  element: HTMLElement,
  scale: number = 2
): Promise<HTMLCanvasElement> {
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
  });
  return canvas;
}

/**
 * Generates a filename for the export
 */
function generateFilename(title: string, format: "png" | "pdf"): string {
  const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const timestamp = new Date().toISOString().slice(0, 10);
  return `${sanitizedTitle}-${timestamp}.${format}`;
}

/**
 * Downloads a blob as a file
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports a chart element as a PNG image
 * 
 * @param element - The DOM element to capture
 * @param metadata - Title, date range, and club name for the export
 * @param config - Optional export configuration
 */
export async function exportChartToPng(
  element: HTMLElement | null,
  metadata: ExportMetadata,
  config: Partial<ChartExportConfig> = {}
): Promise<void> {
  if (!element) {
    console.error("Export failed: No element provided");
    return;
  }

  const finalConfig = { ...DEFAULT_EXPORT_CONFIG, ...config };

  try {
    const canvas = await captureElementAsCanvas(element, finalConfig.scale);

    const headerHeight = 60;
    const padding = 20;
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = canvas.width;
    finalCanvas.height = canvas.height + (finalConfig.includeTitle ? headerHeight : 0);

    const ctx = finalCanvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get canvas context");
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

    if (finalConfig.includeTitle) {
      ctx.fillStyle = "#1f2937";
      ctx.font = `bold ${24 * finalConfig.scale}px Inter, system-ui, sans-serif`;
      ctx.fillText(metadata.title, padding * finalConfig.scale, 30 * finalConfig.scale);

      ctx.fillStyle = "#6b7280";
      ctx.font = `${14 * finalConfig.scale}px Inter, system-ui, sans-serif`;
      let subtext = "";
      if (finalConfig.includeDateRange && metadata.dateRange) {
        subtext += metadata.dateRange;
      }
      if (finalConfig.includeClubName && metadata.clubName) {
        subtext += subtext ? ` | ${metadata.clubName}` : metadata.clubName;
      }
      if (subtext) {
        ctx.fillText(subtext, padding * finalConfig.scale, 50 * finalConfig.scale);
      }

      ctx.drawImage(canvas, 0, headerHeight);
    } else {
      ctx.drawImage(canvas, 0, 0);
    }

    finalCanvas.toBlob(
      (blob) => {
        if (blob) {
          downloadBlob(blob, generateFilename(metadata.title, "png"));
        }
      },
      "image/png",
      finalConfig.quality
    );
  } catch (error) {
    console.error("PNG export failed:", error);
    throw error;
  }
}

/**
 * Exports a chart element as a PDF document
 * 
 * @param element - The DOM element to capture
 * @param metadata - Title, date range, and club name for the export
 * @param config - Optional export configuration
 */
export async function exportChartToPdf(
  element: HTMLElement | null,
  metadata: ExportMetadata,
  config: Partial<ChartExportConfig> = {}
): Promise<void> {
  if (!element) {
    console.error("Export failed: No element provided");
    return;
  }

  const finalConfig = { ...DEFAULT_EXPORT_CONFIG, ...config };

  try {
    const canvas = await captureElementAsCanvas(element, finalConfig.scale);
    const imgData = canvas.toDataURL("image/png", finalConfig.quality);

    const imgWidth = canvas.width / finalConfig.scale;
    const imgHeight = canvas.height / finalConfig.scale;
    const pageWidth = imgWidth + 40;
    const pageHeight = imgHeight + (finalConfig.includeTitle ? 80 : 40);

    const pdf = new jsPDF({
      orientation: pageWidth > pageHeight ? "landscape" : "portrait",
      unit: "px",
      format: [pageWidth, pageHeight],
    });

    let yOffset = 20;

    if (finalConfig.includeTitle) {
      pdf.setFontSize(18);
      pdf.setTextColor(31, 41, 55);
      pdf.text(metadata.title, 20, yOffset + 15);

      pdf.setFontSize(10);
      pdf.setTextColor(107, 114, 128);
      let subtext = "";
      if (finalConfig.includeDateRange && metadata.dateRange) {
        subtext += metadata.dateRange;
      }
      if (finalConfig.includeClubName && metadata.clubName) {
        subtext += subtext ? ` | ${metadata.clubName}` : metadata.clubName;
      }
      if (subtext) {
        pdf.text(subtext, 20, yOffset + 30);
      }
      yOffset += 50;
    }

    pdf.addImage(imgData, "PNG", 20, yOffset, imgWidth, imgHeight);

    pdf.save(generateFilename(metadata.title, "pdf"));
  } catch (error) {
    console.error("PDF export failed:", error);
    throw error;
  }
}

/**
 * Export button handler that shows format selection
 * Used by the ChartExportButton component
 */
export async function exportChart(
  element: HTMLElement | null,
  format: "png" | "pdf",
  metadata: ExportMetadata,
  config: Partial<ChartExportConfig> = {}
): Promise<void> {
  if (format === "png") {
    await exportChartToPng(element, metadata, config);
  } else {
    await exportChartToPdf(element, metadata, config);
  }
}
