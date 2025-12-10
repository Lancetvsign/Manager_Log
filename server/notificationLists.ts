/**
 * Notification Lists Module
 * 
 * In production, these would be fetched from Social Club Pro's database.
 * For development, we provide mock data that matches the Social Club Pro schema.
 */

export interface NotificationRecipient {
  id: number;
  name: string;
  email: string;
}

export interface NotificationList {
  id: number;
  clubId: string;
  name: string;
  description: string;
  isDefault: boolean;
  recipients: NotificationRecipient[];
}

/**
 * Get notification lists for a club.
 * 
 * In production, replace this with a database query:
 * ```typescript
 * const lists = await db.query.notificationLists.findMany({
 *   where: eq(notificationLists.clubId, clubId),
 *   with: { recipients: true }
 * });
 * ```
 */
export function getMockNotificationLists(clubId: string): NotificationList[] {
  return [
    {
      id: 1,
      clubId,
      name: "Core Team",
      description: "Key staff and managers",
      isDefault: true,
      recipients: [
        { id: 1, name: "Manager", email: "manager@example.com" },
        { id: 2, name: "Assistant Manager", email: "assistant@example.com" }
      ]
    },
    {
      id: 2,
      clubId,
      name: "Kitchen Staff",
      description: "Kitchen and food service team",
      isDefault: false,
      recipients: [
        { id: 3, name: "Head Chef", email: "chef@example.com" },
        { id: 4, name: "Line Cook", email: "cook@example.com" }
      ]
    },
    {
      id: 3,
      clubId,
      name: "Ownership",
      description: "Club owners and stakeholders",
      isDefault: false,
      recipients: [
        { id: 5, name: "Owner", email: "owner@example.com" }
      ]
    }
  ];
}
