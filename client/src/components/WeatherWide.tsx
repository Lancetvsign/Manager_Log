import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning, Wind, Loader2 } from "lucide-react";

interface WeatherWideProps {
  title?: string;
  temp?: string | number;
  condition?: string;
  windSpeed?: string | number;
  isLoading?: boolean;
  muted?: boolean;
}

function getWeatherIcon(condition: string = "") {
  const lower = condition.toLowerCase();
  if (lower.includes("rain") || lower.includes("shower")) return <CloudRain className="h-7 w-7" />;
  if (lower.includes("snow") || lower.includes("sleet")) return <CloudSnow className="h-7 w-7" />;
  if (lower.includes("thunder") || lower.includes("storm")) return <CloudLightning className="h-7 w-7" />;
  if (lower.includes("cloud") || lower.includes("overcast")) return <Cloud className="h-7 w-7" />;
  if (lower.includes("clear") || lower.includes("sunny")) return <Sun className="h-7 w-7 text-amber-400" />;
  if (lower.includes("wind")) return <Wind className="h-7 w-7" />;
  return <Cloud className="h-7 w-7" />;
}

export default function WeatherWide({
  title = "Today",
  temp = "—",
  condition = "—",
  windSpeed = "—",
  isLoading = false,
  muted = false,
}: WeatherWideProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/[0.08] bg-card/30 px-4 py-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading weather...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        "rounded-xl border border-border/[0.08] bg-card/30 px-4 py-3",
        muted ? "opacity-70" : "",
      ].join(" ")}
      data-testid={`weather-widget-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-muted-foreground">
            {getWeatherIcon(String(condition))}
          </div>

          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {title}
            </div>

            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-semibold leading-none">
                {temp}°F
              </div>
              <div className="text-xs text-muted-foreground">{condition}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Wind
          </div>
          <div className="mt-1 rounded-full border border-border/[0.08] bg-background/20 px-2 py-1 text-xs">
            {windSpeed} mph
          </div>
        </div>
      </div>
    </div>
  );
}
