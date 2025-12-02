/**
 * CHART OPTIONS POPOVER COMPONENT
 * ================================
 * A reusable popover with chart customization controls.
 * Each chart can have its own independent options stored in React state.
 * 
 * Features:
 * - Toggle gridlines on/off
 * - Toggle data labels on/off
 * - Toggle animations on/off
 * - Switch between rounded/straight corners (for bar/area charts)
 * - Toggle smoothing (curved/straight lines)
 * - Color theme selector (default, monochrome, multicolor, high-contrast)
 * 
 * HOW TO ADD NEW OPTIONS:
 * 1. Add the option type in shared/schema.ts ChartOptions interface
 * 2. Add default value in DEFAULT_CHART_OPTIONS
 * 3. Add UI control in this component
 * 4. Apply the option in the relevant chart component
 * 
 * @example
 * <ChartOptionsPopover
 *   options={chartOptions}
 *   onOptionsChange={setChartOptions}
 *   showCornerStyle={true}
 *   showSmoothing={true}
 * />
 */

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings, Grid, Tag, Sparkles, Square, Spline, Palette } from "lucide-react";
import type { ChartOptions, ChartColorTheme, ChartSmoothing, ChartCornerStyle } from "@shared/schema";

export const DEFAULT_CHART_OPTIONS: ChartOptions = {
  showGridlines: true,
  showDataLabels: false,
  enableAnimations: true,
  cornerStyle: "rounded",
  smoothing: "curved",
  colorTheme: "default",
};

export const CHART_COLOR_THEMES: Record<ChartColorTheme, { name: string; colors: string[] }> = {
  default: {
    name: "SCP Teal",
    colors: ["hsl(174, 83.9%, 31.6%)", "hsl(174, 83.9%, 41.6%)", "hsl(174, 83.9%, 51.6%)"],
  },
  monochrome: {
    name: "Monochrome",
    colors: ["hsl(0, 0%, 30%)", "hsl(0, 0%, 50%)", "hsl(0, 0%, 70%)"],
  },
  multicolor: {
    name: "Multi-color",
    colors: ["hsl(174, 83.9%, 31.6%)", "hsl(217, 91%, 60%)", "hsl(280, 87%, 65%)"],
  },
  highContrast: {
    name: "High Contrast",
    colors: ["hsl(0, 0%, 0%)", "hsl(0, 100%, 50%)", "hsl(240, 100%, 50%)"],
  },
};

interface ChartOptionsPopoverProps {
  options: ChartOptions;
  onOptionsChange: (options: ChartOptions) => void;
  showCornerStyle?: boolean;
  showSmoothing?: boolean;
}

export default function ChartOptionsPopover({
  options,
  onOptionsChange,
  showCornerStyle = false,
  showSmoothing = false,
}: ChartOptionsPopoverProps) {
  const updateOption = <K extends keyof ChartOptions>(key: K, value: ChartOptions[K]) => {
    onOptionsChange({ ...options, [key]: value });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          data-testid="button-chart-options"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-4">
          <h4 className="font-medium text-sm">Chart Options</h4>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Grid className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="gridlines" className="text-sm">Gridlines</Label>
            </div>
            <Switch
              id="gridlines"
              checked={options.showGridlines}
              onCheckedChange={(checked) => updateOption("showGridlines", checked)}
              data-testid="switch-gridlines"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="labels" className="text-sm">Data Labels</Label>
            </div>
            <Switch
              id="labels"
              checked={options.showDataLabels}
              onCheckedChange={(checked) => updateOption("showDataLabels", checked)}
              data-testid="switch-labels"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="animations" className="text-sm">Animations</Label>
            </div>
            <Switch
              id="animations"
              checked={options.enableAnimations}
              onCheckedChange={(checked) => updateOption("enableAnimations", checked)}
              data-testid="switch-animations"
            />
          </div>

          {showCornerStyle && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Square className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm">Corner Style</Label>
              </div>
              <div className="flex gap-2">
                {(["rounded", "straight"] as ChartCornerStyle[]).map((style) => (
                  <Button
                    key={style}
                    variant={options.cornerStyle === style ? "default" : "outline"}
                    size="sm"
                    onClick={() => updateOption("cornerStyle", style)}
                    className="flex-1"
                    data-testid={`button-corner-${style}`}
                  >
                    {style.charAt(0).toUpperCase() + style.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {showSmoothing && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Spline className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm">Line Style</Label>
              </div>
              <div className="flex gap-2">
                {(["curved", "straight"] as ChartSmoothing[]).map((style) => (
                  <Button
                    key={style}
                    variant={options.smoothing === style ? "default" : "outline"}
                    size="sm"
                    onClick={() => updateOption("smoothing", style)}
                    className="flex-1"
                    data-testid={`button-smoothing-${style}`}
                  >
                    {style.charAt(0).toUpperCase() + style.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm">Color Theme</Label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(CHART_COLOR_THEMES) as ChartColorTheme[]).map((theme) => (
                <Button
                  key={theme}
                  variant={options.colorTheme === theme ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateOption("colorTheme", theme)}
                  className="text-xs"
                  data-testid={`button-theme-${theme}`}
                >
                  {CHART_COLOR_THEMES[theme].name}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
