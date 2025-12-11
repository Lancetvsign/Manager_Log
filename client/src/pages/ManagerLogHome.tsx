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
import RunningMaintenanceList from "@/components/RunningMaintenanceList";
import ThemeToggle from "@/components/ThemeToggle";
import { History, Plus, BarChart3, Wrench } from "lucide-react";
import logoImageDark from "@assets/download_1758015677430-BXYXiYbN_(1)_1764694504617.png";
import logoImageLight from "@assets/Restaurant_Manager's_Log_Daily_operations_tracking_with_weathe_1764696079981.png";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useManagerLog, buildApiUrl } from "@/contexts/ManagerLogContext";

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
  const { clubId, apiBaseUrl } = useManagerLog();
  
  // Track which tab is currently active
  const [activeTab, setActiveTab] = useState("new-entry");
  
  // Store log ID when navigating from Maintenance to History detail view
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  
  const queryClient = useQueryClient();

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
   * After saving, invalidate cache and switch to History tab
   */
  const handleSubmitLog = (logData: any) => {
    console.log('New log entry saved:', logData);
    
    // Invalidate and refetch logs to show the new entry (with clubId in key)
    queryClient.invalidateQueries({ queryKey: ['/api/manager-logs', clubId] });
    
    // Also invalidate maintenance items since a new log might have maintenance
    queryClient.invalidateQueries({ queryKey: ['/api/maintenance-items'] });
    
    // Invalidate metrics to keep Insights page up to date
    queryClient.invalidateQueries({ queryKey: ['/api/metrics'] });
    
    // Switch to history tab to show the saved entry
    setActiveTab("history");
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header - App title and theme toggle with white background */}
      <header className="border-b bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
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
            <ThemeToggle />
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
          {/* Tab Navigation - 4 tabs: Today's Log, Maintenance, Insights, History */}
          <TabsList className="grid w-full grid-cols-4" data-testid="tabs-navigation">
            <TabsTrigger value="new-entry" className="flex items-center space-x-2" data-testid="tab-new-entry">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Today's Log</span>
              <span className="sm:hidden">Today</span>
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="flex items-center space-x-2" data-testid="tab-maintenance">
              <Wrench className="h-4 w-4" />
              <span className="hidden sm:inline">Maintenance</span>
              <span className="sm:hidden">Maint.</span>
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

          {/* Maintenance Tab - Running maintenance list */}
          <TabsContent value="maintenance" className="space-y-6">
            <RunningMaintenanceList showCompleted={true} />
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
    </div>
  );
}
