/**
 * Nutrition calculation.
 *
 * Rules (see docs/MVP_SPEC.md "栄養計算と丸め"):
 * - Food master values are per 100 g.
 * - Value for an amount = per100g × grams ÷ 100, computed at full precision.
 * - Unknown values are `null` and are never treated as 0.
 * - Rounding happens only at storage (1 decimal) and display time (kcal: integer, PFC: 1 decimal).
 */

export type Nutrients = {
  energyKcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbohydrateG: number | null;
};

export type NutrientKey = keyof Nutrients;

export const NUTRIENT_KEYS: readonly NutrientKey[] = [
  'energyKcal',
  'proteinG',
  'fatG',
  'carbohydrateG',
] as const;

/** Sum of nutrients plus which keys had at least one unknown contribution. */
export type NutrientTotals = {
  energyKcal: number;
  proteinG: number;
  fatG: number;
  carbohydrateG: number;
  incomplete: Record<NutrientKey, boolean>;
};

export const MAX_FOOD_GRAMS = 5000;

export function isValidGrams(grams: number): boolean {
  return Number.isFinite(grams) && grams > 0 && grams <= MAX_FOOD_GRAMS;
}

/** Round half away from zero to the given number of decimals, avoiding binary float artifacts. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const shifted = Math.abs(value) * factor;
  // Correct values like 1.005 that are stored as 1.00499999...
  const rounded = Math.round(Number(shifted.toPrecision(15)));
  return (Math.sign(value) * rounded) / factor || 0;
}

export function scaleNutrients(per100g: Nutrients, grams: number): Nutrients {
  if (!isValidGrams(grams)) {
    throw new RangeError(`grams must be > 0 and <= ${MAX_FOOD_GRAMS}: ${grams}`);
  }
  const scale = (v: number | null) => (v === null ? null : (v * grams) / 100);
  return {
    energyKcal: scale(per100g.energyKcal),
    proteinG: scale(per100g.proteinG),
    fatG: scale(per100g.fatG),
    carbohydrateG: scale(per100g.carbohydrateG),
  };
}

/** Values persisted in meal_items as a snapshot (1 decimal). */
export function toStoredNutrients(n: Nutrients): Nutrients {
  const r = (v: number | null) => (v === null ? null : roundTo(v, 1));
  return {
    energyKcal: r(n.energyKcal),
    proteinG: r(n.proteinG),
    fatG: r(n.fatG),
    carbohydrateG: r(n.carbohydrateG),
  };
}

export function sumNutrients(items: readonly Nutrients[]): NutrientTotals {
  const totals: NutrientTotals = {
    energyKcal: 0,
    proteinG: 0,
    fatG: 0,
    carbohydrateG: 0,
    incomplete: { energyKcal: false, proteinG: false, fatG: false, carbohydrateG: false },
  };
  for (const item of items) {
    for (const key of NUTRIENT_KEYS) {
      const v = item[key];
      if (v === null) {
        totals.incomplete[key] = true;
      } else {
        totals[key] += v;
      }
    }
  }
  return totals;
}

export type CalorieBalance = {
  intake: number;
  goal: number;
  /** Remaining kcal (0 when over). */
  remaining: number;
  /** Over-goal kcal (0 when not over). */
  over: number;
  /** intake / goal, not clamped (can exceed 1). 0 when goal is not positive. */
  ratio: number;
};

export function calorieBalance(intake: number, goal: number): CalorieBalance {
  const diff = goal - intake;
  return {
    intake,
    goal,
    remaining: Math.max(diff, 0),
    over: Math.max(-diff, 0),
    ratio: goal > 0 ? intake / goal : 0,
  };
}

const kcalFormatter = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });
const gramFormatter = new Intl.NumberFormat('ja-JP', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatKcal(value: number): string {
  return kcalFormatter.format(roundTo(value, 0));
}

export function formatGrams(value: number): string {
  return gramFormatter.format(roundTo(value, 1));
}
