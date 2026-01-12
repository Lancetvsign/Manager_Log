/**
 * CHART COMPONENTS INDEX
 * ======================
 * Export all reusable chart components from a single entry point.
 * 
 * Usage:
 * import { SalesTrendChart, ToDoStatusPieChart, SalesBreakdownChart } from '@/components/charts';
 * 
 * HOW TO ADD NEW CHART TYPES:
 * 1. Create the chart component in this directory
 * 2. Export it from this index file
 * 3. Import and use it in InsightsPage.tsx
 */

export { default as SalesTrendChart } from './SalesTrendChart';
export { default as SalesChart } from './SalesChart';
export { default as ToDoStatusPieChart } from './ToDoStatusPieChart';
export { default as SalesBreakdownChart } from './SalesBreakdownChart';
export { default as SalesHeatmapCalendar } from './SalesHeatmapCalendar';
export { default as WeekdaySalesChart } from './WeekdaySalesChart';
export { default as ChartOptionsPopover, DEFAULT_CHART_OPTIONS, CHART_COLOR_THEMES } from './ChartOptionsPopover';
export { default as ChartExportButton } from './ChartExportButton';
export { default as CollapsibleSection } from './CollapsibleSection';
export { default as ComparisonModeSelector, getComparisonDateRange } from './ComparisonModeSelector';
export { makeCompareFromCurrent, makeDemoSalesSeries, makeDemoSummary, generateDemoSalesSeries } from './salesDemo';
export type { SalesPoint, DemoSeriesOptions } from './salesDemo';
