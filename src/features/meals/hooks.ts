import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { getDb } from '@/data/db/expoDb';
import { useLocalQuery } from '@/data/hooks';
import { countFavorites, listFavorites } from '@/data/repo/favorites';
import {
  cacheMasterFoods,
  masterRowToFood,
  recentFoods,
  searchLocalFoods,
  type FoodRecord,
} from '@/data/repo/foods';
import { listMealItems } from '@/data/repo/meals';
import { listTemplates } from '@/data/repo/templates';
import { createSupabaseRemote } from '@/data/sync/supabaseRemote';
import type { DateKey } from '@/domain/date';
import { normalizeForSearch } from '@/domain/searchNormalize';
import { useSession } from '@/features/auth/session';
import { isLocalMode } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';

export function useMealItems(date: DateKey) {
  return useLocalQuery(['meals', date], (db, uid) => listMealItems(db, uid, date));
}

export function useFavorites() {
  return useLocalQuery(['favorites'], (db, uid) => listFavorites(db, uid));
}

export function useFavoriteCount() {
  return useLocalQuery(['favorites', 'count'], (db, uid) => countFavorites(db, uid));
}

export function useRecentFoods() {
  return useLocalQuery(['recentFoods'], (db, uid) => recentFoods(db, uid));
}

export function useTemplates() {
  return useLocalQuery(['templates'], (db, uid) => listTemplates(db, uid));
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export type FoodSearchState = {
  results: FoodRecord[];
  /** server search in flight */
  searchingRemote: boolean;
  /** server search unavailable (offline / local mode) — only on-device foods were searched */
  remoteUnavailable: boolean;
};

/**
 * Searches on-device foods (マイ食品 + cached master) immediately and the server food master
 * (Supabase RPC) after a short debounce. Results are merged without duplicates.
 */
export function useFoodSearch(query: string): FoodSearchState {
  const userId = useSession((s) => s.userId);
  const normalized = normalizeForSearch(query);
  const debounced = useDebounced(normalized, 250);

  const local = useLocalQuery(['foodSearch', normalized], (db, uid) =>
    searchLocalFoods(db, uid, normalized),
  );

  const remote = useQuery({
    queryKey: ['remoteFoodSearch', debounced],
    enabled: !!userId && !isLocalMode() && debounced.length > 0,
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => {
      const rows = await createSupabaseRemote(getSupabase()).searchFoods(debounced, 50);
      return rows;
    },
  });

  const results = useMemo(() => {
    const seen = new Set<string>();
    const out: FoodRecord[] = [];
    for (const f of [...(local.data ?? []), ...(remote.data ?? []).map(masterRowToFood)]) {
      const key = `${f.source}:${f.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(f);
      }
    }
    return out;
  }, [local.data, remote.data]);

  return {
    results,
    searchingRemote: remote.isFetching,
    remoteUnavailable: isLocalMode() || remote.isError,
  };
}

/** Ensures a server food is stored in the on-device cache before it is used. */
export async function ensureFoodCached(food: FoodRecord): Promise<void> {
  if (food.source !== 'master') return;
  const db = await getDb();
  await cacheMasterFoods(db, [
    {
      id: food.id,
      food_code: food.foodCode ?? '',
      name: food.name,
      category_code: null,
      category_name: food.categoryName,
      energy_kcal: food.per100g.energyKcal,
      protein_g: food.per100g.proteinG,
      fat_g: food.per100g.fatG,
      carbohydrate_g: food.per100g.carbohydrateG,
      value_flags: Object.fromEntries(
        Object.entries(food.valueFlags).map(([k, v]) => [
          {
            energyKcal: 'energy_kcal',
            proteinG: 'protein_g',
            fatG: 'fat_g',
            carbohydrateG: 'carbohydrate_g',
          }[k] ?? k,
          v,
        ]),
      ),
      source_version: food.sourceVersion,
    },
  ]);
}
