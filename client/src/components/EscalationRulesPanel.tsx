import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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
  suggestedListName: string | null;
  buildRule: (clubId: string, extra?: { threshold?: number; targetListIds?: number[] }) => Omit<EscalationRule, "id">;
};

const AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: "maintenance_alert",
    title: "Maintenance Alerts",
    description: "When Maintenance issue is selected, notify selected list.",
    defaultAutoSend: true,
    suggestedListName: "Maintenance",
    buildRule: (clubId, extra) => ({
      clubId,
      name: "Maintenance issue \u2192 Selected list",
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
    title: "Operational Issue Alerts",
    description: "When Operational Issue is selected, notify selected list.",
    defaultAutoSend: true,
    suggestedListName: "Core Team",
    buildRule: (clubId, extra) => ({
      clubId,
      name: "Operational Issue \u2192 Selected list",
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
    description: "Alert when today's total sales drop more than X% vs last week.",
    defaultAutoSend: false,
    suggestedListName: "Core Team",
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
    description: "When a gaming outage is logged, notify selected list.",
    defaultAutoSend: true,
    suggestedListName: null,
    buildRule: (clubId, extra) => ({
      clubId,
      name: "Gaming outage \u2192 Selected list",
      triggerType: "flag",
      flagKey: "gaming_outage",
      autoSend: true,
      enabled: true,
      presetKey: "gaming_outage",
      targetListIds: extra?.targetListIds,
    }),
  },
];

interface EscalationRulesPanelProps {
  clubId: string;
  onRulesChanged?: () => void;
}

export default function EscalationRulesPanel({
  clubId,
  onRulesChanged,
}: EscalationRulesPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [salesDropThreshold, setSalesDropThreshold] = useState(15);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedLists, setSelectedLists] = useState<Record<AutomationPresetKey, number | null>>({
    maintenance_alert: null,
    behavior_alert: null,
    sales_drop_warning: null,
    gaming_outage: null,
  });

  const { data: rules = [], isLoading: loadingRules } = useQuery<EscalationRule[]>({
    queryKey: ["/api/escalation-rules", clubId],
    queryFn: async () => {
      const res = await fetch(`/api/escalation-rules?clubId=${encodeURIComponent(clubId)}`);
      if (!res.ok) throw new Error("Failed to fetch escalation rules");
      return res.json();
    },
  });

  const { data: lists = [] } = useQuery<(NotificationList & { recipientCount: number })[]>({
    queryKey: ["/api/notifications/lists", clubId],
    queryFn: async () => {
      const res = await fetch(`/api/notifications/lists?clubId=${encodeURIComponent(clubId)}`);
      if (!res.ok) throw new Error("Failed to fetch notification lists");
      return res.json();
    },
  });

  useEffect(() => {
    const salesRule = rules.find((r) => r.presetKey === "sales_drop_warning");
    if (salesRule?.metricThreshold != null) {
      const threshold = Number(salesRule.metricThreshold);
      if (!isNaN(threshold) && threshold > 0) {
        setSalesDropThreshold((prev) => (prev !== threshold ? threshold : prev));
      }
    }

    const newSelectedLists: Record<AutomationPresetKey, number | null> = {
      maintenance_alert: null,
      behavior_alert: null,
      sales_drop_warning: null,
      gaming_outage: null,
    };
    for (const preset of AUTOMATION_PRESETS) {
      const rule = rules.find((r) => r.presetKey === preset.key);
      if (rule?.targetListIds && rule.targetListIds.length > 0) {
        newSelectedLists[preset.key] = rule.targetListIds[0];
      } else if (preset.suggestedListName) {
        const suggested = lists.find((l) => l.name === preset.suggestedListName);
        if (suggested) {
          newSelectedLists[preset.key] = suggested.id;
        }
      }
      if (newSelectedLists[preset.key] === null && lists.length > 0) {
        newSelectedLists[preset.key] = lists[0].id;
      }
    }
    setSelectedLists((prev) => {
      const changed = Object.keys(newSelectedLists).some(
        (key) => prev[key as AutomationPresetKey] !== newSelectedLists[key as AutomationPresetKey]
      );
      return changed ? newSelectedLists : prev;
    });
  }, [rules, lists]);

  function getPresetRule(presetKey: AutomationPresetKey) {
    return rules.find((r) => r.presetKey === presetKey);
  }

  const updateListMutation = useMutation({
    mutationFn: async ({ preset, listId }: { preset: AutomationPreset; listId: number }) => {
      const existing = getPresetRule(preset.key);
      if (existing) {
        return apiRequest("PATCH", `/api/escalation-rules/${existing.id}`, {
          targetListIds: [listId],
        });
      }
      return null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escalation-rules", clubId] });
      onRulesChanged?.();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update list.", variant: "destructive" });
    },
  });

  const enablePresetMutation = useMutation({
    mutationFn: async ({ preset, listId }: { preset: AutomationPreset; listId: number }) => {
      const existing = getPresetRule(preset.key);
      const body = preset.buildRule(clubId, {
        threshold: preset.key === "sales_drop_warning" ? salesDropThreshold : undefined,
        targetListIds: [listId],
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

  function handleListChange(preset: AutomationPreset, listId: number) {
    setSelectedLists((prev) => ({ ...prev, [preset.key]: listId }));
    const rule = getPresetRule(preset.key);
    if (rule?.enabled) {
      updateListMutation.mutate({ preset, listId });
    }
  }

  function handleToggle(preset: AutomationPreset, enabled: boolean) {
    const listId = selectedLists[preset.key];
    if (enabled) {
      if (!listId) {
        toast({ title: "Select a list", description: "Please select a notification list first.", variant: "destructive" });
        return;
      }
      enablePresetMutation.mutate({ preset, listId });
    } else {
      disablePresetMutation.mutate({ preset });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-5 w-5 text-amber-500" />
        <h3 className="font-semibold">Smart Automations</h3>
      </div>

      <p className="text-sm text-muted-foreground">
        Turn on automations that help your team respond faster.
      </p>

      {loadingRules ? (
        <p className="text-sm text-muted-foreground">Loading automations...</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {AUTOMATION_PRESETS.map((preset) => {
            const rule = getPresetRule(preset.key);
            const active = !!rule?.enabled;
            const currentListId = selectedLists[preset.key];

            return (
              <div
                key={preset.key}
                className="p-3 space-y-2"
                data-testid={`preset-panel-${preset.key}`}
              >
                <div className="flex justify-between items-start gap-3">
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
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={active}
                      disabled={lists.length === 0 || (preset.key === "gaming_outage" && !currentListId)}
                      onCheckedChange={(checked) => handleToggle(preset, checked)}
                      data-testid={`switch-panel-${preset.key}`}
                    />
                    <span className="text-xs text-muted-foreground w-6">
                      {active ? "On" : "Off"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Notify:</span>
                  <Select
                    value={currentListId?.toString() || ""}
                    onValueChange={(val) => handleListChange(preset, Number(val))}
                  >
                    <SelectTrigger
                      className="h-7 w-40 text-xs"
                      data-testid={`select-panel-list-${preset.key}`}
                    >
                      <SelectValue placeholder="Select a list..." />
                    </SelectTrigger>
                    <SelectContent>
                      {lists.map((list) => (
                        <SelectItem key={list.id} value={list.id.toString()}>
                          {list.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {preset.key === "gaming_outage" && !currentListId && (
                  <p className="text-xs text-amber-600">
                    Select a list before turning this automation on.
                  </p>
                )}

                {preset.key === "sales_drop_warning" && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Warn if sales drop more than</span>
                    <Input
                      type="number"
                      min={5}
                      max={100}
                      step={1}
                      value={salesDropThreshold}
                      onChange={(e) => setSalesDropThreshold(Number(e.target.value || 0))}
                      className="h-7 w-16 text-xs"
                      data-testid="input-panel-sales-threshold"
                    />
                    <span className="text-muted-foreground">% vs last week</span>
                    {rule && (
                      <button
                        type="button"
                        className="text-xs text-emerald-600 hover:underline ml-1"
                        onClick={() => {
                          const listId = selectedLists[preset.key];
                          if (listId) enablePresetMutation.mutate({ preset, listId });
                        }}
                      >
                        Save
                      </button>
                    )}
                  </div>
                )}
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
        data-testid="button-panel-toggle-advanced"
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
            Custom rules created here are for advanced scenarios.
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
                  data-testid={`panel-rule-${rule.id}`}
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
                      data-testid={`button-panel-delete-rule-${rule.id}`}
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
  );
}
