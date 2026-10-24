import type { DateKey } from '@/domain/date';
import { canCreateTemplate, type Plan } from '@/domain/entitlements';
import type { MealType } from '@/domain/mealType';
import { isValidGrams, roundTo, scaleNutrients, sumNutrients } from '@/domain/nutrition';

import type { SqlDb } from '../db/types';
import { insertRow, newId, nowIso, softDelete, updateRow } from './common';
import { getFood, type FoodRecord, type FoodRef } from './foods';
import { addMealItems, type AddItemInput } from './meals';

export type TemplateItem = {
  id: string;
  foodName: string;
  foodRef: FoodRef | null;
  /** null when the food is not available on this device (not cached / deleted) */
  food: FoodRecord | null;
  grams: number;
};

export type MealTemplate = {
  id: string;
  name: string;
  defaultMealType: MealType | null;
  createdAt: Date;
  items: TemplateItem[];
  /** Estimated kcal of available items (current food data). */
  energyKcal: number;
  syncError: string | null;
};

type TemplateRow = {
  id: string;
  name: string;
  default_meal_type: string | null;
  created_at: string;
  sync_error: string | null;
};
type TemplateItemRow = {
  id: string;
  food_id: string | null;
  custom_food_id: string | null;
  food_name: string;
  grams: number;
};

async function loadItems(db: SqlDb, userId: string, templateId: string): Promise<TemplateItem[]> {
  const rows = await db.all<TemplateItemRow>(
    `SELECT * FROM meal_template_items WHERE template_id = ? AND user_id = ? AND deleted_at IS NULL
     ORDER BY sort_order, created_at`,
    [templateId, userId],
  );
  const items: TemplateItem[] = [];
  for (const r of rows) {
    const ref: FoodRef | null = r.food_id
      ? { source: 'master', id: r.food_id }
      : r.custom_food_id
        ? { source: 'custom', id: r.custom_food_id }
        : null;
    items.push({
      id: r.id,
      foodName: r.food_name,
      foodRef: ref,
      food: ref ? await getFood(db, userId, ref) : null,
      grams: Number(r.grams),
    });
  }
  return items;
}

function toTemplate(r: TemplateRow, items: TemplateItem[]): MealTemplate {
  const available = items.filter((i) => i.food);
  return {
    id: r.id,
    name: r.name,
    defaultMealType: (r.default_meal_type as MealType | null) ?? null,
    createdAt: new Date(r.created_at),
    items,
    energyKcal: sumNutrients(available.map((i) => scaleNutrients(i.food!.per100g, i.grams)))
      .energyKcal,
    syncError: r.sync_error,
  };
}

export async function listTemplates(db: SqlDb, userId: string): Promise<MealTemplate[]> {
  const rows = await db.all<TemplateRow>(
    `SELECT * FROM meal_templates WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY sort_order, created_at`,
    [userId],
  );
  const out: MealTemplate[] = [];
  for (const r of rows) out.push(toTemplate(r, await loadItems(db, userId, r.id)));
  return out;
}

export async function getTemplate(
  db: SqlDb,
  userId: string,
  id: string,
): Promise<MealTemplate | null> {
  const r = await db.get<TemplateRow>(
    'SELECT * FROM meal_templates WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [id, userId],
  );
  return r ? toTemplate(r, await loadItems(db, userId, id)) : null;
}

export type CreateTemplateResult =
  { ok: true; id: string } | { ok: false; reason: 'limit' | 'empty' };

export async function createTemplate(
  db: SqlDb,
  userId: string,
  plan: Plan,
  input: {
    name: string;
    defaultMealType: MealType | null;
    items: readonly { food: FoodRecord; grams: number }[];
  },
): Promise<CreateTemplateResult> {
  const name = input.name.trim().slice(0, 40);
  if (!name) return { ok: false, reason: 'empty' };
  const count = await db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM meal_templates WHERE user_id = ? AND deleted_at IS NULL',
    [userId],
  );
  if (!canCreateTemplate(plan, Number(count?.n ?? 0))) return { ok: false, reason: 'limit' };
  const id = newId();
  await db.transaction(async (tx) => {
    await insertRow(tx, 'meal_templates', {
      id,
      user_id: userId,
      name,
      default_meal_type: input.defaultMealType,
      sort_order: 0,
      created_at: nowIso(),
      deleted_at: null,
    });
    let order = 0;
    for (const item of input.items) {
      if (!isValidGrams(item.grams)) continue;
      await insertRow(tx, 'meal_template_items', {
        id: newId(),
        user_id: userId,
        template_id: id,
        food_id: item.food.source === 'master' ? item.food.id : null,
        custom_food_id: item.food.source === 'custom' ? item.food.id : null,
        food_name: item.food.name,
        quantity: null,
        unit_label: null,
        grams: roundTo(item.grams, 1),
        sort_order: order++,
        created_at: nowIso(),
        deleted_at: null,
      });
    }
  });
  return { ok: true, id };
}

