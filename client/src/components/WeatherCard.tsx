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
  const iconClass = "h-4 w-4 inline-block mr-1";
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
      className="text-sm text-muted-foreground"
      data-testid={`card-weather-${isHistorical ? 'historical' : 'current'}`}
    >
      <span className="font-medium text-foreground">{title}:</span>{" "}
      <Thermometer className="h-3.5 w-3.5 inline-block mx-0.5" />
      <span data-testid="text-temperature">{weather.temperature}°F</span>,{" "}
      {getWeatherIcon(weather.condition)}
      <span data-testid="badge-condition">{weather.condition}</span>,{" "}
      <Droplets className="h-3.5 w-3.5 inline-block mx-0.5" />
      <span data-testid="text-humidity">{weather.humidity}%</span>,{" "}
      <Wind className="h-3.5 w-3.5 inline-block mx-0.5" />
      <span data-testid="text-wind">{weather.windSpeed}mph</span>
      {fallbackNote && (
        <span className="text-xs text-amber-600 dark:text-amber-400 italic ml-1" data-testid="text-fallback-note">
          ({fallbackNote})
        </span>
      )}
    </div>
  );
}
