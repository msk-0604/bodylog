import { addDays, diffDays, type DateKey } from './date';
import { roundTo } from './nutrition';

export type WeightMeasurement = {
  id: string;
  weightKg: number;
  bodyFatPct: number | null;
  measuredAt: Date;
  measuredOn: DateKey;
};

export const WEIGHT_MIN_KG = 20;
export const WEIGHT_MAX_KG = 300;
export const BODY_FAT_MIN_PCT = 1;
export const BODY_FAT_MAX_PCT = 75;

export function isValidWeightKg(v: number): boolean {
  return Number.isFinite(v) && v >= WEIGHT_MIN_KG && v <= WEIGHT_MAX_KG;
}

export function isValidBodyFatPct(v: number): boolean {
  return Number.isFinite(v) && v >= BODY_FAT_MIN_PCT && v <= BODY_FAT_MAX_PCT;
}

/** Parse user input like "65.4" / "６５．４". Returns null when not a number. Accepts 0.1 kg precision. */
export function parseDecimalInput(text: string): number | null {
  const normalized = text
    .normalize('NFKC')
    .replace(/[,，\s]/g, '')
    .replace('。', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return roundTo(Number(normalized), 1);
}

function sortByTime(ms: readonly WeightMeasurement[]): WeightMeasurement[] {
  return [...ms].sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
}

export function latestMeasurement(ms: readonly WeightMeasurement[]): WeightMeasurement | null {
  return sortByTime(ms).at(-1) ?? null;
}

/** Difference between the latest and the previous measurement (any day). */
export function changeFromPrevious(ms: readonly WeightMeasurement[]): number | null {
  const sorted = sortByTime(ms);
  const last = sorted.at(-1);
  const prev = sorted.at(-2);
  if (!last || !prev) return null;
  return roundTo(last.weightKg - prev.weightKg, 1);
}

/**
 * One representative value per day: the earliest measurement of that day
 * (morning weigh-ins are the most comparable). Days without records are absent — never 0.
 */
export function dailyWeights(ms: readonly WeightMeasurement[]): Map<DateKey, number> {
  const map = new Map<DateKey, number>();
  for (const m of sortByTime(ms)) {
    if (!map.has(m.measuredOn)) map.set(m.measuredOn, m.weightKg);
  }
  return map;
}

/**
 * Average of the daily values within the `days` calendar days ending at `end` (inclusive).
 * Returns null when there is no record in the window.
 */
export function averageOverDays(
  daily: ReadonlyMap<DateKey, number>,
  end: DateKey,
  days: number,
): number | null {
  const start = addDays(end, -(days - 1));
  let sum = 0;
  let count = 0;
  for (const [key, v] of daily) {
    const offset = diffDays(start, key);
    if (offset >= 0 && offset < days) {
      sum += v;
      count++;
    }
  }
  return count === 0 ? null : roundTo(sum / count, 1);
}

/** Trailing moving average for each day that has a record. */
export function movingAverage(
  daily: ReadonlyMap<DateKey, number>,
  windowDays = 7,
): { date: DateKey; value: number }[] {
  const keys = [...daily.keys()].sort();
  return keys.map((date) => ({
    date,
    value: averageOverDays(daily, date, windowDays) as number,
  }));
}

/**
 * Progress from start toward goal, 0..1. Works for loss, gain and maintenance.
 * - Maintenance (start === goal): 1 when within ±0.5 kg of goal, else 0.
 * - Moving away from the goal yields 0; passing the goal is clamped to 1.
 */
export function goalProgress(startKg: number, currentKg: number, goalKg: number): number {
  const total = goalKg - startKg;
  if (total === 0) return Math.abs(currentKg - goalKg) <= 0.5 ? 1 : 0;
  const done = currentKg - startKg;
  return Math.min(Math.max(done / total, 0), 1);
}
