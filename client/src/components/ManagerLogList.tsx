import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search, Eye, Calendar, DollarSign, Loader2, CloudSun } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { ManagerLog } from "@shared/schema";

interface ManagerLogListProps {
  logs?: ManagerLog[];
}

export default function ManagerLogList({ logs: propLogs }: ManagerLogListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLog, setSelectedLog] = useState<ManagerLog | null>(null);
  
  const { data: apiLogs, isLoading, error } = useQuery<ManagerLog[]>({
    queryKey: ['/api/manager-logs'],
  });
  
  const logs = apiLogs && apiLogs.length > 0 ? apiLogs : (propLogs || []);

  const filteredLogs = logs.filter(log =>
    log.managerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.logDate.includes(searchTerm) ||
    (log.dailyNotes?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  );

  const calculateTotal = (food: string | null, bar: string | null, gaming: string | null) => {
    return (parseFloat(food || "0") || 0) + (parseFloat(bar || "0") || 0) + (parseFloat(gaming || "0") || 0);
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
            <CardTitle className="flex items-center justify-between flex-wrap gap-2">
              <span>{selectedLog.logDate} - {selectedLog.dayOfWeek}</span>
              <Badge variant="secondary">{selectedLog.managerName}</Badge>
            </CardTitle>
          </CardHeader>
        </Card>

        {/* Weather Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CloudSun className="h-5 w-5" />
                Weather on This Day
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{selectedLog.weather || "No weather data available"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CloudSun className="h-5 w-5" />
                Weather 1 Year Prior
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{selectedLog.weatherLastYear || "No historical weather data available"}</p>
            </CardContent>
          </Card>
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
                <p className="text-2xl font-bold">${selectedLog.foodSales || "0.00"}</p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Bar Sales</h4>
                <p className="text-2xl font-bold">${selectedLog.barSales || "0.00"}</p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Gaming Sales</h4>
                <p className="text-2xl font-bold">${selectedLog.gamingSales || "0.00"}</p>
              </div>
            </div>
            <div className="border-t pt-4 mt-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <span className="font-medium">Total Sales:</span>
                <span className="text-xl font-bold">
                  ${selectedLog.totalSales || calculateTotal(selectedLog.foodSales, selectedLog.barSales, selectedLog.gamingSales).toFixed(2)}
                </span>
              </div>
            </div>
            {selectedLog.dailyNumber || selectedLog.weeklyNumber ? (
              <div className="border-t pt-4 mt-4 flex gap-4 flex-wrap">
                {selectedLog.dailyNumber && (
                  <div>
                    <span className="font-medium">Daily Number:</span> {selectedLog.dailyNumber}
                  </div>
                )}
                {selectedLog.weeklyNumber && (
                  <div>
                    <span className="font-medium">Weekly Number:</span> {selectedLog.weeklyNumber}
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Sales Notes */}
        {selectedLog.salesNotes && (
          <Card>
            <CardHeader>
              <CardTitle>Sales Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{selectedLog.salesNotes}</p>
            </CardContent>
          </Card>
        )}

        {/* Daily Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{selectedLog.dailyNotes || "No notes recorded."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold">Manager Log History</h2>
        <div className="flex items-center gap-2">
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
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{log.logDate}</span>
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
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Total Sales:</span>
                      <span className="font-bold">
                        ${log.totalSales || calculateTotal(log.foodSales, log.barSales, log.gamingSales).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Food: ${log.foodSales || "0"} | Bar: ${log.barSales || "0"} | Gaming: ${log.gamingSales || "0"}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {log.weather && (
                      <div className="text-sm">
                        <span className="font-medium">Weather:</span> {log.weather.split(',')[0]}
                      </div>
                    )}
                    {log.dailyNotes && (
                      <div className="text-sm text-muted-foreground line-clamp-2">
                        {log.dailyNotes}
                      </div>
                    )}
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
