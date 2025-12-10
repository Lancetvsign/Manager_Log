import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Zap, Settings, ChevronDown, ChevronUp } from "lucide-react";
import type { NotificationList } from "@shared/schema";

type TriggerReason = "maintenance" | "behavior" | "other";

type EscalationRule = {
  id: number;
  clubId: string;
  name: string;
  triggerType: "reason" | "metric" | "flag";
  triggerReason?: TriggerReason | null;
  metricKey?: string | null;
  metricThreshold?: string | null;
  flagKey?: string | null;
  autoSend: boolean;
  enabled: boolean;
  presetKey?: string | null;
  targetListIds?: number[];
  targetLists?: string[];
};

type AutomationPresetKey =
  | "maintenance_alert"
  | "behavior_alert"
  | "sales_drop_warning"
  | "gaming_outage";

type AutomationPreset = {
  key: AutomationPresetKey;
  title: string;
  description: string;
  defaultAutoSend: boolean;
  defaultListName: string;
  buildRule: (clubId: string, extra?: { threshold?: number; targetListIds?: number[] }) => Omit<EscalationRule, "id">;
};

const AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: "maintenance_alert",
    title: "Maintenance Alerts",
    description: "When Maintenance issue is selected, notify Maintenance list.",
    defaultAutoSend: true,
    defaultListName: "Maintenance",
    buildRule: (clubId, extra) => ({
      clubId,
      name: "Maintenance issue → Maintenance team",
      triggerType: "reason",
      triggerReason: "maintenance",
      autoSend: true,
      enabled: true,
      presetKey: "maintenance_alert",
      targetListIds: extra?.targetListIds,
    }),
  },
  {
    key: "behavior_alert",
    title: "Behavior Incident Alerts",
    description: "When Employee behavior is selected, notify Core Team + Ownership.",
    defaultAutoSend: true,
    defaultListName: "Core Team",
    buildRule: (clubId, extra) => ({
      clubId,
      name: "Behavior incident → Core + Ownership",
      triggerType: "reason",
      triggerReason: "behavior",
      autoSend: true,
      enabled: true,
      presetKey: "behavior_alert",
      targetListIds: extra?.targetListIds,
    }),
  },
  {
    key: "sales_drop_warning",
    title: "Sales Drop Warning",
    description: "Alert GM when today's total sales drop more than X% vs last week.",
    defaultAutoSend: false,
    defaultListName: "Core Team",
    buildRule: (clubId, extra) => ({
      clubId,
      name: `Sales drop warning (> ${extra?.threshold ?? 15}% vs last week)`,
      triggerType: "metric",
      metricKey: "sales_drop_pct",
      metricThreshold: String(extra?.threshold ?? 15),
      autoSend: false,
      enabled: true,
      presetKey: "sales_drop_warning",
      targetListIds: extra?.targetListIds,
    }),
  },
  {
    key: "gaming_outage",
    title: "Gaming Outage Alert",
    description: "When a gaming outage is logged, notify the gaming technician list.",
    defaultAutoSend: true,
    defaultListName: "Core Team",
    buildRule: (clubId, extra) => ({
      clubId,
      name: "Gaming outage → Technician",
      triggerType: "flag",
      flagKey: "gaming_outage",
      autoSend: true,
      enabled: true,
      presetKey: "gaming_outage",
      targetListIds: extra?.targetListIds,
    }),
  },
];

interface EscalationRulesModalProps {
  clubId: string;
  onClose: () => void;
  onRulesChanged?: () => void;
}

