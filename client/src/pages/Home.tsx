import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ManagerLogForm from "@/components/ManagerLogForm";
import ManagerLogList from "@/components/ManagerLogList";
import ThemeToggle from "@/components/ThemeToggle";
import { FileText, History, Plus } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState("new-entry");
  const queryClient = useQueryClient();

  // Fetch logs count for tab display
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

  const handleSubmitLog = (logData: any) => {
    console.log('New log entry saved:', logData);
    
    // Invalidate and refetch logs
    queryClient.invalidateQueries({ queryKey: ['/api/manager-logs'] });
    
    // Switch to history tab to show the saved entry
    setActiveTab("history");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold" data-testid="text-app-title">
                  Restaurant Manager's Log
                </h1>
                <p className="text-sm text-muted-foreground">
                  Daily operations tracking with weather and sales data
                </p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2" data-testid="tabs-navigation">
            <TabsTrigger value="new-entry" className="flex items-center space-x-2">
              <Plus className="h-4 w-4" />
              <span>New Entry</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center space-x-2">
              <History className="h-4 w-4" />
              <span>Log History ({logs?.length || 0})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new-entry" className="space-y-6">
            <ManagerLogForm onSubmit={handleSubmitLog} />
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <ManagerLogList logs={[]} />
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