import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, Save, Loader2 } from "lucide-react";
import WeatherCard from "./WeatherCard";
import SalesInput from "./SalesInput";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface ManagerLogFormProps {
  onSubmit: (data: any) => void;
}

interface WeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  description: string;
}

interface HistoricalSalesData {
  food: string;
  bar: string;
  gaming: string;
}

export default function ManagerLogForm({ onSubmit }: ManagerLogFormProps) {
  const [date, setDate] = useState<Date>(new Date());
  const [managerName, setManagerName] = useState("");
  const [dailyNotes, setDailyNotes] = useState("");
  const [salesData, setSalesData] = useState({
    current: { food: "", bar: "", gaming: "" },
    lastYear: { food: "", bar: "", gaming: "" }
  });
  const [weatherData, setWeatherData] = useState<{
    current: WeatherData | null;
    historical: WeatherData | null;
  }>({ current: null, historical: null });
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  
  const { toast } = useToast();

  // Fetch weather data when date changes
  useEffect(() => {
    const fetchWeatherData = async () => {
      setIsLoadingWeather(true);
      try {
        const [currentResponse, historicalResponse] = await Promise.all([
          fetch('/api/weather/current'),
          fetch(`/api/weather/historical?date=${format(date, 'yyyy-MM-dd')}`)
        ]);

        const [currentWeather, historicalWeather] = await Promise.all([
          currentResponse.json(),
          historicalResponse.json()
        ]);

        setWeatherData({
          current: currentWeather,
          historical: historicalWeather
        });
      } catch (error) {
        console.error('Failed to fetch weather data:', error);
        toast({
          title: "Weather Error",
          description: "Failed to load weather data. Using default values.",
          variant: "destructive"
        });
      } finally {
        setIsLoadingWeather(false);
      }
    };

    fetchWeatherData();
  }, [date, toast]);

  // Create log entry mutation
  const createLogMutation = useMutation({
    mutationFn: async (logData: any) => {
      const response = await fetch('/api/manager-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logData)
      });
      
      if (!response.ok) {
        throw new Error('Failed to create log entry');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Manager log entry saved successfully!"
      });
      onSubmit(data);
    },
    onError: (error: any) => {
      console.error('Failed to save log entry:', error);
      toast({
        title: "Error",
        description: "Failed to save log entry. Please try again.",
        variant: "destructive"
      });
    }
  });

  const getDayOfWeek = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  };

  const handleSalesChange = (field: string, value: string) => {
    setSalesData(prev => ({
      ...prev,
      current: { ...prev.current, [field]: value }
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!managerName.trim() || !dailyNotes.trim()) {
      toast({
        title: "Validation Error",
        description: "Manager name and daily notes are required.",
        variant: "destructive"
      });
      return;
    }

    if (!salesData.current.food || !salesData.current.bar || !salesData.current.gaming) {
      toast({
        title: "Validation Error",
        description: "All sales fields are required.",
        variant: "destructive"
      });
      return;
    }
    
    const logData = {
      date: format(date, 'yyyy-MM-dd'),
      dayOfWeek: getDayOfWeek(date),
      managerName: managerName.trim(),
      foodSales: salesData.current.food,
      barSales: salesData.current.bar,
      gamingSales: salesData.current.gaming,
      lastYearFoodSales: salesData.lastYear.food || undefined,
      lastYearBarSales: salesData.lastYear.bar || undefined,
      lastYearGamingSales: salesData.lastYear.gaming || undefined,
      currentWeather: weatherData.current,
      historicalWeather: weatherData.historical,
      dailyNotes: dailyNotes.trim()
    };

    createLogMutation.mutate(logData);
  };

  const resetForm = () => {
    setManagerName("");
    setDailyNotes("");
    setSalesData(prev => ({
      ...prev,
      current: { food: "", bar: "", gaming: "" }
    }));
  };

  // Reset form after successful submission
  useEffect(() => {
    if (createLogMutation.isSuccess) {
      resetForm();
      createLogMutation.reset();
    }
  }, [createLogMutation.isSuccess]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header Information */}
      <Card data-testid="card-log-header">
        <CardHeader>
          <CardTitle className="text-xl">Daily Manager Log Entry</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Date Picker */}
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                  data-testid="button-date-picker"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(date, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(newDate) => newDate && setDate(newDate)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Day of Week (auto-filled) */}
          <div className="space-y-2">
            <Label>Day of Week</Label>
            <Input
              value={getDayOfWeek(date)}
              readOnly
              className="bg-muted"
              data-testid="input-day-of-week"
            />
          </div>

          {/* Manager Name */}
          <div className="space-y-2">
            <Label htmlFor="manager-name">Manager Name</Label>
            <Input
              id="manager-name"
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              placeholder="Enter manager name"
              required
              data-testid="input-manager-name"
            />
          </div>
        </CardContent>
      </Card>

      {/* Weather Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoadingWeather ? (
          <Card className="col-span-full">
            <CardContent className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Loading weather data...</span>
            </CardContent>
          </Card>
        ) : (
          <>
            {weatherData.current && (
              <WeatherCard
                title="Today's Weather"
                weather={weatherData.current}
                isHistorical={false}
              />
            )}
            {weatherData.historical && (
              <WeatherCard
                title="Weather 1 Year Ago"
                weather={weatherData.historical}
                isHistorical={true}
              />
            )}
          </>
        )}
      </div>

      {/* Sales Data */}
      <SalesInput
        title="Daily Sales"
        salesData={salesData}
        onSalesChange={handleSalesChange}
        showComparison={true}
      />

      {/* Daily Notes */}
      <Card data-testid="card-notes">
        <CardHeader>
          <CardTitle className="text-lg">Daily Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={dailyNotes}
            onChange={(e) => setDailyNotes(e.target.value)}
            placeholder="Enter daily observations, incidents, staff notes, or any other important information..."
            className="min-h-32"
            required
            data-testid="textarea-daily-notes"
          />
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end space-x-2">
        <Button 
          type="button" 
          variant="outline" 
          onClick={resetForm}
          disabled={createLogMutation.isPending}
          data-testid="button-reset"
        >
          Reset Form
        </Button>
        <Button 
          type="submit" 
          size="lg" 
          disabled={createLogMutation.isPending || isLoadingWeather}
          data-testid="button-submit"
        >
          {createLogMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Log Entry
            </>
          )}
        </Button>
      </div>
    </form>
  );
}