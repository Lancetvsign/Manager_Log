import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search, Eye, Calendar, DollarSign, Loader2 } from "lucide-react";
import WeatherCard from "./WeatherCard";
import { useQuery } from "@tanstack/react-query";

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

interface ManagerLogListProps {
  logs: LogEntry[];
}


export default function ManagerLogList({ logs: propLogs }: ManagerLogListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  
  // Fetch logs from API
  const { data: apiLogs, isLoading, error } = useQuery<LogEntry[]>({
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
  
  // Use API logs if available, fallback to prop logs
  const logs = apiLogs && apiLogs.length > 0 ? apiLogs : (propLogs || []);

  const filteredLogs = logs.filter(log =>
    log.managerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.date.includes(searchTerm) ||
    log.dailyNotes.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const calculateTotal = (food: string, bar: string, gaming: string) => {
    return (parseFloat(food) || 0) + (parseFloat(bar) || 0) + (parseFloat(gaming) || 0);
  };

  if (selectedLog) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Log Entry Details</h2>
          <Button 
            variant="outline" 
            onClick={() => setSelectedLog(null)}
            data-testid="button-back"
          >
            Back to List
          </Button>
        </div>

        {/* Header Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{selectedLog.date} - {selectedLog.dayOfWeek}</span>
              <Badge variant="secondary">{selectedLog.managerName}</Badge>
            </CardTitle>
          </CardHeader>
        </Card>

        {/* Weather Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <WeatherCard
            title="Weather on This Day"
            weather={selectedLog.currentWeather}
            isHistorical={false}
          />
          <WeatherCard
            title="Weather 1 Year Prior"
            weather={selectedLog.historicalWeather}
            isHistorical={true}
          />
        </div>

        {/* Sales Data */}
        <Card>
          <CardHeader>
            <CardTitle>Sales Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium">Food Sales</h4>
                <p className="text-2xl font-bold">${selectedLog.foodSales}</p>
                {selectedLog.lastYearFoodSales && (
                  <p className="text-sm text-muted-foreground">
                    Last year: ${selectedLog.lastYearFoodSales}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Bar Sales</h4>
                <p className="text-2xl font-bold">${selectedLog.barSales}</p>
                {selectedLog.lastYearBarSales && (
                  <p className="text-sm text-muted-foreground">
                    Last year: ${selectedLog.lastYearBarSales}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Gaming Sales</h4>
                <p className="text-2xl font-bold">${selectedLog.gamingSales}</p>
                {selectedLog.lastYearGamingSales && (
                  <p className="text-sm text-muted-foreground">
                    Last year: ${selectedLog.lastYearGamingSales}
                  </p>
                )}
              </div>
            </div>
            <div className="border-t pt-4 mt-4">
              <div className="flex justify-between items-center">
                <span className="font-medium">Total Sales:</span>
                <span className="text-xl font-bold">
                  ${calculateTotal(selectedLog.foodSales, selectedLog.barSales, selectedLog.gamingSales).toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Daily Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{selectedLog.dailyNotes}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Manager Log History</h2>
        <div className="flex items-center space-x-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
            data-testid="input-search"
          />
        </div>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="text-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground">Loading log entries...</p>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-muted-foreground">Failed to load log entries. Please try again.</p>
            </CardContent>
          </Card>
        ) : filteredLogs.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-muted-foreground">
                {searchTerm ? 'No log entries match your search.' : 'No log entries found. Create your first entry!'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredLogs.map((log) => (
            <Card key={log.id} className="hover-elevate" data-testid={`card-log-${log.id}`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{log.date}</span>
                      <Badge variant="outline">{log.dayOfWeek}</Badge>
                    </div>
                    <Badge variant="secondary">{log.managerName}</Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedLog(log)}
                    data-testid={`button-view-${log.id}`}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Total Sales:</span>
                      <span className="font-bold">
                        ${calculateTotal(log.foodSales, log.barSales, log.gamingSales).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Food: ${log.foodSales} | Bar: ${log.barSales} | Gaming: ${log.gamingSales}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm">
                      <span className="font-medium">Weather:</span> {log.currentWeather.condition}, {log.currentWeather.temperature}°F
                    </div>
                    <div className="text-sm text-muted-foreground line-clamp-2">
                      {log.dailyNotes}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}