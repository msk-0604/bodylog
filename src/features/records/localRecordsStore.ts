import * as Crypto from 'expo-crypto';
import { create } from 'zustand';

import { toDateKey } from '@/domain/date';
import type { MealType } from '@/domain/mealType';
import type { Nutrients } from '@/domain/nutrition';
import type { WeightMeasurement } from '@/domain/weight';

/**
 * TEMPORARY in-memory record store (Phase 1).
 *
 * Data lives only for the current app session. Phase 3–5 replace this with the
 * SQLite-backed repository + Supabase sync described in docs/ARCHITECTURE.md;
 * the shapes below mirror the planned tables so screens don't need to change.
 * Client-generated UUIDs are used so that the same record can be synced idempotently.
 */

export type MealItemRecord = {
  id: string;
  eatenOn: string;
  mealType: MealType;
  foodName: string;
  grams: number;
  nutrients: Nutrients;
};

export type ExerciseRecord = {
  id: string;
  performedOn: string;
  name: string;
  durationMin: number;
  kcal: number | null;
};

type NewWeight = { weightKg: number; bodyFatPct: number | null; measuredAt: Date };

type LocalRecordsState = {
  weights: WeightMeasurement[];
  mealItems: MealItemRecord[];
  exercises: ExerciseRecord[];
  addWeight: (input: NewWeight) => WeightMeasurement;
  removeWeight: (id: string) => void;
};

export const useLocalRecords = create<LocalRecordsState>()((set) => ({
  weights: [],
  mealItems: [],
  exercises: [],
  addWeight: ({ weightKg, bodyFatPct, measuredAt }) => {
    const record: WeightMeasurement = {
      id: Crypto.randomUUID(),
      weightKg,
      bodyFatPct,
      measuredAt,
      measuredOn: toDateKey(measuredAt),
    };
    set((s) => ({ weights: [...s.weights, record] }));
    return record;
  },
  removeWeight: (id) => set((s) => ({ weights: s.weights.filter((w) => w.id !== id) })),
}));
