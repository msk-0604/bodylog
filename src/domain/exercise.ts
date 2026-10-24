import { roundTo } from './nutrition';

/**
 * Estimated exercise energy expenditure (kcal), shown to users as 「推定」.
 *
 * Formula (健康づくりのための身体活動基準 等で用いられる簡易式):
 *   kcal = METs × 体重(kg) × 時間(h) × 1.05
 *
 * To avoid double counting with the activity level already included in the
 * daily goal, the app uses *net* METs (METs − 1) when the user enables
 * "運動消費を残りカロリーに反映" (see docs/MVP_SPEC.md).
 */
export function estimateExerciseKcal(params: {
  mets: number;
  weightKg: number;
  durationMin: number;
  net?: boolean;
}): number {
  const { mets, weightKg, durationMin, net = false } = params;
  if (!(mets > 0) || !(weightKg > 0) || !(durationMin > 0)) return 0;
  const effective = net ? Math.max(mets - 1, 0) : mets;
  return roundTo(effective * weightKg * (durationMin / 60) * 1.05, 0);
}
