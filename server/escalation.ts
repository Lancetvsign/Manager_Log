/**
 * Escalation Rules Engine
 * 
 * Automatically applies escalation rules when a manager log is saved.
 * Rules can trigger notifications based on:
 * - reason: When a specific notification reason is selected
 * - metric: When a metric condition is met (e.g., sales drop > 20%)
 * - flag: When a specific flag is set (e.g., gaming outage)
 */

import { db } from "./db";
import {
  escalationRules,
  escalationRuleTargets,
  notificationLists,
  notificationRecipients,
  notificationLogs,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { sendLogNotificationEmail, isEmailConfigured } from "./email";

interface ManagerLogForEscalation {
  id: number;
  clubId: string;
  date: string;
  managerName: string | null;
  reason?: "maintenance" | "behavior" | "other" | string;
  totalSales?: number | null;
  lastYearTotalSales?: number | null;
  hasGamingOutage?: boolean | null;
  salesNotes?: string | null;
  dailyNotes?: string | null;
}

/**
 * Apply escalation rules to a manager log.
 * Called after a log is saved to check for matching rules and send notifications.
 */
export async function applyEscalationRules(log: ManagerLogForEscalation) {
  const rules = await db
    .select()
    .from(escalationRules)
    .where(eq(escalationRules.clubId, log.clubId));

  if (!rules.length) return;

  const smtpConfigured = isEmailConfigured();

  for (const rule of rules) {
    const matches = doesRuleMatchLog(rule, log);
    if (!matches) continue;

    const targets = await db
      .select()
      .from(escalationRuleTargets)
      .where(eq(escalationRuleTargets.ruleId, rule.id));

    if (!targets.length) continue;

    const listIds = targets.map((t) => t.listId);

    const listsWithRecipients = await db
      .select({
        listId: notificationLists.id,
        email: notificationRecipients.email,
      })
      .from(notificationLists)
      .innerJoin(
        notificationRecipients,
        eq(notificationRecipients.listId, notificationLists.id)
      )
      .where(inArray(notificationLists.id, listIds));

    const recipientEmails = Array.from(
      new Set(listsWithRecipients.map((r) => r.email))
    );

    if (!recipientEmails.length) continue;

    const reasonText =
      rule.triggerType === "reason"
        ? rule.triggerReason ?? "Urgent issue"
        : rule.name;

    const subject = `[Auto] ${log.date} – ${reasonText}`;
    const message = [
      `Date: ${log.date}`,
      `Manager: ${log.managerName || "Unknown"}`,
      "",
      `Reason: ${reasonText}`,
      "",
      "Summary:",
      `Sales notes: ${log.salesNotes || "N/A"}`,
      `Daily notes: ${log.dailyNotes || "N/A"}`,
    ].join("\n");

    await db.insert(notificationLogs).values({
      logId: log.id,
      clubId: log.clubId,
      reason: reasonText,
      subject,
      message,
      listIds,
      recipients: recipientEmails,
      simulated: !smtpConfigured,
      autoTriggered: true,
    });

    if (rule.autoSend && smtpConfigured) {
      const logUrl = `${process.env.APP_BASE_URL ?? ""}/logs/${log.id}`;
      const htmlBody = `
        <p><strong>Reason:</strong> ${reasonText}</p>
        <p><strong>Date:</strong> ${log.date}</p>
        <p><strong>Manager:</strong> ${log.managerName || "Unknown"}</p>
        <p>${message.replace(/\n/g, "<br>")}</p>
        <hr/>
        <p>View entry: <a href="${logUrl}">${logUrl}</a></p>
      `;
      await sendLogNotificationEmail(subject, htmlBody, recipientEmails);
    }

    console.log(
      `[Escalation] Rule "${rule.name}" matched for log ${log.id}, notified ${recipientEmails.length} recipients${rule.autoSend ? " (auto-sent)" : ""}`
    );
  }
}

function doesRuleMatchLog(rule: any, log: ManagerLogForEscalation): boolean {
  switch (rule.triggerType) {
    case "reason": {
      if (!rule.triggerReason || !log.reason) return false;
      return rule.triggerReason === log.reason;
    }
    case "flag": {
      if (!rule.flagKey) return false;
      if (rule.flagKey === "gaming_outage") {
        return !!log.hasGamingOutage;
      }
      return false;
    }
    case "metric": {
      if (!rule.metricKey || !rule.metricOperator || rule.metricValue == null) {
        return false;
      }
      if (rule.metricKey === "sales_drop_pct") {
        const curr = log.totalSales ?? 0;
        const prev = log.lastYearTotalSales ?? 0;
        if (!prev) return false;
        const dropPct = ((prev - curr) / prev) * 100;
        return compareNumeric(dropPct, rule.metricOperator, Number(rule.metricValue));
      }
      return false;
    }
    default:
      return false;
  }
}

function compareNumeric(value: number, op: string, target: number): boolean {
  switch (op) {
    case "lt":
      return value < target;
    case "lte":
      return value <= target;
    case "gt":
      return value > target;
    case "gte":
      return value >= target;
    case "eq":
      return value === target;
    default:
      return false;
  }
}
