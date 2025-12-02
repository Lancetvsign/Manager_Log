/**
 * HOME PAGE - MAIN APPLICATION SHELL
 * ===================================
 * The primary page of the Restaurant Manager's Log application.
 * Contains tabbed navigation between three main sections:
 * 
 * 1. New Entry (Today's Log) - Form for creating/editing daily log entries
 * 2. Log History - View and filter past log entries
 * 3. Maintenance - Overview of all maintenance items across all days
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
import MaintenanceOverview from "@/components/MaintenanceOverview";
import ThemeToggle from "@/components/ThemeToggle";
import { History, Plus, Wrench } from "lucide-react";
import logoImage from "@assets/download_1758015677430-BXYXiYbN_(1)_1764694504617.png";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
  // Track which tab is currently active
  const [activeTab, setActiveTab] = useState("new-entry");
  
  // Store log ID when navigating from Maintenance to History detail view
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  
  const queryClient = useQueryClient();

  /**
   * Fetch all logs to display count in the History tab badge
   */
  const { data: logs } = useQuery<LogEntry[]>({
    queryKey: ['/api/manager-logs'],
    queryFn: async () => {
      const response = await fetch('/api/manager-logs');
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
    
    // Invalidate and refetch logs to show the new entry
    queryClient.invalidateQueries({ queryKey: ['/api/manager-logs'] });
    
    // Also invalidate maintenance items since a new log might have maintenance
    queryClient.invalidateQueries({ queryKey: ['/api/maintenance-items'] });
    
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
      {/* Header - App title and theme toggle with dark teal background */}
      <header className="border-b bg-primary">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img 
                src={logoImage} 
                alt="Restaurant Logo" 
                className="h-10 w-auto"
                data-testid="img-logo"
              />
              <div>
                <h1 className="text-2xl font-bold text-primary-foreground" data-testid="text-app-title">
                  Restaurant Manager's Log
                </h1>
                <p className="text-sm text-primary-foreground/80">
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
          {/* Tab Navigation - 3 tabs: New Entry, History, Maintenance */}
          <TabsList className="grid w-full grid-cols-3" data-testid="tabs-navigation">
            <TabsTrigger value="new-entry" className="flex items-center space-x-2" data-testid="tab-new-entry">
              <Plus className="h-4 w-4" />
              <span>New Entry</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center space-x-2" data-testid="tab-history">
              <History className="h-4 w-4" />
              <span>Log History ({logs?.length || 0})</span>
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="flex items-center space-x-2" data-testid="tab-maintenance">
              <Wrench className="h-4 w-4" />
              <span>Maintenance</span>
            </TabsTrigger>
          </TabsList>

          {/* New Entry Tab - Daily log form */}
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

          {/* Maintenance Tab - Overview of all maintenance items */}
          <TabsContent value="maintenance" className="space-y-6">
            <MaintenanceOverview onViewLog={handleViewLogFromMaintenance} />
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
