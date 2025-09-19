import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, Save } from "lucide-react";
import WeatherCard from "./WeatherCard";
import SalesInput from "./SalesInput";

interface ManagerLogFormProps {
  onSubmit: (data: any) => void;
}

// Mock weather data - todo: remove mock functionality
const getMockWeatherData = () => ({
  current: {
    temperature: 72,
    condition: "Sunny",
    humidity: 45,
    windSpeed: 8,
    description: "Clear skies with light breeze"
  },
  historical: {
    temperature: 68,
    condition: "Cloudy", 
    humidity: 52,
    windSpeed: 12,
    description: "Overcast with moderate winds"
  }
});

// Mock historical sales data - todo: remove mock functionality
const getMockHistoricalSales = () => ({
  food: "2450.00",
  bar: "1200.00", 
  gaming: "350.00"
});

export default function ManagerLogForm({ onSubmit }: ManagerLogFormProps) {
  const [date, setDate] = useState<Date>(new Date());
  const [managerName, setManagerName] = useState("");
  const [dailyNotes, setDailyNotes] = useState("");
  const [salesData, setSalesData] = useState({
    current: { food: "", bar: "", gaming: "" },
    lastYear: getMockHistoricalSales() // todo: remove mock functionality
  });

  const weatherData = getMockWeatherData(); // todo: remove mock functionality

  const getDayOfWeek = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  };

  const handleSalesChange = (field: string, value: string) => {
    setSalesData(prev => ({
      ...prev,
      current: { ...prev.current, [field]: value }
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const logData = {
      date: format(date, 'yyyy-MM-dd'),
      dayOfWeek: getDayOfWeek(date),
      managerName,
      foodSales: salesData.current.food,
      barSales: salesData.current.bar,
      gamingSales: salesData.current.gaming,
      lastYearFoodSales: salesData.lastYear.food,
      lastYearBarSales: salesData.lastYear.bar,
      lastYearGamingSales: salesData.lastYear.gaming,
      currentWeather: weatherData.current,
      historicalWeather: weatherData.historical,
      dailyNotes
    };

    console.log('Submitting log entry:', logData);
    onSubmit(logData);
    
    // Reset form
    setManagerName("");
    setDailyNotes("");
    setSalesData(prev => ({
      ...prev,
      current: { food: "", bar: "", gaming: "" }
    }));
  };

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
        <WeatherCard
          title="Today's Weather"
          weather={weatherData.current}
          isHistorical={false}
        />
        <WeatherCard
          title="Weather 1 Year Ago"
          weather={weatherData.historical}
          isHistorical={true}
        />
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
      <div className="flex justify-end">
        <Button type="submit" size="lg" data-testid="button-submit">
          <Save className="mr-2 h-4 w-4" />
          Save Log Entry
        </Button>
      </div>
    </form>
  );
}