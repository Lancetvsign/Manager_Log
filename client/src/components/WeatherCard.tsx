import { Badge } from "@/components/ui/badge";
import { Cloud, Sun, CloudRain, CloudSnow, Thermometer, Droplets, Wind } from "lucide-react";

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
  const iconClass = "h-4 w-4";
  switch (condition.toLowerCase()) {
    case 'sunny':
    case 'clear':
      return <Sun className={`${iconClass} text-yellow-500`} />;
    case 'cloudy':
    case 'overcast':
      return <Cloud className={`${iconClass} text-gray-500`} />;
    case 'rainy':
    case 'rain':
      return <CloudRain className={`${iconClass} text-blue-500`} />;
    case 'snowy':
    case 'snow':
      return <CloudSnow className={`${iconClass} text-gray-300`} />;
    default:
      return <Cloud className={`${iconClass} text-gray-500`} />;
  }
};

export default function WeatherCard({ title, weather, isHistorical = false, fallbackNote }: WeatherCardProps) {
  return (
    <div 
      className="flex items-center gap-3 p-3 rounded-lg border bg-card"
      data-testid={`card-weather-${isHistorical ? 'historical' : 'current'}`}
    >
      <div className="flex items-center gap-2">
        {getWeatherIcon(weather.condition)}
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{title}:</span>
      </div>
      
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Thermometer className="h-3 w-3 text-muted-foreground" />
          <span className="text-sm font-semibold" data-testid="text-temperature">
            {weather.temperature}°F
          </span>
        </div>
        
        <Badge variant="secondary" className="text-xs py-0 px-1.5" data-testid="badge-condition">
          {weather.condition}
        </Badge>
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <Droplets className="h-3 w-3" />
            <span data-testid="text-humidity">{weather.humidity}%</span>
          </span>
          <span className="flex items-center gap-0.5">
            <Wind className="h-3 w-3" />
            <span data-testid="text-wind">{weather.windSpeed}mph</span>
          </span>
        </div>
      </div>
      
      {fallbackNote && (
        <span className="text-xs text-amber-600 dark:text-amber-400 italic ml-auto" data-testid="text-fallback-note">
          ({fallbackNote})
        </span>
      )}
    </div>
  );
}
