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
  isLoading = false,
}: WeatherWideProps) {
  const displayIcon = icon || getWeatherEmoji(String(condition));

  if (isLoading) {
    return (
      <div className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-slate-600 dark:border-t-slate-300" />
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
        "w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-4 shadow-sm",
        muted ? "opacity-70" : "",
      ].join(" ")}
      data-testid={`weather-widget-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-3xl leading-none">{displayIcon}</div>

          <div className="leading-tight">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {title}
            </div>

            <div className="flex items-baseline gap-3 mt-1">
              <div className="text-4xl font-semibold text-slate-900 dark:text-slate-100 leading-none">
                {temp}°
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300">{condition}</div>
            </div>

            {hasHiLo && (
              <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                H:{hi}° L:{lo}°
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Wind
            </div>
            <div className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-300">{wind} mph</div>
          </div>

          {hasAqi && (
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                AQI
              </div>
              <div className="mt-0.5 inline-flex rounded-full border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                {aqi}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
