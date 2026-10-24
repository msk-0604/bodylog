import { netExerciseKcal } from './exerciseTypes';

export type ExerciseForBudget = { kcal: number | null; mets: number | null; durationMin: number };

/**
 * Day's calorie budget. When the user enables 「運動消費を残りカロリーに反映」, the net exercise
 * expenditure (above rest, see netExerciseKcal) is added to the goal. Off by default because the
 * activity level already includes typical activity.
 */
export function dailyBudget(p: {
  goalKcal: number | null;
  includeExercise: boolean;
  exercises: readonly ExerciseForBudget[];
  weightKg: number | null;
}): { goal: number | null; exerciseBonus: number; budget: number | null } {
  const bonus = p.includeExercise
    ? p.exercises.reduce((sum, e) => sum + netExerciseKcal({ ...e, weightKg: p.weightKg }), 0)
    : 0;
  return {
    goal: p.goalKcal,
    exerciseBonus: bonus,
    budget: p.goalKcal === null ? null : p.goalKcal + bonus,
  };
}
