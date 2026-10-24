import type { DateKey } from '@/domain/date';
import type { MealType } from '@/domain/mealType';
import {
  isValidGrams,
  roundTo,
  scaleNutrients,
  toStoredNutrients,
  type Nutrients,
} from '@/domain/nutrition';

import type { SqlDb, SqlExecutor } from '../db/types';
import { deviceTimeZone, insertRow, newId, nowIso, num, softDelete, updateRow } from './common';
import { getFood, type FoodRecord, type FoodRef } from './foods';

export type MealItemView = {
  id: string;
  entryId: string;
  date: DateKey;
  mealType: MealType;
  foodName: string;
  foodCode: string | null;
  foodRef: FoodRef | null;
  grams: number;
  quantity: number | null;
  unitLabel: string | null;
  nutrients: Nutrients;
  nutrientSourceVersion: string | null;
  createdAt: string;
  syncError: string | null;
};

type ItemRow = {
  id: string;
  meal_entry_id: string;
  eaten_on: string;
  meal_type: string;
  food_id: string | null;
  custom_food_id: string | null;
  food_name: string;
  food_code: string | null;
  grams: number;
  quantity: number | null;
  unit_label: string | null;
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbohydrate_g: number | null;
  nutrient_source_version: string | null;
  created_at: string;
  sync_error: string | null;
};

const ITEM_SELECT = `
  SELECT i.*, e.eaten_on, e.meal_type FROM meal_items i
  JOIN meal_entries e ON e.id = i.meal_entry_id
  WHERE i.user_id = ? AND i.deleted_at IS NULL AND e.deleted_at IS NULL`;

function toView(r: ItemRow): MealItemView {
  return {
    id: r.id,
    entryId: r.meal_entry_id,
    date: r.eaten_on as DateKey,
    mealType: r.meal_type as MealType,
    foodName: r.food_name,
    foodCode: r.food_code,
    foodRef: r.food_id
      ? { source: 'master', id: r.food_id }
      : r.custom_food_id
        ? { source: 'custom', id: r.custom_food_id }
        : null,
    grams: Number(r.grams),
    quantity: num(r.quantity),
    unitLabel: r.unit_label,
    nutrients: {
      energyKcal: num(r.energy_kcal),
      proteinG: num(r.protein_g),
      fatG: num(r.fat_g),
      carbohydrateG: num(r.carbohydrate_g),
    },
    nutrientSourceVersion: r.nutrient_source_version,
    createdAt: r.created_at,
    syncError: r.sync_error,
  };
}

export async function listMealItems(
  db: SqlDb,
  userId: string,
  date: DateKey,
): Promise<MealItemView[]> {
  const rows = await db.all<ItemRow>(
    `${ITEM_SELECT} AND e.eaten_on = ? ORDER BY e.eaten_at, i.sort_order, i.created_at`,
    [userId, date],
  );
  return rows.map(toView);
}

export async function getMealItem(
  db: SqlDb,
  userId: string,
  id: string,
): Promise<MealItemView | null> {
  const r = await db.get<ItemRow>(`${ITEM_SELECT} AND i.id = ?`, [userId, id]);
  return r ? toView(r) : null;
}

/** Dates (within range) that have at least one logged item. */
export async function datesWithMeals(
  db: SqlDb,
  userId: string,
  from: DateKey,
  to: DateKey,
): Promise<DateKey[]> {
  const rows = await db.all<{ eaten_on: string }>(
    `SELECT DISTINCT e.eaten_on FROM meal_entries e JOIN meal_items i ON i.meal_entry_id = e.id
     WHERE e.user_id = ? AND e.deleted_at IS NULL AND i.deleted_at IS NULL
       AND e.eaten_on BETWEEN ? AND ? ORDER BY e.eaten_on`,
    [userId, from, to],
  );
  return rows.map((r) => r.eaten_on as DateKey);
}

/** Instant for a record on `date`: now if today, otherwise `date` at the current local time. */
function instantFor(date: DateKey, now = new Date()): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const at = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
  return at.toISOString();
}

async function findOrCreateEntry(
  tx: SqlExecutor,
  userId: string,
  date: DateKey,
  mealType: MealType,
): Promise<string> {
  const existing = await tx.get<{ id: string }>(
    `SELECT id FROM meal_entries
     WHERE user_id = ? AND eaten_on = ? AND meal_type = ? AND deleted_at IS NULL
     ORDER BY created_at LIMIT 1`,
    [userId, date, mealType],
  );
  if (existing) return existing.id;
  const id = newId();
  await insertRow(tx, 'meal_entries', {
    id,
    user_id: userId,
    eaten_on: date,
    eaten_at: instantFor(date),
    time_zone: deviceTimeZone(),
    meal_type: mealType,
    note: null,
    created_at: nowIso(),
    deleted_at: null,
  });
  return id;
}

async function cleanupEmptyEntry(tx: SqlExecutor, entryId: string): Promise<void> {
  const left = await tx.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM meal_items WHERE meal_entry_id = ? AND deleted_at IS NULL',
    [entryId],
  );
  if (left && Number(left.n) === 0) await softDelete(tx, 'meal_entries', entryId);
}

export type AddItemInput = {
  date: DateKey;
  mealType: MealType;
  food: FoodRecord;
  grams: number;
  quantity?: number | null;
  unitLabel?: string | null;
};

