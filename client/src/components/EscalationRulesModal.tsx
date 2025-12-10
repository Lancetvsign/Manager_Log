import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Zap, Settings, ChevronDown, ChevronUp } from "lucide-react";
import type { EscalationRule, NotificationList } from "@shared/schema";

// Preset automation definitions
const AUTOMATION_PRESETS = [
  {
    id: "maintenance_auto",
    name: "Maintenance Alerts",
    description: "Auto-notify when maintenance issues are reported",
    type: "preset" as const,
    trigger: { type: "reason", reason: "maintenance" },
    defaultListName: "Maintenance",
    autoSend: true,
  },
  {
    id: "behavior_auto",
    name: "Behavior Incidents",
    description: "Auto-notify when behavior issues are reported",
    type: "preset" as const,
    trigger: { type: "reason", reason: "behavior" },
    defaultListName: "Core Team",
    autoSend: true,
  },
  {
    id: "other_auto",
    name: "Other Escalations",
    description: "Auto-notify for other urgent matters",
    type: "preset" as const,
    trigger: { type: "reason", reason: "other" },
    defaultListName: "Core Team",
    autoSend: false,
  },
];

interface EscalationRulesModalProps {
  clubId: string;
  onClose: () => void;
  onRulesChanged?: () => void;
}

interface RuleWithTargets extends EscalationRule {
  targetListIds?: number[];
  targetLists?: string[];
}

