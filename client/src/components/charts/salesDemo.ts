export type SalesPoint = {
  label: string;
  dateKey: string;
  total: number;
  food: number;
  bar: number;
  gaming: number;
  catering: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function rand(seed: number) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function getDayOfWeekMultiplier(dayIndex: number): number {
  const multipliers: Record<number, number> = {
    0: 1.15,
    1: 0.85,
    2: 0.88,
    3: 0.95,
    4: 1.00,
    5: 1.25,
    6: 1.30,
  };
  return multipliers[dayIndex] ?? 1.0;
}

function getSpikeDay(numDays: number, seed: number): number {
  return Math.floor(rand(seed * 7) * numDays);
}

export interface DemoSeriesOptions {
  seed?: number;
  baseFood?: number;
  baseBar?: number;
  baseGaming?: number;
  baseCatering?: number;
  noiseRange?: number;
  spikeMultiplier?: number;
}

export function generateDemoSalesSeries(
  labels: { label: string; dateKey: string; dayOfWeek?: number }[],
  opts?: DemoSeriesOptions
): SalesPoint[] {
  const seed = opts?.seed ?? 7;
  const baseFood = opts?.baseFood ?? 850;
  const baseBar = opts?.baseBar ?? 550;
  const baseGaming = opts?.baseGaming ?? 280;
  const baseCatering = opts?.baseCatering ?? 350;
  const noiseRange = opts?.noiseRange ?? 0.12;
  const spikeMultiplier = opts?.spikeMultiplier ?? 1.38;

  const spikeDay = getSpikeDay(labels.length, seed);

  return labels.map((x, i) => {
    const s = seed + i * 17;

    let dayOfWeek = x.dayOfWeek;
    if (dayOfWeek === undefined) {
      const date = new Date(x.dateKey + "T12:00:00");
      dayOfWeek = date.getDay();
    }

    const dowMultiplier = getDayOfWeekMultiplier(dayOfWeek);

    const isSpike = i === spikeDay;
    const daySpike = isSpike ? spikeMultiplier : 1.0;

    const foodNoise = 1 + (rand(s + 1) - 0.5) * 2 * noiseRange;
    const barNoise = 1 + (rand(s + 2) - 0.5) * 2 * noiseRange;
    const gamingNoise = 1 + (rand(s + 3) - 0.5) * 2 * noiseRange;
    const cateringNoise = 1 + (rand(s + 4) - 0.5) * 2 * noiseRange;

    const food = Math.round(clamp(baseFood * dowMultiplier * daySpike * foodNoise, 50, 10000));
    const bar = Math.round(clamp(baseBar * dowMultiplier * daySpike * barNoise, 30, 8000));
    const gaming = Math.round(clamp(baseGaming * dowMultiplier * daySpike * gamingNoise, 20, 5000));
    const catering = Math.round(clamp(baseCatering * dowMultiplier * daySpike * cateringNoise, 20, 8000));
    const total = food + bar + gaming + catering;

    return { ...x, food, bar, gaming, catering, total };
  });
}

export function makeCompareFromCurrent(
  current: SalesPoint[],
  opts?: { scale?: number; volatility?: number; seed?: number; shiftSpike?: boolean }
): SalesPoint[] {
  const scale = opts?.scale ?? 0.94;
  const vol = opts?.volatility ?? 0.10;
  const seed = opts?.seed ?? 42;
  const shiftSpike = opts?.shiftSpike ?? true;

  const originalSpikeIdx = current.reduce((maxIdx, p, idx, arr) => 
    p.total > arr[maxIdx].total ? idx : maxIdx, 0);

  const newSpikeIdx = shiftSpike && current.length > 2 
    ? (originalSpikeIdx + 2) % current.length 
    : originalSpikeIdx;

  return (current || []).map((p, i) => {
    const s = seed + i * 13;

    const isOriginalSpike = i === originalSpikeIdx;
    const isNewSpike = i === newSpikeIdx;

    let spikeAdjust = 1.0;
    if (isOriginalSpike && shiftSpike) {
      spikeAdjust = 0.75;
    } else if (isNewSpike && shiftSpike) {
      spikeAdjust = 1.35;
    }

    const foodNoise = (rand(s + 1) - 0.5) * 2 * vol;
    const barNoise = (rand(s + 2) - 0.5) * 2 * vol;
    const gamingNoise = (rand(s + 3) - 0.5) * 2 * vol;
    const cateringNoise = (rand(s + 4) - 0.5) * 2 * vol;

    const food = Math.round(clamp(p.food * scale * spikeAdjust * (1 + foodNoise), 50, 10000));
    const bar = Math.round(clamp(p.bar * scale * spikeAdjust * (1 + barNoise), 30, 8000));
    const gaming = Math.round(clamp(p.gaming * scale * spikeAdjust * (1 + gamingNoise), 20, 5000));
    const catering = Math.round(clamp(p.catering * scale * spikeAdjust * (1 + cateringNoise), 20, 8000));

    const total = food + bar + gaming + catering;

    return {
      label: p.label,
      dateKey: p.dateKey,
      food,
      bar,
      gaming,
      catering,
      total,
    };
  });
}

export function makeDemoSalesSeries(
  labels: { label: string; dateKey: string }[],
  seed = 7
): SalesPoint[] {
  return generateDemoSalesSeries(labels, { seed });
}

export type ComparisonModeType = "none" | "previousPeriod" | "previousYear";

export interface CompareFromCurrentOptions {
  scale?: number;
  volatility?: number;
  seed?: number;
  shiftSpike?: boolean;
  mode?: ComparisonModeType;
}

/**
 * Create comparison data from current data with mode-specific transformations.
 * - previousPeriod (last week): slightly down, more gaming (+10%), less food (-8%)
 * - previousYear (same week last year): different category mix (higher bar +18%, lower food -12%)
 */
export function makeComparisonForMode(
  current: SalesPoint[],
  mode: ComparisonModeType = "previousPeriod"
): SalesPoint[] {
  if (mode === "none" || !current || current.length === 0) {
    return [];
  }

  // Use different seeds per mode for clearly distinct data
  const seed = mode === "previousPeriod" ? 777 : 2026;
  
  // Generate base comparison with spike shift
  const base = makeCompareFromCurrent(current, {
    scale: mode === "previousPeriod" ? 0.92 : 0.88,
    volatility: mode === "previousPeriod" ? 0.15 : 0.12,
    seed,
    shiftSpike: true,
  });

  // Apply mode-specific category transformations
  if (mode === "previousPeriod") {
    // Last week: slightly down overall, more volatility
    // -8% food, -5% bar, +10% gaming
    return base.map((p) => {
      const food = Math.round(p.food * 0.92);
      const bar = Math.round(p.bar * 0.95);
      const gaming = Math.round(p.gaming * 1.10);
      const catering = Math.round(p.catering * 0.96);
      return { ...p, food, bar, gaming, catering, total: food + bar + gaming + catering };
    });
  } else {
    // Last year same week: different category mix (more bar culture, less food)
    // -12% food, +18% bar, +5% gaming
    return base.map((p) => {
      const food = Math.round(p.food * 0.88);
      const bar = Math.round(p.bar * 1.18);
      const gaming = Math.round(p.gaming * 1.05);
      const catering = Math.round(p.catering * 1.12);
      return { ...p, food, bar, gaming, catering, total: food + bar + gaming + catering };
    });
  }
}

export function makeDemoSummary(dailySales: SalesPoint[], seed = 7) {
  const daysWithLogs = dailySales.length;
  const totalSales = dailySales.reduce((sum, d) => sum + d.total, 0);
  const averageDailySales = daysWithLogs > 0 ? Math.round(totalSales / daysWithLogs) : 0;
  
  const openToDo = Math.floor(3 + rand(seed) * 5);
  const completedToDo = Math.floor(8 + rand(seed + 1) * 10);

  return {
    daysWithLogs,
    totalSales,
    averageDailySales,
    openToDo,
    completedToDo,
  };
}
