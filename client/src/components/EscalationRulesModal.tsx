import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Zap } from "lucide-react";
import type { EscalationRule, NotificationList } from "@shared/schema";

interface EscalationRulesModalProps {
  clubId: string;
  onClose: () => void;
  onRulesChanged?: () => void;
}

interface RuleWithTargets extends EscalationRule {
  targetListIds?: number[];
}

export default function EscalationRulesModal({
  clubId,
  onClose,
  onRulesChanged,
}: EscalationRulesModalProps) {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [newRule, setNewRule] = useState({
    name: "",
    triggerType: "reason" as "reason" | "metric" | "flag",
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

  const createRuleMutation = useMutation({
    mutationFn: async (data: typeof newRule) => {
      return apiRequest("POST", "/api/escalation-rules", { ...data, clubId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escalation-rules", clubId] });
      toast({ title: "Rule created", description: "Escalation rule has been created." });
      setIsCreating(false);
      setNewRule({
        name: "",
        triggerType: "reason",
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

  const toggleAutoSendMutation = useMutation({
    mutationFn: async ({ ruleId, autoSend }: { ruleId: number; autoSend: boolean }) => {
      return apiRequest("PATCH", `/api/escalation-rules/${ruleId}`, { autoSend });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/escalation-rules", clubId] });
      onRulesChanged?.();
    },
  });

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
      <div className="bg-background rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold">Escalation Rules</h2>
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
            Escalation rules automatically notify specific lists when conditions are met.
          </p>

          {rulesLoading ? (
            <p className="text-sm text-muted-foreground">Loading rules...</p>
          ) : rules && rules.length > 0 ? (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="border rounded-lg p-3 space-y-2"
                  data-testid={`rule-item-${rule.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{rule.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {getTriggerDescription(rule)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={rule.autoSend}
                          onCheckedChange={(checked) =>
                            toggleAutoSendMutation.mutate({ ruleId: rule.id, autoSend: checked })
                          }
                          data-testid={`switch-autosend-${rule.id}`}
                        />
                        <span className="text-xs text-muted-foreground">Auto</span>
                      </div>
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
                  {rule.autoSend && (
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                      Sends automatically when triggered
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No escalation rules configured yet.</p>
          )}

          {/* Create New Rule */}
          {isCreating ? (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
              <h3 className="font-medium text-sm">New Escalation Rule</h3>

              <div className="space-y-2">
                <Label htmlFor="rule-name">Rule Name</Label>
                <Input
                  id="rule-name"
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                  placeholder="e.g., Maintenance → Facilities Team"
                  data-testid="input-rule-name"
                />
              </div>

              <div className="space-y-2">
                <Label>Trigger Type</Label>
                <div className="inline-flex rounded-md border border-input" role="group">
                  {(["reason", "metric", "flag"] as const).map((type, idx) => {
                    const isActive = newRule.triggerType === type;
                    const baseClasses = "px-3 py-1.5 text-sm font-medium transition-colors";
                    const activeClasses = isActive
                      ? "bg-emerald-600 text-white"
                      : "bg-background text-foreground hover:bg-muted";
                    const borderClasses = idx > 0 ? "border-l border-input" : "";
                    const roundedClasses = idx === 0 ? "rounded-l-md" : idx === 2 ? "rounded-r-md" : "";
                    return (
                      <button
                        key={type}
                        type="button"
                        className={`${baseClasses} ${activeClasses} ${borderClasses} ${roundedClasses}`}
                        onClick={() => setNewRule({ ...newRule, triggerType: type })}
                        data-testid={`button-trigger-${type}`}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {newRule.triggerType === "reason" && (
                <div className="space-y-2">
                  <Label>When reason is</Label>
                  <select
                    value={newRule.triggerReason}
                    onChange={(e) => setNewRule({ ...newRule, triggerReason: e.target.value })}
                    className="w-full p-2 border rounded-md bg-background"
                    data-testid="select-trigger-reason"
                  >
                    <option value="maintenance">Maintenance</option>
                    <option value="behavior">Behavior</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              )}

              {newRule.triggerType === "metric" && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Metric</Label>
                    <select
                      value={newRule.metricKey}
                      onChange={(e) => setNewRule({ ...newRule, metricKey: e.target.value })}
                      className="w-full p-2 border rounded-md bg-background text-sm"
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
                      className="w-full p-2 border rounded-md bg-background text-sm"
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
                      data-testid="input-metric-value"
                    />
                  </div>
                </div>
              )}

              {newRule.triggerType === "flag" && (
                <div className="space-y-2">
                  <Label>When flag is set</Label>
                  <select
                    value={newRule.flagKey}
                    onChange={(e) => setNewRule({ ...newRule, flagKey: e.target.value })}
                    className="w-full p-2 border rounded-md bg-background"
                    data-testid="select-flag-key"
                  >
                    <option value="gaming_outage">Gaming Outage</option>
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Notify Lists</Label>
                <select
                  multiple
                  value={newRule.targetListIds.map(String)}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
                    setNewRule({ ...newRule, targetListIds: values });
                  }}
                  className="w-full min-h-[80px] p-2 border rounded-md bg-background"
                  data-testid="select-target-lists"
                >
                  {lists?.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name} ({list.recipientCount} recipients)
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Hold Ctrl (Cmd on Mac) to select multiple.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={newRule.autoSend}
                  onCheckedChange={(checked) => setNewRule({ ...newRule, autoSend: checked })}
                  data-testid="switch-new-autosend"
                />
                <Label className="text-sm">Auto-send when triggered</Label>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  className="w-full inline-flex items-center justify-center px-3 py-2 text-sm font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => createRuleMutation.mutate(newRule)}
                  disabled={!newRule.name || newRule.targetListIds.length === 0}
                  data-testid="button-save-rule"
                >
                  Save rule
                </button>
                <button
                  type="button"
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setIsCreating(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreating(true)}
              className="w-full"
              data-testid="button-add-rule"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Escalation Rule
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
