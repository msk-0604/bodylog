import { canAddFavorite, type Plan } from '@/domain/entitlements';

import type { SqlDb } from '../db/types';
import { insertRow, newId, nowIso, softDelete, updateRow } from './common';
import { getFood, type FoodRecord, type FoodRef } from './foods';

export type Favorite = {
  id: string;
  food: FoodRecord;
  defaultGrams: number | null;
  syncError: string | null;
};

type FavRow = {
  id: string;
  food_id: string | null;
  custom_food_id: string | null;
  default_grams: number | null;
  sync_error: string | null;
};

function refOf(r: { food_id: string | null; custom_food_id: string | null }): FoodRef | null {
  if (r.food_id) return { source: 'master', id: r.food_id };
  if (r.custom_food_id) return { source: 'custom', id: r.custom_food_id };
  return null;
}

export async function countFavorites(db: SqlDb, userId: string): Promise<number> {
  const r = await db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM food_favorites WHERE user_id = ? AND deleted_at IS NULL',
    [userId],
  );
  return Number(r?.n ?? 0);
}

export async function listFavorites(db: SqlDb, userId: string): Promise<Favorite[]> {
  const rows = await db.all<FavRow>(
    `SELECT * FROM food_favorites WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY sort_order, created_at`,
    [userId],
  );
  const out: Favorite[] = [];
  for (const r of rows) {
    const ref = refOf(r);
    const food = ref ? await getFood(db, userId, ref) : null;
    if (food) {
      out.push({
        id: r.id,
        food,
        defaultGrams: r.default_grams === null ? null : Number(r.default_grams),
        syncError: r.sync_error,
      });
    }
  }
  return out;
}

async function findFavorite(db: SqlDb, userId: string, ref: FoodRef): Promise<string | null> {
  const col = ref.source === 'master' ? 'food_id' : 'custom_food_id';
  const r = await db.get<{ id: string }>(
    `SELECT id FROM food_favorites WHERE user_id = ? AND ${col} = ? AND deleted_at IS NULL`,
    [userId, ref.id],
  );
  return r?.id ?? null;
}

export async function isFavorite(db: SqlDb, userId: string, ref: FoodRef): Promise<boolean> {
  return (await findFavorite(db, userId, ref)) !== null;
}

export type AddFavoriteResult = { ok: true } | { ok: false; reason: 'limit' };

export async function addFavorite(
  db: SqlDb,
  userId: string,
  ref: FoodRef,
  plan: Plan,
  defaultGrams: number | null = null,
): Promise<AddFavoriteResult> {
  if (await findFavorite(db, userId, ref)) return { ok: true };
  if (!canAddFavorite(plan, await countFavorites(db, userId)))
    return { ok: false, reason: 'limit' };
  const order = await db.get<{ n: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM food_favorites WHERE user_id = ?',
    [userId],
  );
  await db.transaction((tx) =>
    insertRow(tx, 'food_favorites', {
      id: newId(),
      user_id: userId,
      food_id: ref.source === 'master' ? ref.id : null,
      custom_food_id: ref.source === 'custom' ? ref.id : null,
      default_grams: defaultGrams,
      sort_order: Number(order?.n ?? 0),
      created_at: nowIso(),
      deleted_at: null,
    }),
  );
  return { ok: true };
}

export async function removeFavorite(db: SqlDb, userId: string, ref: FoodRef): Promise<void> {
  const id = await findFavorite(db, userId, ref);
  if (id) await db.transaction((tx) => softDelete(tx, 'food_favorites', id));
}

/** Moves a favorite one position up or down. */
export async function moveFavorite(
  db: SqlDb,
  userId: string,
  id: string,
  direction: -1 | 1,
): Promise<void> {
  const ids = (await listFavorites(db, userId)).map((f) => f.id);
  const i = ids.indexOf(id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  await db.transaction(async (tx) => {
    for (let k = 0; k < ids.length; k++) {
      await updateRow(tx, 'food_favorites', ids[k]!, { sort_order: k });
    }
  });
}
