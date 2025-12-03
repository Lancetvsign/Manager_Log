import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cloud, Sun, CloudRain, CloudSnow, Wind, Thermometer, Droplets } from "lucide-react";

interface WeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  description: string;
}

interface WeatherCardProps {
  title: string;
  weather: WeatherData;
  isHistorical?: boolean;
  fallbackNote?: string | null;
}

const getWeatherIcon = (condition: string) => {
  switch (condition.toLowerCase()) {
    case 'sunny':
    case 'clear':
      return <Sun className="h-8 w-8 text-yellow-500" />;
    case 'cloudy':
    case 'overcast':
      return <Cloud className="h-8 w-8 text-gray-500" />;
    case 'rainy':
    case 'rain':
      return <CloudRain className="h-8 w-8 text-blue-500" />;
    case 'snowy':
    case 'snow':
      return <CloudSnow className="h-8 w-8 text-gray-300" />;
    default:
      return <Cloud className="h-8 w-8 text-gray-500" />;
  }
};

export default function WeatherCard({ title, weather, isHistorical = false, fallbackNote }: WeatherCardProps) {
  return (
    <Card data-testid={`card-weather-${isHistorical ? 'historical' : 'current'}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {getWeatherIcon(weather.condition)}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Thermometer className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold" data-testid="text-temperature">
                {weather.temperature}°F
              </span>
            </div>
            <Badge variant="secondary" data-testid="badge-condition">
              {weather.condition}
            </Badge>
          </div>
          
          <p className="text-sm text-muted-foreground" data-testid="text-description">
            {weather.description}
          </p>
          
          <div className="flex justify-between text-sm text-muted-foreground">
            <div className="flex items-center space-x-1">
              <Droplets className="h-3 w-3" />
              <span data-testid="text-humidity">{weather.humidity}%</span>
            </div>
            <div className="flex items-center space-x-1">
              <Wind className="h-3 w-3" />
              <span data-testid="text-wind">{weather.windSpeed} mph</span>
            </div>
          </div>
          
          {/* Fallback note displayed when historical data was unavailable */}
          {fallbackNote && (
            <p className="text-xs text-amber-600 dark:text-amber-400 italic" data-testid="text-fallback-note">
              {fallbackNote}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}