async function insertItem(tx: SqlExecutor, userId: string, input: AddItemInput): Promise<string> {
  if (!isValidGrams(input.grams)) throw new RangeError('invalid grams');
  const entryId = await findOrCreateEntry(tx, userId, input.date, input.mealType);
  const n = toStoredNutrients(scaleNutrients(input.food.per100g, input.grams));
  const order = await tx.get<{ n: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM meal_items WHERE meal_entry_id = ?',
    [entryId],
  );
  const id = newId();
  await insertRow(tx, 'meal_items', {
    id,
    user_id: userId,
    meal_entry_id: entryId,
    food_id: input.food.source === 'master' ? input.food.id : null,
    custom_food_id: input.food.source === 'custom' ? input.food.id : null,
    food_name: input.food.name,
    food_code: input.food.foodCode,
    quantity: input.quantity ?? null,
    unit_label: input.unitLabel ?? null,
    grams: roundTo(input.grams, 1),
    energy_kcal: n.energyKcal,
    protein_g: n.proteinG,
    fat_g: n.fatG,
    carbohydrate_g: n.carbohydrateG,
    nutrient_source_version: input.food.sourceVersion,
    sort_order: Number(order?.n ?? 0),
    created_at: nowIso(),
    deleted_at: null,
  });
  return id;
}

export async function addMealItem(db: SqlDb, userId: string, input: AddItemInput): Promise<string> {
  return db.transaction((tx) => insertItem(tx, userId, input));
}

export async function addMealItems(
  db: SqlDb,
  userId: string,
  inputs: readonly AddItemInput[],
): Promise<string[]> {
  return db.transaction(async (tx) => {
    const ids: string[] = [];
    for (const input of inputs) ids.push(await insertItem(tx, userId, input));
    return ids;
  });
}

export type UpdateItemInput = {
  grams?: number;
  quantity?: number | null;
  unitLabel?: string | null;
  mealType?: MealType;
  date?: DateKey;
};

/**
 * Edits an item. Changing grams recomputes nutrients from the food's per-100 g values when the
 * same data version is available locally; otherwise the stored snapshot is scaled, so records
 * never silently switch to newer master data.
 */
export async function updateMealItem(
  db: SqlDb,
  userId: string,
  id: string,
  input: UpdateItemInput,
): Promise<void> {
  const current = await getMealItem(db, userId, id);
  if (!current) throw new Error('meal item not found');

  let nutrients: Nutrients | null = null;
  if (input.grams !== undefined && input.grams !== current.grams) {
    if (!isValidGrams(input.grams)) throw new RangeError('invalid grams');
    const food = current.foodRef ? await getFood(db, userId, current.foodRef) : null;
    if (food && food.sourceVersion === current.nutrientSourceVersion) {
      nutrients = toStoredNutrients(scaleNutrients(food.per100g, input.grams));
    } else {
      const ratio = input.grams / current.grams;
      const s = (v: number | null) => (v === null ? null : v * ratio);
      nutrients = toStoredNutrients({
        energyKcal: s(current.nutrients.energyKcal),
        proteinG: s(current.nutrients.proteinG),
        fatG: s(current.nutrients.fatG),
        carbohydrateG: s(current.nutrients.carbohydrateG),
      });
    }
  }

  await db.transaction(async (tx) => {
    const patch: Record<string, string | number | null> = {};
    if (nutrients && input.grams !== undefined) {
      patch.grams = roundTo(input.grams, 1);
      patch.energy_kcal = nutrients.energyKcal;
      patch.protein_g = nutrients.proteinG;
      patch.fat_g = nutrients.fatG;
      patch.carbohydrate_g = nutrients.carbohydrateG;
    }
    if (input.quantity !== undefined) patch.quantity = input.quantity;
    if (input.unitLabel !== undefined) patch.unit_label = input.unitLabel;

    const targetDate = input.date ?? current.date;
    const targetType = input.mealType ?? current.mealType;
    if (targetDate !== current.date || targetType !== current.mealType) {
      patch.meal_entry_id = await findOrCreateEntry(tx, userId, targetDate, targetType);
    }
    if (Object.keys(patch).length > 0) await updateRow(tx, 'meal_items', id, patch);
    if (patch.meal_entry_id) await cleanupEmptyEntry(tx, current.entryId);
  });
}

export async function deleteMealItem(db: SqlDb, userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await tx.get<{ meal_entry_id: string }>(
      'SELECT meal_entry_id FROM meal_items WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [id, userId],
    );
    if (!row) return;
    await softDelete(tx, 'meal_items', id);
    await cleanupEmptyEntry(tx, row.meal_entry_id);
  });
}

/**
 * Copies logged items from one day (optionally one meal type) to another day.
 * Nutrient snapshots are copied as-is (same values as the original record).
 */
export async function copyMeals(
  db: SqlDb,
  userId: string,
  params: { from: DateKey; to: DateKey; mealType?: MealType; toMealType?: MealType },
): Promise<number> {
  const source = (await listMealItems(db, userId, params.from)).filter(
    (i) => !params.mealType || i.mealType === params.mealType,
  );
  if (source.length === 0) return 0;
  await db.transaction(async (tx) => {
    for (const item of source) {
      const entryId = await findOrCreateEntry(
        tx,
        userId,
        params.to,
        params.toMealType ?? item.mealType,
      );
      await insertRow(tx, 'meal_items', {
        id: newId(),
        user_id: userId,
        meal_entry_id: entryId,
        food_id: item.foodRef?.source === 'master' ? item.foodRef.id : null,
        custom_food_id: item.foodRef?.source === 'custom' ? item.foodRef.id : null,
        food_name: item.foodName,
        food_code: item.foodCode,
        quantity: item.quantity,
        unit_label: item.unitLabel,
        grams: item.grams,
        energy_kcal: item.nutrients.energyKcal,
        protein_g: item.nutrients.proteinG,
        fat_g: item.nutrients.fatG,
        carbohydrate_g: item.nutrients.carbohydrateG,
        nutrient_source_version: item.nutrientSourceVersion,
        sort_order: 0,
        created_at: nowIso(),
        deleted_at: null,
      });
    }
  });
  return source.length;
}
