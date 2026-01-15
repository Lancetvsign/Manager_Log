import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, History, ArrowRight, Upload, Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useManagerLog, buildApiUrl } from "@/contexts/ManagerLogContext";
import { format, parseISO } from "date-fns";
import { useLocation } from "wouter";

interface HistoricalStatusResponse {
  today: string;
  compareDate: string;
  compareDayOfWeek: string;
  hasHistoricalData: boolean;
}

interface HistoricalComparisonCardProps {
  currentDate: string;
  onAddHistoricalData: () => void;
  onBulkImport: () => void;
}

export default function HistoricalComparisonCard({ 
  currentDate, 
  onAddHistoricalData, 
  onBulkImport 
}: HistoricalComparisonCardProps) {
  const { clubId, apiBaseUrl } = useManagerLog();
  const [, setLocation] = useLocation();
  
  const { data: historicalStatus, isLoading, error } = useQuery<HistoricalStatusResponse>({
    queryKey: ['/api/historical-status', clubId, currentDate],
    queryFn: async () => {
      const url = buildApiUrl(`/api/historical-status?clubId=${clubId}&date=${currentDate}`, apiBaseUrl);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch historical status');
      }
      return response.json();
    },
    staleTime: 30000,
    refetchOnWindowFocus: true
  });

  if (isLoading) {
    return (
      <Card className="border-dashed" data-testid="card-historical-loading">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !historicalStatus) {
    return null;
  }

  const { compareDate, compareDayOfWeek, hasHistoricalData } = historicalStatus;
  const formattedCompareDate = format(parseISO(compareDate), 'MMM d, yyyy');

  if (hasHistoricalData) {
    return (
      <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" data-testid="card-historical-available">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-800">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-green-900 dark:text-green-100">
                    Last Year Comparison Available
                  </h4>
                  <Badge variant="secondary" className="text-xs">
                    Same {compareDayOfWeek}
                  </Badge>
                </div>
                <p className="text-sm text-green-700 dark:text-green-300">
                  {formattedCompareDate}
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              className="border-green-300 dark:border-green-700"
              onClick={() => {
                setLocation(`/history?date=${compareDate}`);
              }}
              data-testid="btn-view-comparison"
            >
              <History className="h-4 w-4 mr-2" />
              View Comparison
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 border-dashed" data-testid="card-historical-missing">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-800 flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h4 className="font-medium text-amber-900 dark:text-amber-100">
                Historical data not available
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                No data for {compareDayOfWeek}, {formattedCompareDate}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                Add last year's data to enable year-over-year comparison
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button 
              variant="default"
              size="sm"
              onClick={onAddHistoricalData}
              className="flex-1 sm:flex-none"
              data-testid="btn-add-historical"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Historical Data
            </Button>
            <Button 
              variant="outline"
              size="sm"
              onClick={onBulkImport}
              className="flex-1 sm:flex-none"
              data-testid="btn-bulk-import"
            >
              <Upload className="h-4 w-4 mr-2" />
              Bulk Import
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
