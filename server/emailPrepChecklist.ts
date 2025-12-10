// server/emailPrepChecklist.ts
import { sendNotificationEmail } from "./email_utils";
import { db } from "./db";
import { NotificationList, NotificationRecipient, clubs } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function sendPrepChecklistEmail(
  clubId: string,
  result: { fromDate: string; toDate: string; items: { description: string }[] },
) {
  if (result.items.length === 0) return;

  // Look up club + its prep checklist list id
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId));
  if (!club || !club.prepChecklistNotificationListId) return;

  const listId = club.prepChecklistNotificationListId;

  const [list] = await db
    .select()
    .from(NotificationList)
    .where(eq(NotificationList.id, listId));

  if (!list) return;

  const recipients = await db
    .select()
    .from(NotificationRecipient)
    .where(eq(NotificationRecipient.listId, listId));

  const emails = recipients.map((r) => r.email);
  if (emails.length === 0) return;

  const subject = `[${club.name}] Tomorrow's Prep Checklist – ${result.items.length} item(s) rolled over`;

  const itemsHtml = result.items
    .map((i) => `<li>${i.description}</li>`)
    .join("");

  const htmlBody = `
    <p>These open items from ${result.fromDate} have been rolled into ${result.toDate}:</p>
    <ul>${itemsHtml}</ul>
    <p>View tomorrow's To-Do list in the Manager's Log to update or complete items.</p>
  `;

  await sendNotificationEmail(subject, htmlBody, emails);
}
