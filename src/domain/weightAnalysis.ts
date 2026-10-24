import { addDays, diffDays, type DateKey } from './date';
import type { GraphRange } from './entitlements';
import { roundTo } from './nutrition';
import { goalProgress, type WeightMeasurement } from './weight';

export type Metric = 'weight' | 'bodyFat';

/** One value per day: the earliest measurement of the day that has the metric. Missing days are absent. */
export function dailySeries(
  ms: readonly WeightMeasurement[],
  metric: Metric,
): Map<DateKey, number> {
  const sorted = [...ms].sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
  const map = new Map<DateKey, number>();
  for (const m of sorted) {
    const v = metric === 'weight' ? m.weightKg : m.bodyFatPct;
    if (v !== null && !map.has(m.measuredOn)) map.set(m.measuredOn, v);
  }
  return map;
}

/** Number of days shown for a range. 'all' spans from the first record (min 7). */
export function rangeDays(range: GraphRange, end: DateKey, first: DateKey | null): number {
  if (range === '7d') return 7;
  if (range === '30d') return 30;
  if (range === '90d') return 90;
  return first ? Math.max(diffDays(first, end) + 1, 7) : 7;
}

/** Trailing moving average evaluated on every day that has a value. */
export function movingAverageSeries(
  daily: ReadonlyMap<DateKey, number>,
  windowDays = 7,
): { date: DateKey; value: number }[] {
  const keys = [...daily.keys()].sort();
  return keys.map((date) => {
    const from = addDays(date, -(windowDays - 1));
    let sum = 0;
    let n = 0;
    for (const k of keys) {
      if (k >= from && k <= date) {
        sum += daily.get(k)!;
        n++;
      }
    }
    return { date, value: roundTo(sum / n, 1) };
  });
}

export type PeriodStats = {
  days: number;
  recordedDays: number;
  first: number | null;
  last: number | null;
  change: number | null;
  min: number | null;
  max: number | null;
  average: number | null;
};

/** Statistics of a daily series within [start, end] (Premium 期間別統計). */
export function periodStats(
  daily: ReadonlyMap<DateKey, number>,
  start: DateKey,
  end: DateKey,
): PeriodStats {
  const entries = [...daily.entries()]
    .filter(([k]) => k >= start && k <= end)
    .sort(([a], [b]) => a.localeCompare(b));
  const values = entries.map(([, v]) => v);
  const first = values[0] ?? null;
  const last = values.at(-1) ?? null;
  return {
    days: diffDays(start, end) + 1,
    recordedDays: values.length,
    first,
    last,
    change: first !== null && last !== null ? roundTo(last - first, 1) : null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    average: values.length ? roundTo(values.reduce((a, b) => a + b, 0) / values.length, 1) : null,
  };
}

export type GoalStatus = {
  startKg: number;
  currentKg: number;
  targetKg: number;
  /** 0..1 */
  progress: number;
  /** kg still to go toward the target (0 when reached) */
  remainingKg: number;
  reached: boolean;
};

/**
 * Progress toward the target weight. The start weight is the goal's start weight, or the first
 * recorded weight. Uses the latest daily value; no projection of future dates (MVP).
 */
export function goalStatus(p: {
  startKg: number | null;
  targetKg: number | null;
  currentKg: number | null;
  firstRecordedKg: number | null;
}): GoalStatus | null {
  const start = p.startKg ?? p.firstRecordedKg;
  if (start === null || p.targetKg === null || p.currentKg === null) return null;
  const progress = goalProgress(start, p.currentKg, p.targetKg);
  const remaining = roundTo(Math.abs(p.targetKg - p.currentKg), 1);
  const losing = p.targetKg < start;
  const reached =
    start === p.targetKg
      ? progress === 1
      : losing
        ? p.currentKg <= p.targetKg
        : p.currentKg >= p.targetKg;
  return {
    startKg: start,
    currentKg: p.currentKg,
    targetKg: p.targetKg,
    progress,
    remainingKg: reached ? 0 : remaining,
    reached,
  };
}
