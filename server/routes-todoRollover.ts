/**
 * TO-DO ROLLOVER ROUTER
 * Handles API endpoints for rolling over to-do items to the next day.
 */
import express from "express";
import { rollOpenTodosForDate } from "./todoRollover";
import { sendPrepChecklistEmail } from "./emailPrepChecklist";

export const todoRolloverRouter = express.Router();

/**
 * Helper to get clubId from request (query string or default)
 */
function getClubId(req: express.Request): string {
  return (req.query.clubId as string) || "default";
}

/**
 * POST /api/todos/rollover
 * Body:
 *  - date?: string (YYYY-MM-DD) – defaults to "today"
 *  - sendEmail?: boolean – default true
 */
todoRolloverRouter.post("/rollover", async (req, res) => {
  try {
    const clubId = getClubId(req);
    const { date, sendEmail = true } = req.body ?? {};

    const today = date ?? new Date().toISOString().slice(0, 10);
    const d = new Date(today);
    const tomorrowDate = new Date(d.getTime() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const result = await rollOpenTodosForDate(clubId, today, tomorrowDate);

    if (sendEmail && result.createdCount > 0) {
      try {
        await sendPrepChecklistEmail(clubId, result);
      } catch (emailError) {
        console.error("Failed to send prep checklist email:", emailError);
      }
    }

    res.json(result);
  } catch (error) {
    console.error("Error in todo rollover:", error);
    res.status(500).json({ error: "Failed to rollover todos" });
  }
});
