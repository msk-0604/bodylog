import type { SupabaseClient } from '@supabase/supabase-js';

import type { MasterFoodRow } from '../repo/foods';
import { RemoteError, type RemoteApi, type Row } from './remote';

type PgError = { message: string; code?: string; hint?: string | null; details?: string | null };

const FOOD_COLUMNS =
  'id, food_code, name, category_code, category_name, energy_kcal, protein_g, fat_g, carbohydrate_g, value_flags, source_version';

function toRemoteError(error: PgError, status: number): RemoteError {
  const hint = error.hint ?? undefined;
  if (status === 0 || (!error.code && /network|fetch|timed? ?out|abort/i.test(error.message))) {
    return new RemoteError(error.message, 'network', error.code, hint);
  }
  if (status === 401 || error.code === 'PGRST301' || error.code === 'PGRST303') {
    return new RemoteError(error.message, 'auth', error.code, hint);
  }
  if (status >= 500) return new RemoteError(error.message, 'server', error.code, hint);
  return new RemoteError(error.message, 'rejected', error.code, hint);
}

async function run<T>(
  p: PromiseLike<{ data: T | null; error: PgError | null; status: number }>,
): Promise<T | null> {
  let res: { data: T | null; error: PgError | null; status: number };
  try {
    res = await p;
  } catch (e) {
    throw new RemoteError(e instanceof Error ? e.message : 'network error', 'network');
  }
  if (res.error) throw toRemoteError(res.error, res.status);
  return res.data;
}

export function createSupabaseRemote(supabase: SupabaseClient): RemoteApi {
  return {
    async upsert(table, rows, onConflict) {
      await run(supabase.from(table).upsert(rows, { onConflict, ignoreDuplicates: false }));
    },
    async updateOwnRow(table, ownerColumn, userId, values) {
      await run(supabase.from(table).update(values).eq(ownerColumn, userId));
    },
    async pull(table, ownerColumn, userId, since, limit) {
      let q = supabase
        .from(table)
        .select('*')
        .eq(ownerColumn, userId)
        .order('updated_at', { ascending: true })
        .limit(limit);
      if (since) q = q.gte('updated_at', since);
      return ((await run(q)) ?? []) as Row[];
    },
    async fetchFoods(ids) {
      if (ids.length === 0) return [];
      return ((await run(supabase.from('food_master').select(FOOD_COLUMNS).in('id', ids))) ??
        []) as MasterFoodRow[];
    },
    async searchFoods(normalizedQuery, limit) {
      return ((await run(
        supabase.rpc('search_foods', { p_query: normalizedQuery, p_limit: limit }),
      )) ?? []) as MasterFoodRow[];
    },
  };
}
