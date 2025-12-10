/**
 * LOGS SERVICE
 * Provides utility functions for manager log operations
 */
import { db } from "./db";
import { managerLogs } from "@shared/schema";
import { eq, and } from "drizzle-orm";

/**
 * Get an existing log for a specific date, or create one if it doesn't exist.
 * Used by rollover functionality to ensure there's a target log for rolled items.
 * 
 * @param clubId - The club identifier
 * @param targetDate - The date in "YYYY-MM-DD" format
 * @returns The existing or newly created manager log
 */
export async function getOrCreateLogForDate(clubId: string, targetDate: string) {
  // Check if a log already exists for this date
  const [existing] = await db
    .select()
    .from(managerLogs)
    .where(and(
      eq(managerLogs.clubId, clubId),
      eq(managerLogs.logDate, targetDate)
    ));

  if (existing) return existing;

  // Calculate day of week for the new entry
  const date = new Date(targetDate + "T12:00:00");
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayOfWeek = days[date.getDay()];

  // Create a new log entry for rollover
  const [created] = await db
    .insert(managerLogs)
    .values({
      clubId,
      logDate: targetDate,
      dayOfWeek,
      managerName: "Auto-created for rollover",
    })
    .returning();

  return created;
}
