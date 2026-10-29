import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { insertManagerLogSchema } from "../shared/schema";
import SalesInput from "../client/src/components/SalesInput";
import { historicalSalesEntry, parseCSVRFC4180, parseHistoricalSalesRow } from "../client/src/lib/historical-sales-import";
import { resetSalesDatabase, savedRows } from "./support/sales-database";

const clubId = "sales-regression";
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
let server: Awaited<ReturnType<typeof registerRoutes>>;
let base: string;

before(async () => {
  const app = express();
  app.use(express.json());
  server = await registerRoutes(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
beforeEach(() => resetSalesDatabase());

async function request(method: string, path: string, body?: unknown, status = 200) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  return data;
}

function renderSales(current: Record<"food" | "bar" | "gaming" | "catering", string>, budget?: any, collapsed = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <SalesInput title="Sales" salesData={{ current, lastYear: { food: "", bar: "", gaming: "", catering: "" } }}
          onSalesChange={() => {}} budget={budget} onBudgetSave={() => {}}
          hasHistoricalData collapsible={collapsed} isOpen={!collapsed} />
      </QueryClientProvider>,
    );
  } finally {
    client.clear();
  }
}

function inputById(html: string, testId: string) {
  const tag = html.match(new RegExp(`<input[^>]*data-testid="${testId}"[^>]*>`))?.[0];
  assert.ok(tag, `${testId} must be rendered`);
  return tag;
}

async function assertInsights(expected: { food: number; bar: number; gaming: number; catering: number; total: number }, date = today) {
  const metrics = await request("GET", `/api/metrics?clubId=${clubId}&startDate=${date}&endDate=${date}`);
  assert.deepEqual(metrics.salesByCategory, expected);
  assert.equal(metrics.summary.totalSales, expected.total);
  assert.equal(metrics.summary.averageDailySales, expected.total / metrics.summary.daysWithLogs);
  assert.equal(metrics.dailySales.reduce((sum: number, day: any) => sum + day.totalSales, 0), expected.total);
  for (const day of metrics.dailySales) {
    assert.equal(day.totalSales, Math.round((day.foodSales + day.barSales + day.gamingSales + day.cateringSales) * 100) / 100);
  }
  return metrics;
}

test("catering-only club budget survives save/read and contributes to the displayed budget total", async () => {
  const budget = await request("PUT", `/api/club-budget?clubId=${clubId}`, { cateringSales: "725.50" });
  assert.deepEqual(budget, { foodSales: "", barSales: "", gamingSales: "", cateringSales: "725.50" });
  assert.equal(savedRows("clubs")[0].budgetCateringSales, "725.50");
  assert.deepEqual(await request("GET", `/api/club-budget?clubId=${clubId}`), budget);
  const html = renderSales({ food: "", bar: "", gaming: "", catering: "" }, budget);
  assert.match(inputById(html, "input-budget-catering"), /value="725.5"/);
  assert.match(html, /\$725\.5</);
  const budgetButton = html.match(/<button[^>]*data-testid="button-compare-budget"[^>]*>/)?.[0];
  assert.ok(budgetButton, "a Catering-only budget must be available for comparison");
  assert.doesNotMatch(budgetButton, /\sdisabled(?:=|[\s>])/);
});

test("partial budget updates preserve Catering and explicit zero clears only that category", async () => {
  await request("PUT", `/api/club-budget?clubId=${clubId}`, { foodSales: "100", barSales: "200", gamingSales: "300", cateringSales: "400" });
  const edited = await request("PUT", `/api/club-budget?clubId=${clubId}`, { cateringSales: "450" });
  assert.deepEqual(edited, { foodSales: "100.00", barSales: "200.00", gamingSales: "300.00", cateringSales: "450.00" });
  assert.match(renderSales({ food: "", bar: "", gaming: "", catering: "" }, edited), /\$1,050</);
  const legacy = await request("PUT", `/api/club-budget?clubId=${clubId}`, { foodSales: "110", barSales: "210", gamingSales: "310" });
  assert.equal(legacy.cateringSales, "450.00");
  assert.match(renderSales({ food: "", bar: "", gaming: "", catering: "" }, legacy), /\$1,080</);
  const cleared = await request("PUT", `/api/club-budget?clubId=${clubId}`, { cateringSales: "0" });
  assert.equal(cleared.cateringSales, "0.00");
  assert.equal(cleared.foodSales, "110.00");
});

test("mixed four-category daily log ignores stale supplied total and matches Insights and the sales display", async () => {
  const log = await request("POST", "/api/manager-logs", {
    clubId, logDate: today, dayOfWeek: "Friday", managerName: "Regression test",
    foodSales: "110.25", barSales: "220.50", gamingSales: "330.75", cateringSales: "440.10", totalSales: "661.50",
  }, 201);
  assert.equal(log.totalSales, "1101.60");
  assert.equal(savedRows("manager_logs")[0].totalSales, "1101.60");
  const read = await request("GET", `/api/manager-logs/${log.id}?clubId=${clubId}`);
  assert.equal(read.cateringSales, "440.10");
  assert.equal(read.totalSales, "1101.60");
  const metrics = await assertInsights({ food: 110.25, bar: 220.5, gaming: 330.75, catering: 440.1, total: 1101.6 });
  assert.equal(metrics.dailySales[0].cateringSales, 440.1);
  assert.equal(metrics.topDays[0].totalSales, 1101.6);
  const budget = await request("PUT", `/api/club-budget?clubId=${clubId}`, {
    foodSales: "110.25", barSales: "220.50", gamingSales: "330.75", cateringSales: "440.10",
  });
  assert.equal(Object.values(budget).reduce((sum: number, amount: any) => sum + Number(amount), 0), 1101.6);
  const figures = { food: "110.25", bar: "220.50", gaming: "330.75", catering: "440.10" };
  assert.match(renderSales(figures, budget), /\$1,101\.6</);
  const html = renderSales(figures, budget, true);
  assert.match(html, /Total: \$1,101\.60/);
});

