/**
 * HOME PAGE - MAIN APPLICATION SHELL
 * ===================================
 * The primary page of the Restaurant Manager's Log application.
 * Contains tabbed navigation between three main sections:
 * 
 * 1. Today's Log - Form for creating/editing daily log entries
 * 2. Log History - View and filter past log entries
 * 3. Insights - Analytics and metrics dashboard with sales trends
 * 
 * Data Flow:
 * - Fetches log count for tab badge display
 * - Passes callbacks to child components for cross-tab navigation
 * - Manages active tab state for navigation
 */

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ManagerLogForm from "@/components/ManagerLogForm";
import ManagerLogList from "@/components/ManagerLogList";
import InsightsPage from "@/components/InsightsPage";
import ThemeToggle from "@/components/ThemeToggle";
import { History, Plus, BarChart3, User, Settings, MapPin, Loader2, ChevronLeft } from "lucide-react";
import logoImageDark from "@assets/download_1758015677430-BXYXiYbN_(1)_1764694504617.png";
import logoImageLight from "@assets/Restaurant_Manager's_Log_Daily_operations_tracking_with_weathe_1764696079981.png";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useManagerLog, buildApiUrl } from "@/contexts/ManagerLogContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface LogEntry {
  id: string;
  date: string;
  dayOfWeek: string;
  managerName: string;
  foodSales: string;
  barSales: string;
  gamingSales: string;
  lastYearFoodSales?: string;
  lastYearBarSales?: string;
  lastYearGamingSales?: string;
  currentWeather: any;
  historicalWeather: any;
  dailyNotes: string;
}

