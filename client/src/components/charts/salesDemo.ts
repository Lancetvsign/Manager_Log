export type SalesPoint = {
  label: string;
  dateKey: string;
  total: number;
  food: number;
  bar: number;
  gaming: number;
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

    const food = Math.round(clamp(baseFood * dowMultiplier * daySpike * foodNoise, 50, 10000));
    const bar = Math.round(clamp(baseBar * dowMultiplier * daySpike * barNoise, 30, 8000));
    const gaming = Math.round(clamp(baseGaming * dowMultiplier * daySpike * gamingNoise, 20, 5000));
    const total = food + bar + gaming;

    return { ...x, food, bar, gaming, total };
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

    const food = Math.round(clamp(p.food * scale * spikeAdjust * (1 + foodNoise), 50, 10000));
    const bar = Math.round(clamp(p.bar * scale * spikeAdjust * (1 + barNoise), 30, 8000));
    const gaming = Math.round(clamp(p.gaming * scale * spikeAdjust * (1 + gamingNoise), 20, 5000));

    const total = food + bar + gaming;

    return {
      label: p.label,
      dateKey: p.dateKey,
      food,
      bar,
      gaming,
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