export async function renameTemplate(db: SqlDb, userId: string, id: string, name: string) {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return;
  await db.transaction(async (tx) => {
    const own = await tx.get('SELECT 1 FROM meal_templates WHERE id = ? AND user_id = ?', [
      id,
      userId,
    ]);
    if (own) await updateRow(tx, 'meal_templates', id, { name: trimmed });
  });
}

export async function setTemplateMealType(
  db: SqlDb,
  userId: string,
  id: string,
  mealType: MealType | null,
) {
  await db.transaction(async (tx) => {
    const own = await tx.get('SELECT 1 FROM meal_templates WHERE id = ? AND user_id = ?', [
      id,
      userId,
    ]);
    if (own) await updateRow(tx, 'meal_templates', id, { default_meal_type: mealType });
  });
}

export async function addTemplateItem(
  db: SqlDb,
  userId: string,
  templateId: string,
  food: FoodRecord,
  grams: number,
) {
  if (!isValidGrams(grams)) throw new RangeError('invalid grams');
  await db.transaction(async (tx) => {
    const own = await tx.get('SELECT 1 FROM meal_templates WHERE id = ? AND user_id = ?', [
      templateId,
      userId,
    ]);
    if (!own) return;
    const order = await tx.get<{ n: number }>(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM meal_template_items WHERE template_id = ?',
      [templateId],
    );
    await insertRow(tx, 'meal_template_items', {
      id: newId(),
      user_id: userId,
      template_id: templateId,
      food_id: food.source === 'master' ? food.id : null,
      custom_food_id: food.source === 'custom' ? food.id : null,
      food_name: food.name,
      quantity: null,
      unit_label: null,
      grams: roundTo(grams, 1),
      sort_order: Number(order?.n ?? 0),
      created_at: nowIso(),
      deleted_at: null,
    });
  });
}

export async function setTemplateItemGrams(
  db: SqlDb,
  userId: string,
  itemId: string,
  grams: number,
) {
  if (!isValidGrams(grams)) throw new RangeError('invalid grams');
  await db.transaction(async (tx) => {
    const own = await tx.get('SELECT 1 FROM meal_template_items WHERE id = ? AND user_id = ?', [
      itemId,
      userId,
    ]);
    if (own) await updateRow(tx, 'meal_template_items', itemId, { grams: roundTo(grams, 1) });
  });
}

export async function removeTemplateItem(db: SqlDb, userId: string, itemId: string) {
  await db.transaction(async (tx) => {
    const own = await tx.get('SELECT 1 FROM meal_template_items WHERE id = ? AND user_id = ?', [
      itemId,
      userId,
    ]);
    if (own) await softDelete(tx, 'meal_template_items', itemId);
  });
}

export async function deleteTemplate(db: SqlDb, userId: string, id: string) {
  await db.transaction(async (tx) => {
    const own = await tx.get('SELECT 1 FROM meal_templates WHERE id = ? AND user_id = ?', [
      id,
      userId,
    ]);
    if (!own) return;
    const items = await tx.all<{ id: string }>(
      'SELECT id FROM meal_template_items WHERE template_id = ? AND deleted_at IS NULL',
      [id],
    );
    for (const i of items) await softDelete(tx, 'meal_template_items', i.id);
    await softDelete(tx, 'meal_templates', id);
  });
}

/** Logs all available items of a template. Returns the names of items that were skipped. */
export async function applyTemplate(
  db: SqlDb,
  userId: string,
  templateId: string,
  date: DateKey,
  mealType: MealType,
): Promise<{ added: number; skipped: string[] }> {
  const t = await getTemplate(db, userId, templateId);
  if (!t) throw new Error('template not found');
  const inputs: AddItemInput[] = [];
  const skipped: string[] = [];
  for (const item of t.items) {
    if (item.food) inputs.push({ date, mealType, food: item.food, grams: item.grams });
    else skipped.push(item.foodName);
  }
  await addMealItems(db, userId, inputs);
  return { added: inputs.length, skipped };
}
