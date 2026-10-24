import { roundTo } from './nutrition';

export type Sex = 'male' | 'female' | 'unspecified';
export type ActivityLevel = 'low' | 'moderate' | 'high';
export type GoalType = 'lose' | 'maintain' | 'gain';

export const ACTIVITY_LABELS: Record<ActivityLevel, { label: string; description: string }> = {
  low: { label: '低い', description: '生活の大部分が座位で、静的な活動が中心' },
  moderate: { label: 'ふつう', description: '座位中心だが、通勤・家事・軽い運動などを含む' },
  high: { label: '高い', description: '移動や立位の多い仕事、または活発な運動習慣がある' },
};

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  lose: '減量',
  maintain: '維持',
  gain: '増量',
};

/**
 * 身体活動レベル（日本人の食事摂取基準 2020年版 の I / II / III の代表値）。
 * 実装時点の値。公開前に最新版の基準を確認すること（docs/MVP_SPEC.md §8）。
 */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  low: 1.5,
  moderate: 1.75,
  high: 2.0,
};

/** Daily adjustment applied to the estimated expenditure for each goal (kcal). Modest by design. */
export const GOAL_ADJUSTMENT_KCAL: Record<GoalType, number> = {
  lose: -300,
  maintain: 0,
  gain: 250,
};

export function ageOn(birthDate: string, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age--;
  return age >= 0 && age < 130 ? age : null;
}

/**
 * Estimated basal metabolic rate (kcal/day) — 国立健康・栄養研究所の式 (Ganpule et al., 2007):
 *   (0.0481 × 体重kg + 0.0234 × 身長cm − 0.0138 × 年齢 − 定数) × 1000 / 4.186
 *   定数: 男性 0.4235 / 女性 0.9708
 * Returns null when inputs are missing (sex must be male/female for this formula).
 */
export function estimateBmr(p: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
}): number | null {
  if (p.sex === 'unspecified') return null;
  if (!(p.weightKg > 0 && p.heightCm > 0 && p.age >= 18)) return null;
  const c = p.sex === 'male' ? 0.4235 : 0.9708;
  return ((0.0481 * p.weightKg + 0.0234 * p.heightCm - 0.0138 * p.age - c) * 1000) / 4.186;
}

export type CalorieEstimate = {
  bmr: number;
  tdee: number;
  /** Suggested daily intake goal, never below the estimated BMR. */
  goalKcal: number;
};

export function estimateCalorieGoal(p: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  activity: ActivityLevel;
  goalType: GoalType;
}): CalorieEstimate | null {
  const bmr = estimateBmr(p);
  if (bmr === null) return null;
  const tdee = bmr * ACTIVITY_FACTORS[p.activity];
  const goal = Math.max(tdee + GOAL_ADJUSTMENT_KCAL[p.goalType], bmr);
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), goalKcal: Math.round(goal / 10) * 10 };
}

/** Default PFC energy ratio (within 食事摂取基準 の目標量: P13–20%, F20–30%, C50–65%). */
export const DEFAULT_PFC_RATIO = { protein: 0.2, fat: 0.25, carbohydrate: 0.55 } as const;

export function pfcGramsFromCalories(
  kcal: number,
  ratio: { protein: number; fat: number; carbohydrate: number } = DEFAULT_PFC_RATIO,
) {
  return {
    proteinG: roundTo((kcal * ratio.protein) / 4, 0),
    fatG: roundTo((kcal * ratio.fat) / 9, 0),
    carbohydrateG: roundTo((kcal * ratio.carbohydrate) / 4, 0),
  };
}

export function inferGoalType(currentKg: number, targetKg: number): GoalType {
  if (targetKg < currentKg - 0.5) return 'lose';
  if (targetKg > currentKg + 0.5) return 'gain';
  return 'maintain';
}

export const CALORIE_GOAL_MIN = 800;
export const CALORIE_GOAL_MAX = 6000;

/** Gentle warnings for extreme goals. Saving is still allowed. */
export function goalWarnings(p: {
  calorieKcal: number;
  bmr: number | null;
  currentKg: number | null;
  targetKg: number | null;
}): string[] {
  const w: string[] = [];
  if (p.bmr !== null && p.calorieKcal < p.bmr) {
    w.push('目標摂取カロリーが推定基礎代謝量を下回っています。無理のない範囲で設定しましょう。');
  }
  if (p.calorieKcal < 1200) {
    w.push(
      '1日の摂取カロリーがかなり少ない設定です。体調に不安がある場合は医師等に相談してください。',
    );
  }
  if (p.currentKg !== null && p.targetKg !== null && p.currentKg > 0) {
    const ratio = p.targetKg / p.currentKg;
    if (ratio < 0.8) {
      w.push('目標体重が現在の体重から大きく離れています。段階的な目標もおすすめです。');
    }
  }
  return w;
}
