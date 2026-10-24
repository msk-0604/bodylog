import { roundTo } from './nutrition';

export const EXERCISE_TYPES = [
  'walking',
  'running',
  'cycling',
  'strength',
  'swimming',
  'other',
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  walking: 'ウォーキング',
  running: 'ランニング',
  cycling: '自転車',
  strength: '筋トレ',
  swimming: '水泳',
  other: 'その他',
};

export const INTENSITIES = ['light', 'moderate', 'hard'] as const;
export type Intensity = (typeof INTENSITIES)[number];

/**
 * METs by type and intensity. Values follow the 国立健康・栄養研究所「改訂版 身体活動のメッツ(METs)表」
 * (2012, based on the Compendium of Physical Activities 2011). Representative activities are noted
 * so the user can pick the closest one. VERIFY against the source table before release
 * (docs/MVP_SPEC.md §7). `other` has no estimate: the user enters kcal or leaves it empty.
 */
export const METS_TABLE: Record<
  Exclude<ExerciseType, 'other'>,
  Record<Intensity, { mets: number; label: string }>
> = {
  walking: {
    light: { mets: 2.8, label: 'ゆっくり（時速3.2km程度）' },
    moderate: { mets: 3.0, label: 'ふつう（時速4.0km程度）' },
    hard: { mets: 4.3, label: '速歩（時速5.6km程度）' },
  },
  running: {
    light: { mets: 6.0, label: 'ジョギング（時速6.4km程度）' },
    moderate: { mets: 8.3, label: 'ふつう（時速8.0km程度）' },
    hard: { mets: 9.8, label: '速め（時速9.7km程度）' },
  },
  cycling: {
    light: { mets: 4.0, label: 'ゆっくり（時速16km未満）' },
    moderate: { mets: 6.8, label: 'ふつう（時速16〜19km）' },
    hard: { mets: 8.0, label: '速め（時速19〜22km）' },
  },
  strength: {
    light: { mets: 3.5, label: '軽い（自重・軽い負荷）' },
    moderate: { mets: 5.0, label: 'ふつう' },
    hard: { mets: 6.0, label: '高強度' },
  },
  swimming: {
    light: { mets: 6.0, label: 'ゆっくり・水中運動' },
    moderate: { mets: 8.3, label: 'クロール（ゆっくり）' },
    hard: { mets: 9.8, label: 'クロール（速め）' },
  },
};

export function metsFor(type: ExerciseType, intensity: Intensity): number | null {
  return type === 'other' ? null : METS_TABLE[type][intensity].mets;
}

/** Resting expenditure for a duration (1 MET), used to avoid double counting. */
export function restingKcal(weightKg: number, durationMin: number): number {
  return weightKg * (durationMin / 60) * 1.05;
}

/**
 * Exercise kcal that may be added to the day's budget. The daily goal already includes resting
 * expenditure (activity level), so only the part above rest counts:
 * - with METs: (METs − 1) × kg × h × 1.05
 * - manual kcal: kcal − resting kcal (when the weight is known), never below 0
 */
export function netExerciseKcal(p: {
  kcal: number | null;
  mets: number | null;
  durationMin: number;
  weightKg: number | null;
}): number {
  if (p.mets !== null && p.weightKg !== null) {
    return roundTo(Math.max(p.mets - 1, 0) * p.weightKg * (p.durationMin / 60) * 1.05, 0);
  }
  if (p.kcal === null) return 0;
  if (p.weightKg === null) return roundTo(p.kcal, 0);
  return roundTo(Math.max(p.kcal - restingKcal(p.weightKg, p.durationMin), 0), 0);
}

export type SetInput = { exerciseName: string; weightKg: number | null; reps: number | null };

/** Training volume (Σ weight × reps) per exercise, in input order. */
export function volumeByExercise(
  sets: readonly SetInput[],
): { name: string; sets: number; volumeKg: number }[] {
  const out = new Map<string, { name: string; sets: number; volumeKg: number }>();
  for (const s of sets) {
    const name = s.exerciseName.trim();
    if (!name) continue;
    const cur = out.get(name) ?? { name, sets: 0, volumeKg: 0 };
    cur.sets++;
    cur.volumeKg += (s.weightKg ?? 0) * (s.reps ?? 0);
    out.set(name, cur);
  }
  return [...out.values()].map((v) => ({ ...v, volumeKg: roundTo(v.volumeKg, 1) }));
}

export const DURATION_MAX_MIN = 1440;
export const SET_WEIGHT_MAX_KG = 1000;
export const REPS_MAX = 1000;
