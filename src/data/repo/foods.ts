import type { Nutrients } from '@/domain/nutrition';
import { escapeLike, normalizeForSearch } from '@/domain/searchNormalize';

import type { SqlDb, SqlValue } from '../db/types';
import { insertRow, newId, nowIso, num, softDelete, updateRow } from './common';

export type FoodSource = 'master' | 'custom';
export type FoodRef = { source: FoodSource; id: string };

export type ValueFlag = 'trace' | 'estimated' | 'missing' | 'zero_estimated';

export type FoodRecord = FoodRef & {
  name: string;
  foodCode: string | null;
  categoryName: string | null;
  per100g: Nutrients;
  valueFlags: Partial<Record<keyof Nutrients, ValueFlag>>;
  sourceVersion: string | null;
  serving: { label: string; grams: number } | null;
};

/** Row shape returned by the server RPC `search_foods` / food_master select. */
export type MasterFoodRow = {
  id: string;
  food_code: string;
  name: string;
  category_code: string | null;
  category_name: string | null;
  energy_kcal: number | string | null;
  protein_g: number | string | null;
  fat_g: number | string | null;
  carbohydrate_g: number | string | null;
  value_flags: Record<string, string> | string | null;
  source_version: string | null;
};

const FLAG_KEYS: Record<string, keyof Nutrients> = {
  energy_kcal: 'energyKcal',
  protein_g: 'proteinG',
  fat_g: 'fatG',
  carbohydrate_g: 'carbohydrateG',
};

function parseFlags(raw: unknown): FoodRecord['valueFlags'] {
  let obj: Record<string, string> = {};
  try {
    obj = typeof raw === 'string' ? JSON.parse(raw) : ((raw as Record<string, string>) ?? {});
  } catch {
    obj = {};
  }
  const out: FoodRecord['valueFlags'] = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = FLAG_KEYS[k];
    if (key) out[key] = v as ValueFlag;
  }
  return out;
}

type CacheRow = {
  id: string;
  food_code: string;
  name: string;
  category_name: string | null;
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbohydrate_g: number | null;
  value_flags: string;
  source_version: string | null;
};

type CustomRow = {
  id: string;
  name: string;
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbohydrate_g: number | null;
  serving_label: string | null;
  serving_grams: number | null;
};

export function masterRowToFood(r: MasterFoodRow | CacheRow): FoodRecord {
  return {
    source: 'master',
    id: r.id,
    name: r.name,
    foodCode: r.food_code,
    categoryName: r.category_name,
    per100g: {
      energyKcal: num(r.energy_kcal),
      proteinG: num(r.protein_g),
      fatG: num(r.fat_g),
      carbohydrateG: num(r.carbohydrate_g),
    },
    valueFlags: parseFlags(r.value_flags),
    sourceVersion: r.source_version,
    serving: null,
  };
}

function customRowToFood(r: CustomRow): FoodRecord {
  return {
    source: 'custom',
    id: r.id,
    name: r.name,
    foodCode: null,
    categoryName: 'マイ食品',
    per100g: {
      energyKcal: num(r.energy_kcal),
      proteinG: num(r.protein_g),
      fatG: num(r.fat_g),
      carbohydrateG: num(r.carbohydrate_g),
    },
    valueFlags: {},
    sourceVersion: null,
    serving:
      r.serving_label && r.serving_grams
        ? { label: r.serving_label, grams: Number(r.serving_grams) }
        : null,
  };
}

export async function cacheMasterFoods(db: SqlDb, rows: readonly MasterFoodRow[]): Promise<void> {
  if (rows.length === 0) return;
  const now = nowIso();
  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx.run(
        `INSERT INTO food_cache (id, food_code, name, search_text, category_code, category_name,
           energy_kcal, protein_g, fat_g, carbohydrate_g, value_flags, source_version, cached_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET food_code = excluded.food_code, name = excluded.name,
           search_text = excluded.search_text, category_code = excluded.category_code,
           category_name = excluded.category_name, energy_kcal = excluded.energy_kcal,
           protein_g = excluded.protein_g, fat_g = excluded.fat_g,
           carbohydrate_g = excluded.carbohydrate_g, value_flags = excluded.value_flags,
           source_version = excluded.source_version, cached_at = excluded.cached_at`,
        [
          r.id,
          r.food_code,
          r.name,
          normalizeForSearch(r.name),
          r.category_code,
          r.category_name,
          num(r.energy_kcal),
          num(r.protein_g),
          num(r.fat_g),
          num(r.carbohydrate_g),
          typeof r.value_flags === 'string' ? r.value_flags : JSON.stringify(r.value_flags ?? {}),
          r.source_version,
          now,
        ],
      );
    }
  });
}