export default function EscalationRulesModal({
  clubId,
  onClose,
  onRulesChanged,
}: EscalationRulesModalProps) {
  const { toast } = useToast();
  const [salesDropThreshold, setSalesDropThreshold] = useState(15);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { data: rules = [], isLoading: loadingRules } = useQuery<EscalationRule[]>({
    queryKey: ["/api/escalation-rules", clubId],
  });

  const { data: lists = [] } = useQuery<(NotificationList & { recipientCount: number })[]>({
    queryKey: ["/api/notifications/lists", clubId],
  });

  // Hydrate threshold from existing rule
  useEffect(() => {
    const salesRule = rules.find((r) => r.presetKey === "sales_drop_warning");
    if (salesRule?.metricThreshold != null) {
      const threshold = Number(salesRule.metricThreshold);
      if (!isNaN(threshold) && threshold > 0) {
        setSalesDropThreshold(threshold);
      }
    }
  }, [rules]);

  function getPresetRule(presetKey: AutomationPresetKey) {
    return rules.find((r) => r.presetKey === presetKey);
  }

  function getDefaultTargetListIds(preset: AutomationPreset): number[] {
    const targetList = lists.find((l) => l.name === preset.defaultListName);
    return targetList ? [targetList.id] : lists.length > 0 ? [lists[0].id] : [];
  }

  const enablePresetMutation = useMutation({
    mutationFn: async ({ preset }: { preset: AutomationPreset }) => {
      const existing = getPresetRule(preset.key);
      const targetListIds = getDefaultTargetListIds(preset);
      const body = preset.buildRule(clubId, {
        threshold: preset.key === "sales_drop_warning" ? salesDropThreshold : undefined,
        targetListIds,
      });

      if (existing) {
        return apiRequest("PATCH", `/api/escalation-rules/${existing.id}`, { ...body, enabled: true });
      } else {
        return apiRequest("POST", "/api/escalation-rules", body);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escalation-rules", clubId] });
      onRulesChanged?.();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to enable automation.", variant: "destructive" });
    },
  });

  const disablePresetMutation = useMutation({
    mutationFn: async ({ preset }: { preset: AutomationPreset }) => {
      const existing = getPresetRule(preset.key);
      if (!existing) return;
      return apiRequest("PATCH", `/api/escalation-rules/${existing.id}`, { enabled: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escalation-rules", clubId] });
      onRulesChanged?.();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to disable automation.", variant: "destructive" });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: number) => {
      return apiRequest("DELETE", `/api/escalation-rules/${ruleId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escalation-rules", clubId] });
      toast({ title: "Rule deleted" });
      onRulesChanged?.();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete rule.", variant: "destructive" });
    },
  });

  const customRules = rules.filter((r) => !r.presetKey);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-xl shadow-xl max-w-xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold">Smart Automations</h2>
          </div>
          <button
            type="button"
            className="inline-flex items-center px-2 py-1 text-xs font-medium border border-muted-foreground/30 text-muted-foreground rounded hover:bg-muted"
            onClick={onClose}
            data-testid="button-close-rules-modal"
          >
            ✕ Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Turn on automations that help your team respond faster. You can still add custom rules below.
          </p>

          {loadingRules ? (
            <p className="text-sm text-muted-foreground">Loading automations...</p>
          ) : (
            <div className="border rounded-lg divide-y">
              {AUTOMATION_PRESETS.map((preset) => {
                const rule = getPresetRule(preset.key);
                const active = !!rule?.enabled;

                return (
                  <div
                    key={preset.key}
                    className="flex justify-between items-start p-3 gap-3"
                    data-testid={`preset-${preset.key}`}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-sm flex items-center gap-2">
                        {preset.title}
                        {rule && (
                          <Badge variant="outline" className="text-xs">
                            {rule.autoSend ? "Auto-send" : "Manual"}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {preset.description}
                      </div>

                      {preset.key === "sales_drop_warning" && (
                        <div className="flex items-center gap-2 mt-2 text-xs">
                          <span>Warn if sales drop more than</span>
                          <Input
                            type="number"
                            min={5}
                            max={100}
                            step={1}
                            value={salesDropThreshold}
                            onChange={(e) => setSalesDropThreshold(Number(e.target.value || 0))}
                            className="h-7 w-16 text-xs"
                            data-testid="input-sales-threshold"
                          />
                          <span>% vs last week</span>
                          {rule && (
                            <button
                              type="button"
                              className="text-xs text-emerald-600 hover:underline ml-1"
                              onClick={() => enablePresetMutation.mutate({ preset })}
                            >
                              Save
                            </button>
                          )}
                        </div>
                      )}

                      {rule && active && rule.targetLists && rule.targetLists.length > 0 && (
                        <div className="text-xs text-emerald-600 mt-1">
                          → {rule.targetLists.join(", ")}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={active}
                        disabled={lists.length === 0}
                        onCheckedChange={(checked) =>
                          checked
                            ? enablePresetMutation.mutate({ preset })
                            : disablePresetMutation.mutate({ preset })
                        }
                        data-testid={`switch-preset-${preset.key}`}
                      />
                      <span className="text-xs text-muted-foreground w-6">
                        {active ? "On" : "Off"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {lists.length === 0 && !loadingRules && (
            <p className="text-xs text-amber-600">
              Create a notification list first to enable automations.
            </p>
          )}

          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 text-sm border rounded-lg hover:bg-muted/50"
            onClick={() => setShowAdvanced(!showAdvanced)}
            data-testid="button-toggle-advanced"
          >
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span>Advanced Automation</span>
            </div>
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showAdvanced && (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
              <p className="text-xs text-muted-foreground">
                Custom rules created here are for advanced scenarios. Preset automations above are recommended for most use cases.
              </p>

              {customRules.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase">
                    Custom Rules
                  </h4>
                  {customRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between p-2 border rounded bg-background"
                      data-testid={`rule-${rule.id}`}
                    >
                      <div>
                        <div className="text-sm font-medium">{rule.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {rule.triggerType === "metric" &&
                            `When ${rule.metricKey} > ${rule.metricThreshold}%`}
                          {rule.triggerType === "flag" && `When ${rule.flagKey} is set`}
                          {rule.triggerType === "reason" &&
                            `When reason = "${rule.triggerReason}"`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {rule.autoSend && (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                            Auto
                          </Badge>
                        )}
                        <button
                          type="button"
                          className="text-xs text-destructive hover:underline"
                          onClick={() => deleteRuleMutation.mutate(rule.id)}
                          data-testid={`button-delete-rule-${rule.id}`}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No custom rules yet. Use presets above for common scenarios.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
