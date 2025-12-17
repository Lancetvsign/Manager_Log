interface WeatherWideProps {
  title?: string;
  temp?: string | number;
  condition?: string;
  hi?: string | number;
  lo?: string | number;
  aqi?: string | number;
  wind?: string | number;
  icon?: string;
  muted?: boolean;
  compact?: boolean;
  isLoading?: boolean;
}

function getWeatherEmoji(condition: string = ""): string {
  const lower = condition.toLowerCase();
  if (lower.includes("rain") || lower.includes("shower")) return "🌧️";
  if (lower.includes("snow") || lower.includes("sleet")) return "🌨️";
  if (lower.includes("thunder") || lower.includes("storm")) return "⛈️";
  if (lower.includes("cloud") || lower.includes("overcast")) return "☁️";
  if (lower.includes("clear") || lower.includes("sunny")) return "☀️";
  if (lower.includes("partly")) return "⛅";
  if (lower.includes("fog") || lower.includes("mist")) return "🌫️";
  if (lower.includes("wind")) return "💨";
  return "☁️";
}

export default function WeatherWide({
  title = "Today",
  temp = "—",
  condition = "—",
  hi = "—",
  lo = "—",
  aqi = "—",
  wind = "—",
  icon,
  muted = false,
  compact = false,
  isLoading = false,
}: WeatherWideProps) {
  const displayIcon = icon || getWeatherEmoji(String(condition));

  if (isLoading) {
    return (
      <div className={[
        "w-full rounded-xl border border-border/20 bg-card/50",
        compact ? "px-4 py-3" : "px-5 py-4",
      ].join(" ")}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          <span className="text-sm">Loading weather...</span>
        </div>
      </div>
    );
  }

  const hasHiLo = hi !== "—" && lo !== "—";
  const hasAqi = aqi !== "—";

  return (
    <div
      className={[
        "w-full rounded-xl border border-border/20 bg-card/50",
        compact ? "px-4 py-3" : "px-5 py-4",
        muted ? "opacity-75" : "",
      ].join(" ")}
      data-testid={`weather-widget-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={compact ? "text-xl leading-none" : "text-3xl leading-none"}>{displayIcon}</div>

          <div className="leading-tight">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {title}
            </div>

            <div className="flex items-baseline gap-2 mt-0.5">
              <div className={[
                "font-semibold text-foreground leading-none",
                compact ? "text-3xl" : "text-4xl",
              ].join(" ")}>
                {temp}°
              </div>
              <div className="text-xs text-muted-foreground">{condition}</div>
            </div>

            {hasHiLo && !compact && (
              <div className="mt-1.5 text-xs text-muted-foreground">
                H:{hi}° L:{lo}°
              </div>
            )}
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Wind
          </div>
          <div className="mt-0.5 text-xs font-medium text-foreground/80">{wind} mph</div>
        </div>
      </div>
    </div>
  );
}