export async function getFood(db: SqlDb, userId: string, ref: FoodRef): Promise<FoodRecord | null> {
  if (ref.source === 'master') {
    const r = await db.get<CacheRow>('SELECT * FROM food_cache WHERE id = ?', [ref.id]);
    return r ? masterRowToFood(r) : null;
  }
  const r = await db.get<CustomRow>(
    'SELECT * FROM custom_foods WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [ref.id, userId],
  );
  return r ? customRowToFood(r) : null;
}

/** Searches the user's own foods and cached master foods (works offline). */
export async function searchLocalFoods(
  db: SqlDb,
  userId: string,
  query: string,
  limit = 30,
): Promise<FoodRecord[]> {
  const q = normalizeForSearch(query);
  if (!q) return [];
  const like = `%${escapeLike(q)}%`;
  const prefix = `${escapeLike(q)}%`;
  const custom = await db.all<CustomRow>(
    `SELECT * FROM custom_foods
     WHERE user_id = ? AND deleted_at IS NULL AND search_text LIKE ? ESCAPE '\\'
     ORDER BY (search_text LIKE ? ESCAPE '\\') DESC, length(search_text) LIMIT ?`,
    [userId, like, prefix, limit],
  );
  const cached = await db.all<CacheRow>(
    `SELECT * FROM food_cache WHERE search_text LIKE ? ESCAPE '\\'
     ORDER BY (search_text LIKE ? ESCAPE '\\') DESC, length(search_text), food_code LIMIT ?`,
    [like, prefix, limit],
  );
  return [...custom.map(customRowToFood), ...cached.map(masterRowToFood)].slice(0, limit);
}

/** Foods most recently logged by the user (distinct, newest first). */
export async function recentFoods(db: SqlDb, userId: string, limit = 15): Promise<FoodRecord[]> {
  const rows = await db.all<{ food_id: string | null; custom_food_id: string | null }>(
    `SELECT food_id, custom_food_id, MAX(created_at) AS last_used FROM meal_items
     WHERE user_id = ? AND deleted_at IS NULL
     GROUP BY food_id, custom_food_id ORDER BY last_used DESC LIMIT ?`,
    [userId, limit * 2],
  );
  const out: FoodRecord[] = [];
  for (const r of rows) {
    const ref: FoodRef | null = r.food_id
      ? { source: 'master', id: r.food_id }
      : r.custom_food_id
        ? { source: 'custom', id: r.custom_food_id }
        : null;
    if (!ref) continue;
    const food = await getFood(db, userId, ref);
    if (food) out.push(food);
    if (out.length >= limit) break;
  }
  return out;
}

export type CustomFoodInput = {
  name: string;
  per100g: Nutrients;
  serving: { label: string; grams: number } | null;
};

export async function createCustomFood(
  db: SqlDb,
  userId: string,
  input: CustomFoodInput,
): Promise<FoodRecord> {
  const id = newId();
  await db.transaction((tx) =>
    insertRow(tx, 'custom_foods', {
      id,
      user_id: userId,
      ...customFoodColumns(input),
      created_at: nowIso(),
      deleted_at: null,
    }),
  );
  return (await getFood(db, userId, { source: 'custom', id }))!;
}

export async function updateCustomFood(
  db: SqlDb,
  userId: string,
  id: string,
  input: CustomFoodInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const owned = await tx.get('SELECT 1 FROM custom_foods WHERE id = ? AND user_id = ?', [
      id,
      userId,
    ]);
    if (owned) await updateRow(tx, 'custom_foods', id, customFoodColumns(input));
  });
}

export async function deleteCustomFood(db: SqlDb, userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const owned = await tx.get('SELECT 1 FROM custom_foods WHERE id = ? AND user_id = ?', [
      id,
      userId,
    ]);
    if (owned) await softDelete(tx, 'custom_foods', id);
  });
}

function customFoodColumns(input: CustomFoodInput): Record<string, SqlValue> {
  const name = input.name.trim();
  return {
    name,
    search_text: normalizeForSearch(name),
    energy_kcal: input.per100g.energyKcal,
    protein_g: input.per100g.proteinG,
    fat_g: input.per100g.fatG,
    carbohydrate_g: input.per100g.carbohydrateG,
    serving_label: input.serving?.label ?? null,
    serving_grams: input.serving?.grams ?? null,
  };
}

/** Food ids referenced by favorites / templates / recent meals that are missing from the cache. */
export async function missingReferencedMasterFoodIds(db: SqlDb, userId: string): Promise<string[]> {
  const rows = await db.all<{ id: string }>(
    `SELECT DISTINCT food_id AS id FROM (
       SELECT food_id FROM food_favorites WHERE user_id = ? AND deleted_at IS NULL
       UNION ALL SELECT food_id FROM meal_template_items WHERE user_id = ? AND deleted_at IS NULL
       UNION ALL SELECT food_id FROM (
         SELECT food_id FROM meal_items WHERE user_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 100)
     ) WHERE food_id IS NOT NULL AND food_id NOT IN (SELECT id FROM food_cache)`,
    [userId, userId, userId],
  );
  return rows.map((r) => r.id);
}
