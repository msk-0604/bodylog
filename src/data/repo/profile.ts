import type { DateKey } from '@/domain/date';
import type { ActivityLevel, GoalType, Sex } from '@/domain/goals';

import type { SqlDb, SqlValue } from '../db/types';
import { insertRow, newId, nowIso, num, updateRow } from './common';

export type Profile = {
  id: string;
  nickname: string | null;
  heightCm: number | null;
  birthDate: string | null;
  sex: Sex | null;
  activityLevel: ActivityLevel | null;
  termsVersion: string | null;
  termsAcceptedAt: string | null;
  onboardingCompletedAt: string | null;
};

type ProfileRow = {
  id: string;
  nickname: string | null;
  height_cm: number | null;
  birth_date: string | null;
  sex: string | null;
  activity_level: string | null;
  terms_version: string | null;
  terms_accepted_at: string | null;
  onboarding_completed_at: string | null;
};

export async function getProfile(db: SqlDb, userId: string): Promise<Profile | null> {
  const r = await db.get<ProfileRow>('SELECT * FROM profiles WHERE id = ?', [userId]);
  if (!r) return null;
  return {
    id: r.id,
    nickname: r.nickname,
    heightCm: num(r.height_cm),
    birthDate: r.birth_date,
    sex: (r.sex as Sex | null) ?? null,
    activityLevel: (r.activity_level as ActivityLevel | null) ?? null,
    termsVersion: r.terms_version,
    termsAcceptedAt: r.terms_accepted_at,
    onboardingCompletedAt: r.onboarding_completed_at,
  };
}

export type ProfilePatch = Partial<{
  nickname: string | null;
  height_cm: number | null;
  birth_date: string | null;
  sex: Sex | null;
  activity_level: ActivityLevel | null;
  time_zone: string;
  terms_version: string;
  terms_accepted_at: string;
  privacy_version: string;
  privacy_accepted_at: string;
  onboarding_completed_at: string;
}>;

/** Updates (or creates locally) the user's profile row. */
export async function saveProfile(db: SqlDb, userId: string, patch: ProfilePatch): Promise<void> {
  await db.transaction(async (tx) => {
    const exists = await tx.get('SELECT 1 FROM profiles WHERE id = ?', [userId]);
    const values = patch as Record<string, SqlValue>;
    if (exists) await updateRow(tx, 'profiles', userId, values);
    else await insertRow(tx, 'profiles', { id: userId, created_at: nowIso(), ...values });
  });
}

/* ---------------- Goals (history by effective_from) ---------------- */

export type Goal = {
  id: string;
  effectiveFrom: DateKey;
  goalType: GoalType;
  calorieKcal: number;
  proteinG: number | null;
  fatG: number | null;
  carbohydrateG: number | null;
  startWeightKg: number | null;
  targetWeightKg: number | null;
  calorieSource: 'manual' | 'estimate';
};

type GoalRow = {
  id: string;
  effective_from: string;
  goal_type: string;
  calorie_kcal: number;
  protein_g: number | null;
  fat_g: number | null;
  carbohydrate_g: number | null;
  start_weight_kg: number | null;
  target_weight_kg: number | null;
  calorie_source: string;
};

const toGoal = (r: GoalRow): Goal => ({
  id: r.id,
  effectiveFrom: r.effective_from as DateKey,
  goalType: r.goal_type as GoalType,
  calorieKcal: Number(r.calorie_kcal),
  proteinG: num(r.protein_g),
  fatG: num(r.fat_g),
  carbohydrateG: num(r.carbohydrate_g),
  startWeightKg: num(r.start_weight_kg),
  targetWeightKg: num(r.target_weight_kg),
  calorieSource: r.calorie_source === 'estimate' ? 'estimate' : 'manual',
});

/** Goal in effect on `date` (latest effective_from <= date). */
export async function getGoalForDate(
  db: SqlDb,
  userId: string,
  date: DateKey,
): Promise<Goal | null> {
  const r = await db.get<GoalRow>(
    `SELECT * FROM nutrition_goals WHERE user_id = ? AND effective_from <= ?
     ORDER BY effective_from DESC LIMIT 1`,
    [userId, date],
  );
  return r ? toGoal(r) : null;
}

export type GoalInput = Omit<Goal, 'id' | 'effectiveFrom'>;

/** Saves the goal effective from `today` (updates today's row if it exists, keeping history). */
export async function saveGoal(
  db: SqlDb,
  userId: string,
  today: DateKey,
  g: GoalInput,
): Promise<void> {
  const values: Record<string, SqlValue> = {
    goal_type: g.goalType,
    calorie_kcal: Math.round(g.calorieKcal),
    protein_g: g.proteinG,
    fat_g: g.fatG,
    carbohydrate_g: g.carbohydrateG,
    start_weight_kg: g.startWeightKg,
    target_weight_kg: g.targetWeightKg,
    calorie_source: g.calorieSource,
  };
  await db.transaction(async (tx) => {
    const existing = await tx.get<{ id: string }>(
      'SELECT id FROM nutrition_goals WHERE user_id = ? AND effective_from = ?',
      [userId, today],
    );
    if (existing) await updateRow(tx, 'nutrition_goals', existing.id, values);
    else
      await insertRow(tx, 'nutrition_goals', {
        id: newId(),
        user_id: userId,
        effective_from: today,
        exercise_minutes_per_week: null,
        created_at: nowIso(),
        ...values,
      });
  });
}

/* ---------------- meta (device-local key/value) ---------------- */

export async function getMeta(db: SqlDb, key: string): Promise<string | null> {
  const r = await db.get<{ value: string | null }>('SELECT value FROM meta WHERE key = ?', [key]);
  return r?.value ?? null;
}

export async function setMeta(db: SqlDb, key: string, value: string | null): Promise<void> {
  await db.run(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}
