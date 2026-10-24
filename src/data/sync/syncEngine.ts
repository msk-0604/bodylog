import type { SqlDb, SqlValue } from '../db/types';
import { cacheMasterFoods, missingReferencedMasterFoodIds } from '../repo/foods';
import { RemoteError, type RemoteApi, type Row } from './remote';

/**
 * Offline-first sync (see docs/ARCHITECTURE.md §4).
 *
 * push: every locally changed row (rev > synced_rev) is upserted by its client-generated id,
 *       so retries never duplicate. On success synced_rev = rev (unless edited meanwhile).
 *       Rows the server rejects (validation / RLS / free-plan limit) get `sync_error` and are not
 *       retried until edited again.
 * pull: rows with updated_at >= cursor are applied unless the local row has unpushed changes.
 *       Server updated_at (server clock) is the ordering key → last writer wins.
 *       Deletes are soft (deleted_at) and the server never un-deletes a row.
 */

type TableConfig = {
  table: string;
  columns: readonly string[];
  onConflict: string;
  /** owner column used to scope rows */
  owner: 'user_id' | 'id';
  /**
   * 'update': one row per user that the server creates (profiles, user_preferences); the app only
   * updates it and the owner column is the key. Default: upsert by client-generated `id`.
   */
  mode?: 'update';
  /** boolean columns (stored as 0/1 in SQLite) */
  booleans?: readonly string[];
};

const keyOf = (cfg: TableConfig) => (cfg.mode === 'update' ? cfg.owner : 'id');

const COMMON = ['id', 'user_id', 'created_at'] as const;

/** Push order respects foreign keys (parents first). */
export const SYNC_TABLES: readonly TableConfig[] = [
  {
    table: 'profiles',
    owner: 'id',
    onConflict: 'id',
    columns: [
      'nickname',
      'height_cm',
      'birth_date',
      'sex',
      'activity_level',
      'time_zone',
      'terms_version',
      'terms_accepted_at',
      'privacy_version',
      'privacy_accepted_at',
      'onboarding_completed_at',
    ],
    mode: 'update',
  },
  {
    table: 'user_preferences',
    owner: 'user_id',
    onConflict: 'user_id',
    mode: 'update',
    columns: ['include_exercise_in_budget', 'week_starts_on'],
    booleans: ['include_exercise_in_budget'],
  },
  {
    table: 'nutrition_goals',
    owner: 'user_id',
    onConflict: 'user_id,effective_from',
    columns: [
      ...COMMON,
      'effective_from',
      'goal_type',
      'calorie_kcal',
      'protein_g',
      'fat_g',
      'carbohydrate_g',
      'start_weight_kg',
      'target_weight_kg',
      'exercise_minutes_per_week',
      'calorie_source',
    ],
  },
  {
    table: 'custom_foods',
    owner: 'user_id',
    onConflict: 'id',
    columns: [
      ...COMMON,
      'name',
      'search_text',
      'energy_kcal',
      'protein_g',
      'fat_g',
      'carbohydrate_g',
      'serving_label',
      'serving_grams',
      'deleted_at',
    ],
  },
  {
    table: 'meal_templates',
    owner: 'user_id',
    onConflict: 'id',
    columns: [...COMMON, 'name', 'default_meal_type', 'sort_order', 'deleted_at'],
  },
  {
    table: 'meal_template_items',
    owner: 'user_id',
    onConflict: 'id',
    columns: [
      ...COMMON,
      'template_id',
      'food_id',
      'custom_food_id',
      'food_name',
      'quantity',
      'unit_label',
      'grams',
      'sort_order',
      'deleted_at',
    ],
  },
  {
    table: 'meal_entries',
    owner: 'user_id',
    onConflict: 'id',
    columns: [...COMMON, 'eaten_on', 'eaten_at', 'time_zone', 'meal_type', 'note', 'deleted_at'],
  },
  {
    table: 'meal_items',
    owner: 'user_id',
    onConflict: 'id',
    columns: [
      ...COMMON,
      'meal_entry_id',
      'food_id',
      'custom_food_id',
      'food_name',
      'food_code',
      'quantity',
      'unit_label',
      'grams',
      'energy_kcal',
      'protein_g',
      'fat_g',
      'carbohydrate_g',
      'nutrient_source_version',
      'sort_order',
      'deleted_at',
    ],
  },
  {
    table: 'food_favorites',
    owner: 'user_id',
    onConflict: 'id',
    columns: [...COMMON, 'food_id', 'custom_food_id', 'default_grams', 'sort_order', 'deleted_at'],
  },
  {
    table: 'body_measurements',
    owner: 'user_id',
    onConflict: 'id',
    columns: [
      ...COMMON,
      'weight_kg',
      'body_fat_pct',
      'measured_at',
      'measured_on',
      'time_zone',
      'note',
      'deleted_at',
    ],
  },
  {
    table: 'exercise_entries',
    owner: 'user_id',
    onConflict: 'id',
    columns: [
      ...COMMON,
      'exercise_type',
      'name',
      'performed_at',
      'performed_on',
      'time_zone',
      'duration_min',
      'kcal',
      'kcal_is_estimated',
      'mets',
      'note',
      'deleted_at',
    ],
    booleans: ['kcal_is_estimated'],
  },
  {
    table: 'exercise_sets',
    owner: 'user_id',
    onConflict: 'id',
    columns: [
      ...COMMON,
      'exercise_entry_id',
      'exercise_name',
      'set_number',
      'weight_kg',
      'reps',
      'deleted_at',
    ],
  },
];

