import { create } from 'zustand';

import { toDateKey, type DateKey } from '@/domain/date';
import { suggestMealType, type MealType } from '@/domain/mealType';

/** Selected day / meal type on the 食事 tab (kept while moving between screens). */
export const useMealsUi = create<{
  date: DateKey;
  mealType: MealType;
  setDate: (d: DateKey) => void;
  setMealType: (m: MealType) => void;
}>()((set) => ({
  date: toDateKey(new Date()),
  mealType: suggestMealType(new Date()),
  setDate: (date) => set({ date }),
  setMealType: (mealType) => set({ mealType }),
}));