test("editing just Catering recomputes the saved total and all Insights totals, including clearing to zero", async () => {
  const original = await request("POST", "/api/manager-logs", {
    clubId, logDate: today, dayOfWeek: "Friday", foodSales: "100", barSales: "200", gamingSales: "300", cateringSales: "400",
  }, 201);
  const edited = await request("PATCH", `/api/manager-logs/${original.id}?clubId=${clubId}`, { cateringSales: "555.55", totalSales: "1000" });
  assert.equal(edited.totalSales, "1155.55");
  assert.equal(edited.foodSales, "100.00");
  assert.equal(savedRows("manager_logs")[0].cateringSales, "555.55");
  await assertInsights({ food: 100, bar: 200, gaming: 300, catering: 555.55, total: 1155.55 });
  const cleared = await request("PATCH", `/api/manager-logs/${original.id}?clubId=${clubId}`, { cateringSales: "0" });
  assert.equal(cleared.totalSales, "600.00");
  await assertInsights({ food: 100, bar: 200, gaming: 300, catering: 0, total: 600 });
});

test("legacy three-category CSV goes through the bulk import without overwriting saved Catering", async () => {
  const date = "2025-02-03";
  await request("POST", "/api/manager-logs/historical", {
    clubId, logDate: date, dayOfWeek: "Monday", foodSales: "10", barSales: "20", gamingSales: "30", cateringSales: "75.25",
  }, 201);
  const [header, values] = parseCSVRFC4180('date,food,bar,gaming\r\n2025-02-03,"110.10",220.20,330.30\r\n');
  const row = parseHistoricalSalesRow(header, values);
  assert.equal(row.error, undefined);
  assert.equal(row.cateringSales, undefined);
  const entry = historicalSalesEntry(row, clubId);
  assert.equal(Object.hasOwn(entry, "cateringSales"), false);
  const parsed = insertManagerLogSchema.parse(entry);
  assert.equal(parsed.cateringSales, undefined, "schema must not default omitted Catering to zero");
  assert.deepEqual(await request("POST", "/api/manager-logs/bulk-historical", { entries: [entry] }), { success: 1, failed: 0, errors: [] });
  const [saved] = await storage.getManagerLogsByDateRange(date, date, clubId);
  assert.equal(saved.cateringSales, "75.25");
  assert.equal(saved.totalSales, "735.85");
  assert.equal(savedRows("manager_logs").length, 1, "import should update, not duplicate the day");
  await assertInsights({ food: 110.1, bar: 220.2, gaming: 330.3, catering: 75.25, total: 735.85 }, date);
});

test("four-category historical CSV supports aliases, Catering-only rows, and an explicit zero replacement", async () => {
  const date = "2025-02-03";
  const [header, values] = parseCSVRFC4180("log_date,food_sales,bar_sales,gaming_sales,catering_sales\n2025-02-03,,,,125.50");
  const row = parseHistoricalSalesRow(header, values);
  assert.equal(row.error, undefined);
  assert.equal(row.cateringSales, 125.5);
  await request("POST", "/api/manager-logs/bulk-historical", { entries: [historicalSalesEntry(row, clubId)] });
  await assertInsights({ food: 0, bar: 0, gaming: 0, catering: 125.5, total: 125.5 }, date);
  const zero = parseHistoricalSalesRow(header, [date, "10", "20", "30", "0"]);
  assert.equal(historicalSalesEntry(zero, clubId).cateringSales, "0");
  await request("POST", "/api/manager-logs/bulk-historical", { entries: [historicalSalesEntry(zero, clubId)] });
  assert.equal(savedRows("manager_logs")[0].cateringSales, "0.00");
  await assertInsights({ food: 10, bar: 20, gaming: 30, catering: 0, total: 60 }, date);
});

test("Insights aggregates multiple days and keeps another club and out-of-range Catering out", async () => {
  for (const entry of [
    { clubId, logDate: "2025-02-03", foodSales: "10.10", barSales: "20.20", gamingSales: "30.30", cateringSales: "40.40" },
    { clubId, logDate: "2025-02-04", foodSales: "50", barSales: "60", gamingSales: "70", cateringSales: "80" },
    { clubId, logDate: "2024-01-01", cateringSales: "9999" },
    { clubId: "other-club", logDate: "2025-02-03", cateringSales: "8888" },
  ]) {
    await request("POST", "/api/manager-logs/historical", { dayOfWeek: "Monday", ...entry }, 201);
  }
  const metrics = await request("GET", `/api/metrics?clubId=${clubId}&startDate=2025-02-03&endDate=2025-02-04`);
  assert.deepEqual(metrics.salesByCategory, { food: 60.1, bar: 80.2, gaming: 100.3, catering: 120.4, total: 361 });
  assert.equal(metrics.summary.totalSales, 361);
  assert.equal(metrics.summary.averageDailySales, 180.5);
  assert.equal(metrics.summary.daysWithLogs, 2);
  assert.equal(metrics.dailySales.reduce((sum: number, day: any) => sum + day.cateringSales, 0), 120.4);
});

test("shared CSV parser keeps quoted commas, escaped quotes and multiline maintenance descriptions intact", () => {
  assert.deepEqual(parseCSVRFC4180('type,title,description\r\nmaintenance,"Door, back","Says ""stuck""\nNeeds repair"\r\n'), [
    ["type", "title", "description"],
    ["maintenance", "Door, back", 'Says "stuck"\nNeeds repair'],
  ]);
});