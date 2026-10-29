export interface HistoricalSalesRow {
  rowType: "sales";
  date: string;
  foodSales: number;
  barSales: number;
  gamingSales: number;
  cateringSales?: number;
  error?: string;
}

/** RFC 4180 parser shared by sales and maintenance imports. */
export function parseCSVRFC4180(text: string): string[][] {
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
}

/** Header is normalized by the unified importer before calling this helper. */
export function parseHistoricalSalesRow(header: string[], values: string[]): HistoricalSalesRow {
  const read = (...names: string[]) => {
    const index = header.findIndex(h => names.includes(h));
    return index >= 0 ? (values[index] || "").trim() : "";
  };
  const date = read("date", "log_date");
  const food = read("food", "food_sales");
  const bar = read("bar", "bar_sales");
  const gaming = read("gaming", "gaming_sales");
  const catering = read("catering", "catering_sales");
  let error: string | undefined;
  if (!date) error = "Date is required for sales rows";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) error = "Invalid date (use YYYY-MM-DD)";
  else if (!food && !bar && !gaming && !catering) error = "At least one sales amount (food, bar, gaming, catering) is required";
  return {
    rowType: "sales",
    date,
    foodSales: parseFloat(food) || 0,
    barSales: parseFloat(bar) || 0,
    gamingSales: parseFloat(gaming) || 0,
    cateringSales: header.some(h => h === "catering" || h === "catering_sales") ? parseFloat(catering) || 0 : undefined,
    error,
  };
}

export function historicalSalesEntry(row: HistoricalSalesRow, clubId: string) {
  return {
    logDate: row.date,
    dayOfWeek: new Date(row.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" }),
    foodSales: row.foodSales.toString(),
    barSales: row.barSales.toString(),
    gamingSales: row.gamingSales.toString(),
    ...(row.cateringSales !== undefined && { cateringSales: row.cateringSales.toString() }),
    clubId,
  };
}