import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Mail, Send, Loader2, Settings, Users, Zap, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";

interface ContentSettings {
  includeHeader: boolean;
  includeWeather: boolean;
  includeSales: boolean;
  includeDrawing: boolean;
  includeOperationalNotes: boolean;
  includeMaintenanceNotes: boolean;
  includeMaintenanceList: boolean;
  includePhotos: boolean;
}

const PRESETS: Record<string, { label: string; settings: ContentSettings }> = {
  full: {
    label: "Full Log",
    settings: {
      includeHeader: true,
      includeWeather: true,
      includeSales: true,
      includeDrawing: true,
      includeOperationalNotes: true,
      includeMaintenanceNotes: true,
      includeMaintenanceList: true,
      includePhotos: true,
    },
  },
  ops_only: {
    label: "Ops Only",
    settings: {
      includeHeader: true,
      includeWeather: false,
      includeSales: false,
      includeDrawing: false,
      includeOperationalNotes: true,
      includeMaintenanceNotes: false,
      includeMaintenanceList: false,
      includePhotos: true,
    },
  },
  maintenance_only: {
    label: "Maintenance Only",
    settings: {
      includeHeader: true,
      includeWeather: false,
      includeSales: false,
      includeDrawing: false,
      includeOperationalNotes: false,
      includeMaintenanceNotes: true,
      includeMaintenanceList: true,
      includePhotos: true,
    },
  },
  sales_only: {
    label: "Sales Only",
    settings: {
      includeHeader: true,
      includeWeather: false,
      includeSales: true,
      includeDrawing: true,
      includeOperationalNotes: false,
      includeMaintenanceNotes: false,
      includeMaintenanceList: false,
      includePhotos: false,
    },
  },
};
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { NotificationSettingsPanel } from "./NotificationSettingsPanel";
import EscalationRulesPanel from "./EscalationRulesPanel";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useManagerLog, buildApiUrl } from "@/contexts/ManagerLogContext";
import type { NotificationList } from "@shared/schema";

interface EmailLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string;
  logId: number | null;
  logDateISO: string;
  managerName?: string;
}

