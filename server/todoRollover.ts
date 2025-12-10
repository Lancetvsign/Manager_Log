/**
 * TO-DO ROLLOVER SERVICE
 * Handles rolling over open to-do items (maintenance items) to the next day
 */
import { db } from "./db";
import { maintenanceItems, managerLogs } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getOrCreateLogForDate } from "./logsService";

export type RolloverResult = {
  fromDate: string;
  toDate: string;
  createdCount: number;
  items: { id: number; description: string }[];
};

/**
 * Roll over all open to-do items from one date to another.
 * Creates copies of open items on the target date's log and marks originals as rolled.
 * 
 * @param clubId - The club identifier
 * @param fromDate - Source date in "YYYY-MM-DD" format
 * @param toDate - Target date in "YYYY-MM-DD" format
 * @returns RolloverResult with count and details of rolled items
 */
export async function rollOpenTodosForDate(
  clubId: string,
  fromDate: string,
  toDate: string,
): Promise<RolloverResult> {
  // 1. Get or create logs for both dates
  const fromLog = await getOrCreateLogForDate(clubId, fromDate);
  const toLog = await getOrCreateLogForDate(clubId, toDate);

  // 2. Find all OPEN items on fromDate that haven't been rolled yet
  const openItems = await db
    .select()
    .from(maintenanceItems)
    .where(
      and(
        eq(maintenanceItems.managerLogId, fromLog.id),
        eq(maintenanceItems.status, "open"),
        isNull(maintenanceItems.rolledOverToDate),
      ),
    );

  if (openItems.length === 0) {
    return { fromDate, toDate, createdCount: 0, items: [] };
  }

  // 3. Insert copies for the target date
  const toInsert = openItems.map((item) => ({
    managerLogId: toLog.id,
    description: item.description,
    notes: item.notes,
    status: "open" as const,
    carriedOverFromId: item.id,
  }));

  const inserted = await db.insert(maintenanceItems).values(toInsert).returning();

  // 4. Mark originals as rolled (prevents duplicate rollover)
  await db
    .update(maintenanceItems)
    .set({ rolledOverToDate: toDate })
    .where(
      and(
        eq(maintenanceItems.managerLogId, fromLog.id),
        eq(maintenanceItems.status, "open"),
        isNull(maintenanceItems.rolledOverToDate),
      ),
    );

  return {
    fromDate,
    toDate,
    createdCount: inserted.length,
    items: inserted.map((i) => ({ id: i.id, description: i.description })),
  };
}
