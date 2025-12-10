import { Badge } from "@/components/ui/badge";

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

export default function WeatherCard({ title, weather, isHistorical = false, fallbackNote }: WeatherCardProps) {
  return (
    <div 
      className="rounded-lg border bg-card p-3 flex-1"
      data-testid={`card-weather-${isHistorical ? 'historical' : 'current'}`}
    >
      <h6 className="text-muted-foreground text-xs mb-1">{title}</h6>
      <div className="text-2xl font-bold" data-testid="text-temperature">
        {weather.temperature}°F
      </div>
      <Badge variant="secondary" className="mt-1" data-testid="badge-condition">
        {weather.condition}
      </Badge>
      <div className="text-xs text-muted-foreground mt-2" data-testid="text-details">
        💧 <span data-testid="text-humidity">{weather.humidity}%</span>
        &nbsp;&nbsp;
        💨 <span data-testid="text-wind">{weather.windSpeed} mph</span>
      </div>
      {fallbackNote && (
        <div className="text-xs text-amber-600 dark:text-amber-400 italic mt-1" data-testid="text-fallback-note">
          {fallbackNote}
        </div>
      )}
    </div>
  );
}
