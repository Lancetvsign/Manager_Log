import WeatherCard from '../WeatherCard';

export default function WeatherCardExample() {
  const currentWeather = {
    temperature: 72,
    condition: "Sunny",
    humidity: 45,
    windSpeed: 8,
    description: "Clear skies with light breeze"
  };

  const historicalWeather = {
    temperature: 68,
    condition: "Rainy",
    humidity: 65,
    windSpeed: 12,
    description: "Light rain with moderate winds"
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      <WeatherCard
        title="Today's Weather"
        weather={currentWeather}
        isHistorical={false}
      />
      <WeatherCard
        title="Weather 1 Year Ago"
        weather={historicalWeather}
        isHistorical={true}
      />
    </div>
  );
}