const PUSH_BATCH = 200;
const PULL_PAGE = 1000;

type LocalRow = Record<string, SqlValue> & { rev: number };

export type SyncResult = { pushed: number; rejected: number; pulled: number };

function pick(cfg: TableConfig, row: Record<string, SqlValue>, cols: readonly string[]): Row {
  const out: Row = {};
  for (const c of cols) {
    const v = row[c] ?? null;
    out[c] = cfg.booleans?.includes(c) && v !== null ? Number(v) === 1 : v;
  }
  return out;
}

async function markSynced(
  db: SqlDb,
  cfg: TableConfig,
  rows: readonly LocalRow[],
  error: string | null,
) {
  const key = keyOf(cfg);
  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx.run(
        `UPDATE ${cfg.table} SET synced_rev = ?, sync_error = ? WHERE ${key} = ? AND rev = ?`,
        [r.rev, error, r[key] ?? null, r.rev],
      );
    }
  });
}

function rejectionMessage(e: RemoteError): string {
  if (e.hint === 'premium_required' || /free plan limit/.test(e.message)) return 'premium_required';
  return e.code ? `rejected:${e.code}` : 'rejected';
}

async function pushTable(db: SqlDb, remote: RemoteApi, userId: string, cfg: TableConfig) {
  let pushed = 0;
  let rejected = 0;
  for (;;) {
    const rows = await db.all<LocalRow>(
      `SELECT * FROM ${cfg.table} WHERE ${cfg.owner} = ? AND rev > synced_rev
       ORDER BY created_at LIMIT ${PUSH_BATCH}`,
      [userId],
    );
    if (rows.length === 0) break;

    const send = async (batch: LocalRow[]) => {
      if (cfg.mode === 'update') {
        await remote.updateOwnRow(cfg.table, cfg.owner, userId, pick(cfg, batch[0]!, cfg.columns));
      } else {
        await remote.upsert(
          cfg.table,
          batch.map((r) => pick(cfg, r, cfg.columns)),
          cfg.onConflict,
        );
      }
    };

    try {
      await send(rows);
      await markSynced(db, cfg, rows, null);
      pushed += rows.length;
    } catch (e) {
      if (!(e instanceof RemoteError) || e.kind !== 'rejected') throw e;
      // Find the offending rows one by one so valid rows still sync.
      for (const row of rows) {
        try {
          await send([row]);
          await markSynced(db, cfg, [row], null);
          pushed++;
        } catch (e2) {
          if (!(e2 instanceof RemoteError) || e2.kind !== 'rejected') throw e2;
          await markSynced(db, cfg, [row], rejectionMessage(e2));
          rejected++;
        }
      }
    }
    if (rows.length < PUSH_BATCH) break;
  }
  return { pushed, rejected };
}

