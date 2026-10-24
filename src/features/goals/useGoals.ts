/**
 * Current nutrition / body goals. `null` = not set yet (onboarding is Phase 2).
 * Screens must handle unset goals gracefully instead of assuming defaults.
 */
export type Goals = {
  calorieKcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbohydrateG: number | null;
  targetWeightKg: number | null;
  startWeightKg: number | null;
};

const UNSET: Goals = {
  calorieKcal: null,
  proteinG: null,
  fatG: null,
  carbohydrateG: null,
  targetWeightKg: null,
  startWeightKg: null,
};

export function useGoals(): Goals {
  // TODO(Phase 2): read from nutrition_goals / profiles via repository.
  return UNSET;
}