export default function Home() {
  const { clubId, clubName, managerName, membershipNumber, userRole, apiBaseUrl, returnUrl } = useManagerLog();
  const { toast } = useToast();
  
  // Track which tab is currently active
  const [activeTab, setActiveTab] = useState("new-entry");
  
  // Store log ID when navigating from Maintenance to History detail view
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);

  // Settings dialog state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [zipInput, setZipInput] = useState("");
  
  const queryClient = useQueryClient();

  // Fetch current club settings — drives both the gate and the settings dialog
  const { data: clubSettings, isLoading: isSettingsLoading } = useQuery<{ weatherZipCode: string | null }>({
    queryKey: ['/api/club-settings', clubId],
    queryFn: async () => {
      const url = buildApiUrl('/api/club-settings', clubId, apiBaseUrl);
      const res = await fetch(url);
      if (!res.ok) return { weatherZipCode: null };
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const zipIsConfigured = !isSettingsLoading && !!clubSettings?.weatherZipCode?.trim();

  // When settings dialog opens, seed input from saved value
  const handleOpenSettings = () => {
    setZipInput(clubSettings?.weatherZipCode ?? "");
    setSettingsOpen(true);
  };

  const saveZipMutation = useMutation({
    mutationFn: async (zip: string | null) => {
      const url = buildApiUrl('/api/club-settings', clubId, apiBaseUrl);
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weatherZipCode: zip || null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/club-settings', clubId] });
      setSettingsOpen(false);
      toast({ title: "Settings saved", description: "Weather zip code updated." });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not save settings.", variant: "destructive" });
    },
  });

  /**
   * Fetch all logs to display count in the History tab badge
   * Uses clubId from context for proper multi-tenant isolation
   */
  const { data: logs } = useQuery<LogEntry[]>({
    queryKey: ['/api/manager-logs', clubId],
    queryFn: async () => {
      const url = buildApiUrl('/api/manager-logs', clubId, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  /**
   * Handle log submission from the New Entry form
   * After saving, invalidate cache so Log History stays up to date
   */
  const handleSubmitLog = (logData: any) => {
    queryClient.invalidateQueries({ queryKey: ['/api/manager-logs', clubId] });
    queryClient.invalidateQueries({ queryKey: ['/api/maintenance-items'] });
    queryClient.invalidateQueries({ queryKey: ['/api/metrics'] });
  };

  /**
   * Handle "View Log" click from Maintenance Overview
   * Navigates to History tab and opens the detail view for that log
   */
  const handleViewLogFromMaintenance = (logId: number, logDate: string) => {
    // Store the log ID to pass to ManagerLogList
    setSelectedLogId(logId);
    // Switch to history tab
    setActiveTab("history");
  };

  // --- Zip gate: show spinner while loading, setup screen if not configured ---
  if (isSettingsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!zipIsConfigured) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center space-y-3">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-4">
                <MapPin className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle>Set Your Weather Location</CardTitle>
            <CardDescription>
              A zip or postal code is required before you can use the app. This is used to fetch accurate weather data for your logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="setup-zip">Zip / Postal Code</Label>
              <Input
                id="setup-zip"
                placeholder="e.g. 80201 or M5H 2N2"
                value={zipInput}
                onChange={(e) => setZipInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && zipInput.trim()) {
                    saveZipMutation.mutate(zipInput.trim());
                  }
                }}
                data-testid="input-weather-zip"
                autoFocus
              />
            </div>
            <Button
              className="w-full"
              onClick={() => saveZipMutation.mutate(zipInput.trim())}
              disabled={saveZipMutation.isPending || !zipInput.trim()}
              data-testid="btn-save-zip"
            >
              {saveZipMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header - App title and theme toggle with white background */}
      <header className="border-b bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {returnUrl && (() => {
                let safeDest: string | null = null;
                try {
                  const parsed = new URL(returnUrl);
                  if (parsed.protocol === "https:" || parsed.protocol === "http:") {
                    safeDest = returnUrl;
                  }
                } catch {
                  safeDest = null;
                }
                return safeDest ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-muted-foreground"
                    onClick={() => { window.location.href = safeDest!; }}
                    data-testid="btn-back-to-scp"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back to SCP
                  </Button>
                ) : null;
              })()}
              <div className="flex items-center space-x-4">
                <img 
                  src={logoImageLight} 
                  alt="Social Club Pro Logo" 
                  className="h-10 w-auto block dark:hidden"
                  data-testid="img-logo-light"
                />
                <img 
                  src={logoImageDark} 
                  alt="Social Club Pro Logo" 
                  className="h-10 w-auto hidden dark:block"
                  data-testid="img-logo-dark"
                />
                <div>
                  <h1 className="text-lg font-semibold text-foreground" data-testid="text-app-title">
                    Restaurant Manager's Log
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Daily operations tracking with weather and sales data
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(managerName || clubName) && (
                <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground border-r pr-4 mr-2">
                  <User className="h-4 w-4" />
                  <div className="text-right">
                    {managerName && (
                      <p className="font-medium text-foreground" data-testid="text-user-name">
                        {managerName}
                      </p>
                    )}
                    {clubName && clubName !== "Development Mode" && (
                      <p className="text-xs" data-testid="text-club-name">
                        {clubName}
                      </p>
                    )}
                  </div>
                </div>
              )}
              <Button size="icon" variant="ghost" onClick={handleOpenSettings} data-testid="btn-settings">
                <Settings className="h-4 w-4" />
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Tabbed navigation */}
      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={(value) => {
          setActiveTab(value);
          // Clear selected log ID when switching away from history
          if (value !== "history") {
            setSelectedLogId(null);
          }
        }} className="space-y-6">
          {/* Tab Navigation - 3 tabs: Today's Log, Insights, History */}
          <TabsList className="grid w-full grid-cols-3" data-testid="tabs-navigation">
            <TabsTrigger value="new-entry" className="flex items-center space-x-2" data-testid="tab-new-entry">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Today's Log</span>
              <span className="sm:hidden">Today</span>
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center space-x-2" data-testid="tab-insights">
              <BarChart3 className="h-4 w-4" />
              <span>Insights</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center space-x-2" data-testid="tab-history">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Log History ({logs?.length || 0})</span>
              <span className="sm:hidden">History</span>
            </TabsTrigger>
          </TabsList>

          {/* Today's Log Tab - Daily log form */}
          <TabsContent value="new-entry" className="space-y-6">
            <ManagerLogForm onSubmit={handleSubmitLog} />
          </TabsContent>

          {/* History Tab - List of all log entries */}
          <TabsContent value="history" className="space-y-6">
            <ManagerLogList 
              logs={[]} 
              initialSelectedLogId={selectedLogId}
              onLogSelected={() => setSelectedLogId(null)}
            />
          </TabsContent>

          {/* Insights Tab - Analytics and metrics dashboard */}
          <TabsContent value="insights" className="space-y-6">
            <InsightsPage onViewLog={handleViewLogFromMaintenance} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/30 mt-16">
        <div className="container mx-auto px-4 py-6">
          <div className="text-center text-sm text-muted-foreground">
            <p>Restaurant Manager's Log System - Track daily operations efficiently</p>
          </div>
        </div>
      </footer>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Configure options for this club.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="weather-zip">Weather Location (Zip / Postal Code)</Label>
              <Input
                id="weather-zip"
                placeholder="e.g. 80201 or M5H 2N2"
                value={zipInput}
                onChange={(e) => setZipInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && zipInput.trim()) saveZipMutation.mutate(zipInput.trim()); }}
                data-testid="input-weather-zip"
              />
              <p className="text-xs text-muted-foreground">
                This zip or postal code is required. Clearing it will lock the app until a new one is entered.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setSettingsOpen(false)}
                disabled={saveZipMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => saveZipMutation.mutate(zipInput.trim() || null)}
                disabled={saveZipMutation.isPending || !zipInput.trim()}
                data-testid="btn-save-zip"
              >
                {saveZipMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
