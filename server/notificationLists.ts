import { db } from "./db";
import {
  notificationLists,
  notificationRecipients,
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface NotificationRecipientWithList {
  id: number;
  name: string | null;
  email: string;
}

export interface NotificationListWithRecipients {
  id: number;
  clubId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  recipients: NotificationRecipientWithList[];
}

export async function getNotificationLists(clubId: string): Promise<NotificationListWithRecipients[]> {
  const lists = await db
    .select()
    .from(notificationLists)
    .where(eq(notificationLists.clubId, clubId));

  const listsWithRecipients: NotificationListWithRecipients[] = [];

  for (const list of lists) {
    const recipients = await db
      .select({
        id: notificationRecipients.id,
        name: notificationRecipients.name,
        email: notificationRecipients.email,
      })
      .from(notificationRecipients)
      .where(eq(notificationRecipients.listId, list.id));

    listsWithRecipients.push({
      id: list.id,
      clubId: list.clubId,
      name: list.name,
      description: list.description,
      isDefault: list.isDefault,
      recipients,
    });
  }

  return listsWithRecipients;
}

export async function seedDefaultNotificationLists(clubId: string): Promise<void> {
  const existing = await db
    .select()
    .from(notificationLists)
    .where(eq(notificationLists.clubId, clubId))
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  const [coreTeam] = await db
    .insert(notificationLists)
    .values({
      clubId,
      name: "Core Team",
      description: "Key staff and managers",
      isDefault: true,
    })
    .returning();

  const [kitchenStaff] = await db
    .insert(notificationLists)
    .values({
      clubId,
      name: "Kitchen Staff",
      description: "Kitchen and food service team",
      isDefault: false,
    })
    .returning();

  const [ownership] = await db
    .insert(notificationLists)
    .values({
      clubId,
      name: "Ownership",
      description: "Club owners and stakeholders",
      isDefault: false,
    })
    .returning();

}
