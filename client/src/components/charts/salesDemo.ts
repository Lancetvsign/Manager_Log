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

export function makeCompareFromCurrent(
  current: SalesPoint[],
  opts?: { scale?: number; volatility?: number; seed?: number }
): SalesPoint[] {
  const scale = opts?.scale ?? 0.92;
  const vol = opts?.volatility ?? 0.12;
  const seed = opts?.seed ?? 42;

  return (current || []).map((p, i) => {
    const s = seed + i * 13;

    const foodNoise = (rand(s + 1) - 0.5) * 2 * vol;
    const barNoise = (rand(s + 2) - 0.5) * 2 * vol;
    const gamingNoise = (rand(s + 3) - 0.5) * 2 * vol;

    const food = Math.round(clamp(p.food * scale * (1 + foodNoise), 0, Number.MAX_SAFE_INTEGER));
    const bar = Math.round(clamp(p.bar * scale * (1 + barNoise), 0, Number.MAX_SAFE_INTEGER));
    const gaming = Math.round(clamp(p.gaming * scale * (1 + gamingNoise), 0, Number.MAX_SAFE_INTEGER));

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
  return labels.map((x, i) => {
    const s = seed + i * 17;

    const base = 600 + 400 * rand(s + 1);
    const spike = (i % 9 === 0 ? 1200 : 0) + (i % 13 === 0 ? 900 : 0);

    const food = Math.round((base + spike) * (0.45 + 0.15 * rand(s + 2)));
    const bar = Math.round((base + spike) * (0.35 + 0.15 * rand(s + 3)));
    const gaming = Math.round((base + spike) * (0.15 + 0.10 * rand(s + 4)));
    const total = food + bar + gaming;

    return { ...x, food, bar, gaming, total };
  });
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