export default function EmailLogModal({
  open,
  onOpenChange,
  clubId,
  logId,
  logDateISO,
  managerName,
}: EmailLogModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { apiBaseUrl } = useManagerLog();
  const [selectedListIds, setSelectedListIds] = useState<number[]>([]);
  const [reason, setReason] = useState<"maintenance" | "operations" | "other">("maintenance");
  const [settingsTab, setSettingsTab] = useState<"contacts" | "rules">("contacts");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contentOpen, setContentOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>("full");
  const [contentSettings, setContentSettings] = useState<ContentSettings>(PRESETS.full.settings);

  const niceDate = useMemo(() => {
    try {
      return format(new Date(logDateISO), "MMMM d, yyyy");
    } catch {
      return logDateISO;
    }
  }, [logDateISO]);

  const defaultSubject = useMemo(() => {
    const label =
      reason === "maintenance" ? "Urgent maintenance" :
      reason === "operations" ? "Operational issue" :
      "Urgent item";
    return `[Club] ${niceDate} - ${label}`;
  }, [niceDate, reason]);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const { data: lists = [], isLoading: loadingLists } = useQuery<(NotificationList & { recipientCount: number })[]>({
    queryKey: ["/api/notifications/lists", clubId],
    queryFn: async () => {
      const url = buildApiUrl("/api/notifications/lists", clubId, apiBaseUrl);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch notification lists");
      return res.json();
    },
    enabled: open,
  });

  const { data: emailStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/notifications/status"],
    queryFn: async () => {
      const res = await fetch(`${apiBaseUrl}/api/notifications/status`);
      if (!res.ok) return { configured: false };
      return res.json();
    },
    enabled: open,
  });

  const isSmtpConfigured = emailStatus?.configured ?? false;

  useEffect(() => {
    if (open && lists.length > 0 && selectedListIds.length === 0) {
      const coreTeam = lists.find((l) => l.name.toLowerCase().includes("core"));
      if (coreTeam) {
        setSelectedListIds([coreTeam.id]);
      }
    }
  }, [open, lists, selectedListIds.length]);

  useEffect(() => {
    if (!open) return;

    setSubject(defaultSubject);
    setMessage(
`Date: ${logDateISO}
Manager: ${managerName || "Not specified"}

Summary:
- (type here)

Details:
- (optional)

A link to this log entry will be included automatically.`
    );
  }, [open, defaultSubject, logDateISO, managerName]);

  useEffect(() => {
    setSubject(defaultSubject);
  }, [reason, defaultSubject]);

  const canEmail = !!logId;

  const toggleList = (id: number) => {
    setSelectedListIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const applyPreset = (presetKey: string) => {
    setSelectedPreset(presetKey);
    setContentSettings(PRESETS[presetKey].settings);
  };

  const toggleContentSetting = (key: keyof ContentSettings) => {
    setContentSettings((prev) => ({ ...prev, [key]: !prev[key] }));
    setSelectedPreset("custom");
  };

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      if (!logId) throw new Error("Save the log entry first to enable emailing.");
      if (selectedListIds.length === 0) throw new Error("Pick at least one notification list.");

      const url = `${apiBaseUrl}/api/logs/${logId}/notify`;
      return apiRequest("POST", url, {
        clubId,
        reason,
        subject,
        message,
        listIds: selectedListIds,
        contentSettings,
      });
    },
    onSuccess: () => {
      toast({
        title: "Email sent",
        description: "Notification sent successfully.",
      });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err?.message || "Failed to send email.",
        variant: "destructive",
      });
    },
  });

  async function handleSend(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();

    if (!canEmail || !logId) {
      toast({
        title: "Cannot send",
        description: "Save the log entry first to enable emailing.",
        variant: "destructive",
      });
      return;
    }
    if (selectedListIds.length === 0) {
      toast({
        title: "No recipients",
        description: "Pick at least one notification list.",
        variant: "destructive",
      });
      return;
    }

    sendEmailMutation.mutate();
  }

  const handleSettingsChanged = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/notifications/lists", clubId] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="modal-email-log">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email this log
          </DialogTitle>
          <DialogDescription>
            Send a notification email about this log entry to selected recipients.
          </DialogDescription>
        </DialogHeader>

        {!canEmail && (
          <div className="rounded-md bg-amber-100 dark:bg-amber-900/30 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            Save this log to enable emailing.
          </div>
        )}

        {!isSmtpConfigured && (
          <div className="rounded-md bg-blue-100 dark:bg-blue-900/30 px-3 py-2 text-sm text-blue-800 dark:text-blue-200" data-testid="smtp-warning">
            <strong>Simulation mode:</strong> Email server not configured. Emails will be logged but not sent until SMTP is set up.
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <RadioGroup
              value={reason}
              onValueChange={(val) => setReason(val as typeof reason)}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="maintenance" id="reason-maintenance" data-testid="radio-maintenance" />
                <Label htmlFor="reason-maintenance" className="cursor-pointer">Maintenance</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="operations" id="reason-operations" data-testid="radio-operations" />
                <Label htmlFor="reason-operations" className="cursor-pointer">Operations</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="other" id="reason-other" data-testid="radio-other" />
                <Label htmlFor="reason-other" className="cursor-pointer">Other</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Send to</Label>
            <div className="rounded-md border p-3">
              {loadingLists ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading lists...
                </div>
              ) : lists.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No lists yet. Add lists in Settings below.
                </div>
              ) : (
                <div className="space-y-2">
                  {lists.map((list) => (
                    <div
                      key={list.id}
                      className="flex items-center justify-between gap-3"
                      data-testid={`list-checkbox-${list.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`list-${list.id}`}
                          checked={selectedListIds.includes(list.id)}
                          onCheckedChange={() => toggleList(list.id)}
                        />
                        <Label htmlFor={`list-${list.id}`} className="cursor-pointer text-sm">
                          {list.name}
                        </Label>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {list.recipientCount} recipient{list.recipientCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              data-testid="input-email-subject"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-message">Message</Label>
            <Textarea
              id="email-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[140px]"
              data-testid="textarea-email-message"
            />
            <p className="text-xs text-muted-foreground">
              A link to this log entry will be included automatically.
            </p>
          </div>

          <Collapsible open={contentOpen} onOpenChange={setContentOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between"
                type="button"
                data-testid="button-toggle-content"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Email Content
                  <span className="text-xs text-muted-foreground ml-1">
                    ({selectedPreset === "custom" ? "Custom" : PRESETS[selectedPreset]?.label || "Full Log"})
                  </span>
                </div>
                {contentOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Quick Presets</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(PRESETS).map(([key, preset]) => (
                    <Button
                      key={key}
                      type="button"
                      variant={selectedPreset === key ? "default" : "outline"}
                      size="sm"
                      onClick={() => applyPreset(key)}
                      data-testid={`preset-${key}`}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Include Sections</Label>
                <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="content-header"
                      checked={contentSettings.includeHeader}
                      onCheckedChange={() => toggleContentSetting("includeHeader")}
                      data-testid="checkbox-header"
                    />
                    <Label htmlFor="content-header" className="cursor-pointer text-sm">Date & Manager</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="content-weather"
                      checked={contentSettings.includeWeather}
                      onCheckedChange={() => toggleContentSetting("includeWeather")}
                      data-testid="checkbox-weather"
                    />
                    <Label htmlFor="content-weather" className="cursor-pointer text-sm">Weather</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="content-sales"
                      checked={contentSettings.includeSales}
                      onCheckedChange={() => toggleContentSetting("includeSales")}
                      data-testid="checkbox-sales"
                    />
                    <Label htmlFor="content-sales" className="cursor-pointer text-sm">Sales</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="content-drawing"
                      checked={contentSettings.includeDrawing}
                      onCheckedChange={() => toggleContentSetting("includeDrawing")}
                      data-testid="checkbox-drawing"
                    />
                    <Label htmlFor="content-drawing" className="cursor-pointer text-sm">Drawing</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="content-ops-notes"
                      checked={contentSettings.includeOperationalNotes}
                      onCheckedChange={() => toggleContentSetting("includeOperationalNotes")}
                      data-testid="checkbox-ops-notes"
                    />
                    <Label htmlFor="content-ops-notes" className="cursor-pointer text-sm">Ops Notes</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="content-maint-notes"
                      checked={contentSettings.includeMaintenanceNotes}
                      onCheckedChange={() => toggleContentSetting("includeMaintenanceNotes")}
                      data-testid="checkbox-maint-notes"
                    />
                    <Label htmlFor="content-maint-notes" className="cursor-pointer text-sm">Maint Notes</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="content-maint-list"
                      checked={contentSettings.includeMaintenanceList}
                      onCheckedChange={() => toggleContentSetting("includeMaintenanceList")}
                      data-testid="checkbox-maint-list"
                    />
                    <Label htmlFor="content-maint-list" className="cursor-pointer text-sm">Maint List</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="content-photos"
                      checked={contentSettings.includePhotos}
                      onCheckedChange={() => toggleContentSetting("includePhotos")}
                      data-testid="checkbox-photos"
                    />
                    <Label htmlFor="content-photos" className="cursor-pointer text-sm">Photos</Label>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between"
                type="button"
                data-testid="button-toggle-settings"
              >
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Settings
                </div>
                <span className="text-xs text-muted-foreground">
                  {settingsOpen ? "Hide" : "Show"}
                </span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={settingsTab === "contacts" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSettingsTab("contacts")}
                  data-testid="button-settings-contacts"
                >
                  <Users className="h-4 w-4 mr-1" />
                  Manage Contacts
                </Button>
                <Button
                  type="button"
                  variant={settingsTab === "rules" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSettingsTab("rules")}
                  data-testid="button-settings-rules"
                >
                  <Zap className="h-4 w-4 mr-1" />
                  Rules
                </Button>
              </div>

              <div className="rounded-md border p-4">
                {settingsTab === "contacts" ? (
                  <NotificationSettingsPanel
                    clubId={clubId}
                    onChanged={handleSettingsChanged}
                  />
                ) : (
                  <EscalationRulesPanel
                    clubId={clubId}
                    onRulesChanged={handleSettingsChanged}
                  />
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-email"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!canEmail || sendEmailMutation.isPending}
              onClick={handleSend}
              data-testid="button-send-email"
            >
              {sendEmailMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
