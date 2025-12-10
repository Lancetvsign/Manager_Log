/**
 * Seed Default Escalation Rules
 * 
 * Creates default escalation rules for a club based on common patterns.
 * Called when setting up a new club or initializing the notification system.
 * Idempotent - checks for existing rules before creating.
 */

import { db } from "./db";
import { escalationRules, escalationRuleTargets } from "@shared/schema";
import { eq, and } from "drizzle-orm";

interface SeedListIds {
  maintenanceListId: number;
  coreTeamListId: number;
  ownershipListId: number;
  technicianListId?: number;
}

/**
 * Helper to create a rule if it doesn't already exist (idempotent).
 */
async function createRuleIfNotExists(
  clubId: string,
  name: string,
  triggerType: string,
  options: {
    triggerReason?: string;
    flagKey?: string;
    autoSend?: boolean;
  }
) {
  // Check if rule already exists by name and clubId
  const existing = await db
    .select()
    .from(escalationRules)
    .where(and(eq(escalationRules.clubId, clubId), eq(escalationRules.name, name)))
    .limit(1);

  if (existing.length > 0) {
    console.log(`[Escalation] Rule "${name}" already exists for club ${clubId}, skipping`);
    return existing[0];
  }

  const [rule] = await db
    .insert(escalationRules)
    .values({
      clubId,
      name,
      triggerType,
      triggerReason: options.triggerReason,
      flagKey: options.flagKey,
      autoSend: options.autoSend ?? false,
    })
    .returning();

  return rule;
}

/**
 * Seed default escalation rules for a club.
 * Creates common rules mapping notification reasons to appropriate lists.
 * Idempotent - safe to call multiple times.
 */
export async function seedDefaultEscalationRulesForClub(
  clubId: string,
  listIds: SeedListIds
) {
  // Maintenance issue → Maintenance list
  const maintenanceRule = await createRuleIfNotExists(
    clubId,
    "Maintenance issue → Maintenance list",
    "reason",
    { triggerReason: "maintenance", autoSend: false }
  );

  // Check if target already exists
  const existingMaintenanceTarget = await db
    .select()
    .from(escalationRuleTargets)
    .where(and(
      eq(escalationRuleTargets.ruleId, maintenanceRule.id),
      eq(escalationRuleTargets.listId, listIds.maintenanceListId)
    ))
    .limit(1);

  if (existingMaintenanceTarget.length === 0) {
    await db.insert(escalationRuleTargets).values({
      ruleId: maintenanceRule.id,
      listId: listIds.maintenanceListId,
    });
  }

  // Employee behavior → Ownership + Core Team
  const behaviorRule = await createRuleIfNotExists(
    clubId,
    "Employee behavior → Ownership + Core Team",
    "reason",
    { triggerReason: "behavior", autoSend: true }
  );

  for (const listId of [listIds.ownershipListId, listIds.coreTeamListId]) {
    const existingTarget = await db
      .select()
      .from(escalationRuleTargets)
      .where(and(
        eq(escalationRuleTargets.ruleId, behaviorRule.id),
        eq(escalationRuleTargets.listId, listId)
      ))
      .limit(1);

    if (existingTarget.length === 0) {
      await db.insert(escalationRuleTargets).values({
        ruleId: behaviorRule.id,
        listId,
      });
    }
  }

  // Gaming outage → Technician (flag-based)
  if (listIds.technicianListId) {
    const gamingRule = await createRuleIfNotExists(
      clubId,
      "Gaming outage → Technician",
      "flag",
      { flagKey: "gaming_outage", autoSend: true }
    );

    const existingGamingTarget = await db
      .select()
      .from(escalationRuleTargets)
      .where(and(
        eq(escalationRuleTargets.ruleId, gamingRule.id),
        eq(escalationRuleTargets.listId, listIds.technicianListId)
      ))
      .limit(1);

    if (existingGamingTarget.length === 0) {
      await db.insert(escalationRuleTargets).values({
        ruleId: gamingRule.id,
        listId: listIds.technicianListId,
      });
    }
  }

  console.log(`[Escalation] Seeded default rules for club ${clubId}`);
}