export default function EscalationRulesModal({
  clubId,
  onClose,
  onRulesChanged,
}: EscalationRulesModalProps) {
  const { toast } = useToast();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newRule, setNewRule] = useState({
    name: "",
    triggerType: "metric" as "reason" | "metric" | "flag",
    triggerReason: "maintenance",
    metricKey: "sales_drop_pct",
    metricOperator: "gt",
    metricValue: "20",
    flagKey: "gaming_outage",
    autoSend: false,
    targetListIds: [] as number[],
  });

  const { data: rules, isLoading: rulesLoading } = useQuery<RuleWithTargets[]>({
    queryKey: ["/api/escalation-rules", clubId],
  });

  const { data: lists } = useQuery<(NotificationList & { recipientCount: number })[]>({
    queryKey: ["/api/notifications/lists", clubId],
  });

  // Find which presets are currently active (have matching rules)
  const getPresetRule = (presetId: string) => {
    const preset = AUTOMATION_PRESETS.find((p) => p.id === presetId);
    if (!preset || !rules) return null;
    return rules.find(
      (r) =>
        r.triggerType === preset.trigger.type &&
        r.triggerReason === preset.trigger.reason
    );
  };

  const togglePresetMutation = useMutation({
    mutationFn: async ({ presetId, enable }: { presetId: string; enable: boolean }) => {
      const preset = AUTOMATION_PRESETS.find((p) => p.id === presetId);
      if (!preset) throw new Error("Preset not found");

      const existingRule = getPresetRule(presetId);

      if (enable && !existingRule) {
        // Require notification lists to be loaded
        if (!lists || lists.length === 0) {
          throw new Error("No notification lists available. Please create a list first.");
        }
        // Create the rule
        const targetList = lists.find((l) => l.name === preset.defaultListName);
        const targetListIds = targetList ? [targetList.id] : [lists[0].id];
        
        return apiRequest("POST", "/api/escalation-rules", {
          clubId,
          name: preset.name,
          triggerType: preset.trigger.type,
          triggerReason: preset.trigger.reason,
          autoSend: preset.autoSend,
          targetListIds,
        });
      } else if (!enable && existingRule) {
        // Disable the rule
        return apiRequest("PATCH", `/api/escalation-rules/${existingRule.id}`, { enabled: false });
      } else if (enable && existingRule) {
        // Re-enable the rule
        return apiRequest("PATCH", `/api/escalation-rules/${existingRule.id}`, { enabled: true });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escalation-rules", clubId] });
      onRulesChanged?.();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update automation.", variant: "destructive" });
    },
  });

  const createRuleMutation = useMutation({
    mutationFn: async (data: typeof newRule) => {
      return apiRequest("POST", "/api/escalation-rules", { ...data, clubId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escalation-rules", clubId] });
      toast({ title: "Rule created", description: "Custom automation rule has been created." });
      setIsCreating(false);
      setNewRule({
        name: "",
        triggerType: "metric",
        triggerReason: "maintenance",
        metricKey: "sales_drop_pct",
        metricOperator: "gt",
        metricValue: "20",
        flagKey: "gaming_outage",
        autoSend: false,
        targetListIds: [],
      });
      onRulesChanged?.();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create rule.", variant: "destructive" });
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

  // Get custom rules (not matching presets)
  const customRules = rules?.filter((rule) => {
    if (rule.triggerType !== "reason") return true;
    const matchingPreset = AUTOMATION_PRESETS.find(
      (p) => p.trigger.type === rule.triggerType && p.trigger.reason === rule.triggerReason
    );
    return !matchingPreset;
  }) || [];

  const getTriggerDescription = (rule: RuleWithTargets) => {
    switch (rule.triggerType) {
      case "reason":
        return `When reason = "${rule.triggerReason}"`;
      case "metric":
        return `When ${rule.metricKey} ${rule.metricOperator} ${rule.metricValue}%`;
      case "flag":
        return `When ${rule.flagKey} is set`;
      default:
        return "Unknown trigger";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-xl shadow-xl max-w-xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold">Automations</h2>
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
            Enable recommended automations to notify teams when specific conditions are met.
          </p>

          {/* Preset Automations */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Recommended Automations</h3>
            <div className="border rounded-lg divide-y">
              {AUTOMATION_PRESETS.map((preset) => {
                const existingRule = getPresetRule(preset.id);
                const isEnabled = existingRule?.enabled ?? false;

                return (
                  <div
                    key={preset.id}
                    className="flex items-center justify-between p-3"
                    data-testid={`preset-${preset.id}`}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-sm">{preset.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {preset.description}
                      </div>
                      {existingRule && isEnabled && (
                        <div className="text-xs text-emerald-600 mt-1">
                          → {existingRule.targetLists?.join(", ") || "No list assigned"}
                        </div>
                      )}
                    </div>
                    <Switch
                      checked={isEnabled}
                      disabled={!lists || lists.length === 0}
                      onCheckedChange={(checked) =>
                        togglePresetMutation.mutate({ presetId: preset.id, enable: checked })
                      }
                      data-testid={`switch-preset-${preset.id}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Advanced Automation Button */}
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

          {/* Advanced Section */}
          {showAdvanced && (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
              <p className="text-xs text-muted-foreground">
                Create custom rules based on metrics or flags for advanced automation scenarios.
              </p>

              {/* Custom Rules List */}
              {customRules.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase">Custom Rules</h4>
                  <div className="space-y-2">
                    {customRules.map((rule) => (
                      <div
                        key={rule.id}
                        className="flex items-center justify-between p-2 border rounded bg-background"
                        data-testid={`rule-${rule.id}`}
                      >
                        <div>
                          <div className="text-sm font-medium">{rule.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {getTriggerDescription(rule)}
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
                </div>
              )}

              {/* Create New Custom Rule */}
              {isCreating ? (
                <div className="space-y-3 pt-2 border-t">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase">New Custom Rule</h4>

                  <div className="space-y-2">
                    <Label htmlFor="rule-name" className="text-xs">Rule Name</Label>
                    <Input
                      id="rule-name"
                      value={newRule.name}
                      onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                      placeholder="e.g., Sales Drop Alert"
                      className="h-8 text-sm"
                      data-testid="input-rule-name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Trigger Type</Label>
                    <div className="inline-flex" role="group">
                      {(["metric", "flag"] as const).map((type) => (
                        <Button
                          key={type}
                          type="button"
                          variant={newRule.triggerType === type ? "success" : "outline-secondary"}
                          size="sm"
                          className={type === "metric" ? "rounded-r-none" : "rounded-l-none"}
                          onClick={() => setNewRule({ ...newRule, triggerType: type })}
                          data-testid={`button-trigger-${type}`}
                        >
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {newRule.triggerType === "metric" && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Metric</Label>
                        <select
                          value={newRule.metricKey}
                          onChange={(e) => setNewRule({ ...newRule, metricKey: e.target.value })}
                          className="w-full p-1.5 border rounded-md bg-background text-sm"
                          data-testid="select-metric-key"
                        >
                          <option value="sales_drop_pct">Sales Drop %</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Operator</Label>
                        <select
                          value={newRule.metricOperator}
                          onChange={(e) => setNewRule({ ...newRule, metricOperator: e.target.value })}
                          className="w-full p-1.5 border rounded-md bg-background text-sm"
                          data-testid="select-metric-operator"
                        >
                          <option value="gt">&gt;</option>
                          <option value="gte">&gt;=</option>
                          <option value="lt">&lt;</option>
                          <option value="lte">&lt;=</option>
                          <option value="eq">=</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Value (%)</Label>
                        <Input
                          type="number"
                          value={newRule.metricValue}
                          onChange={(e) => setNewRule({ ...newRule, metricValue: e.target.value })}
                          className="h-8 text-sm"
                          data-testid="input-metric-value"
                        />
                      </div>
                    </div>
                  )}

                  {newRule.triggerType === "flag" && (
                    <div className="space-y-1">
                      <Label className="text-xs">When flag is set</Label>
                      <select
                        value={newRule.flagKey}
                        onChange={(e) => setNewRule({ ...newRule, flagKey: e.target.value })}
                        className="w-full p-1.5 border rounded-md bg-background text-sm"
                        data-testid="select-flag-key"
                      >
                        <option value="gaming_outage">Gaming Outage</option>
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label className="text-xs">Notify Lists</Label>
                    <select
                      multiple
                      value={newRule.targetListIds.map(String)}
                      onChange={(e) => {
                        const values = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
                        setNewRule({ ...newRule, targetListIds: values });
                      }}
                      className="w-full min-h-[60px] p-1.5 border rounded-md bg-background text-sm"
                      data-testid="select-target-lists"
                    >
                      {lists?.map((list) => (
                        <option key={list.id} value={list.id}>
                          {list.name} ({list.recipientCount})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={newRule.autoSend}
                      onCheckedChange={(checked) => setNewRule({ ...newRule, autoSend: checked })}
                      data-testid="switch-new-autosend"
                    />
                    <Label className="text-xs">Auto-send when triggered</Label>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="success"
                      size="sm"
                      className="flex-1"
                      onClick={() => createRuleMutation.mutate(newRule)}
                      disabled={!newRule.name || newRule.targetListIds.length === 0}
                      data-testid="button-save-rule"
                    >
                      Save rule
                    </Button>
                    <Button
                      type="button"
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => setIsCreating(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => setIsCreating(true)}
                  className="w-full"
                  data-testid="button-add-custom-rule"
                >
                  + Add Custom Rule
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
