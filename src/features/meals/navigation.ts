import { router } from 'expo-router';

import type { FoodRecord } from '@/data/repo/foods';
import type { DateKey } from '@/domain/date';
import type { MealType } from '@/domain/mealType';

import { ensureFoodCached } from './hooks';

export type FoodTarget =
  { kind: 'meal'; date: DateKey; mealType: MealType } | { kind: 'template'; templateId: string };

/** Opens the amount screen for a food (caching server foods first so they work offline). */
export async function openFood(food: FoodRecord, target: FoodTarget) {
  await ensureFoodCached(food);
  router.push({
    pathname: '/food/[id]',
    params:
      target.kind === 'meal'
        ? { id: food.id, source: food.source, date: target.date, mealType: target.mealType }
        : { id: food.id, source: food.source, templateId: target.templateId },
  });
}