async function applyPulledRow(db: SqlDb, cfg: TableConfig, row: Row) {
  const key = keyOf(cfg);
  const cols = cfg.mode === 'update' ? [key, 'created_at', ...cfg.columns] : [...cfg.columns];
  const updatedAt = String(row.updated_at ?? new Date().toISOString());
  await db.transaction(async (tx) => {
    const local = await tx.get<{ rev: number; synced_rev: number }>(
      `SELECT rev, synced_rev FROM ${cfg.table} WHERE ${key} = ?`,
      [String(row[key])],
    );
    if (local && local.rev > local.synced_rev) return; // unpushed local change wins until pushed

    if (cfg.table === 'nutrition_goals') {
      const clash = await tx.get<{ id: string; rev: number; synced_rev: number }>(
        `SELECT id, rev, synced_rev FROM nutrition_goals
         WHERE user_id = ? AND effective_from = ? AND id <> ?`,
        [String(row.user_id), String(row.effective_from), String(row.id)],
      );
      if (clash && clash.rev > clash.synced_rev) return;
      if (clash) await tx.run('DELETE FROM nutrition_goals WHERE id = ?', [clash.id]);
    }

    const rev = local?.rev ?? 1;
    const values = cols.map((c) => {
      const v = row[c];
      return v === undefined || v === null
        ? null
        : typeof v === 'boolean'
          ? Number(v)
          : typeof v === 'object'
            ? JSON.stringify(v)
            : (v as SqlValue);
    });
    const all = [...cols, 'rev', 'synced_rev', 'sync_error', 'updated_at'];
    await tx.run(
      `INSERT INTO ${cfg.table} (${all.join(', ')}) VALUES (${all.map(() => '?').join(', ')})
       ON CONFLICT (${key}) DO UPDATE SET ${all
         .filter((c) => c !== key)
         .map((c) => `${c} = excluded.${c}`)
         .join(', ')}`,
      [...values, rev, rev, null, updatedAt],
    );
  });
}

async function pullTable(db: SqlDb, remote: RemoteApi, userId: string, cfg: TableConfig) {
  const cursorRow = await db.get<{ cursor: string }>(
    'SELECT cursor FROM sync_cursors WHERE table_name = ?',
    [cfg.table],
  );
  let cursor = cursorRow?.cursor ?? null;
  let pulled = 0;
  for (;;) {
    const rows = await remote.pull(cfg.table, cfg.owner, userId, cursor, PULL_PAGE);
    for (const row of rows) await applyPulledRow(db, cfg, row);
    pulled += rows.length;
    const last = rows.at(-1)?.updated_at;
    if (typeof last === 'string' && last !== cursor) {
      cursor = last;
      await db.run(
        `INSERT INTO sync_cursors (table_name, cursor) VALUES (?, ?)
         ON CONFLICT (table_name) DO UPDATE SET cursor = excluded.cursor`,
        [cfg.table, cursor],
      );
    } else {
      break;
    }
    if (rows.length < PULL_PAGE) break;
  }
  return pulled;
}

export async function syncOnce(db: SqlDb, remote: RemoteApi, userId: string): Promise<SyncResult> {
  let pushed = 0;
  let rejected = 0;
  let pulled = 0;
  for (const cfg of SYNC_TABLES) {
    const r = await pushTable(db, remote, userId, cfg);
    pushed += r.pushed;
    rejected += r.rejected;
  }
  for (const cfg of SYNC_TABLES) pulled += await pullTable(db, remote, userId, cfg);

  // Make sure foods referenced by favorites / templates / recent meals are usable offline.
  const missing = await missingReferencedMasterFoodIds(db, userId);
  for (let i = 0; i < missing.length; i += 100) {
    await cacheMasterFoods(db, await remote.fetchFoods(missing.slice(i, i + 100)));
  }
  return { pushed, rejected, pulled };
}

export async function countPending(
  db: SqlDb,
  userId: string,
): Promise<{ pending: number; errors: number }> {
  let pending = 0;
  let errors = 0;
  for (const cfg of SYNC_TABLES) {
    const r = await db.get<{ p: number; e: number }>(
      `SELECT SUM(rev > synced_rev) AS p, SUM(sync_error IS NOT NULL) AS e
       FROM ${cfg.table} WHERE ${cfg.owner} = ?`,
      [userId],
    );
    pending += Number(r?.p ?? 0);
    errors += Number(r?.e ?? 0);
  }
  return { pending, errors };
}
