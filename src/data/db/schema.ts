import type { SqlDb } from './types';

/**
 * Local SQLite schema. Synced tables mirror the Supabase columns (snake_case) and add:
 *   rev         – incremented on every local write
 *   synced_rev  – rev that was last confirmed by the server (dirty when rev > synced_rev)
 *   sync_error  – last non-retryable server error (e.g. free-plan limit), shown to the user
 *   updated_at  – last local modification time (server time after a pull)
 * Deletions are soft (deleted_at) so they can be synced. See docs/ARCHITECTURE.md §4.
 */

const SYNC_COLS = `
  rev INTEGER NOT NULL DEFAULT 1,
  synced_rev INTEGER NOT NULL DEFAULT 0,
  sync_error TEXT,
  updated_at TEXT NOT NULL`;

const V1 = `
CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);

CREATE TABLE sync_cursors (table_name TEXT PRIMARY KEY NOT NULL, cursor TEXT NOT NULL);

CREATE TABLE profiles (
  id TEXT PRIMARY KEY NOT NULL,
  nickname TEXT,
  height_cm REAL,
  birth_date TEXT,
  sex TEXT,
  activity_level TEXT,
  time_zone TEXT,
  terms_version TEXT,
  terms_accepted_at TEXT,
  privacy_version TEXT,
  privacy_accepted_at TEXT,
  onboarding_completed_at TEXT,
  created_at TEXT NOT NULL,
  ${SYNC_COLS}
);

CREATE TABLE nutrition_goals (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  goal_type TEXT NOT NULL,
  calorie_kcal INTEGER NOT NULL,
  protein_g REAL,
  fat_g REAL,
  carbohydrate_g REAL,
  start_weight_kg REAL,
  target_weight_kg REAL,
  exercise_minutes_per_week INTEGER,
  calorie_source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  ${SYNC_COLS},
  UNIQUE (user_id, effective_from)
);

CREATE TABLE body_measurements (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  body_fat_pct REAL,
  measured_at TEXT NOT NULL,
  measured_on TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  ${SYNC_COLS}
);
CREATE INDEX body_measurements_user_time ON body_measurements (user_id, measured_at);

-- Cache of food_master rows the user has seen/used (NOT the whole master).
CREATE TABLE food_cache (
  id TEXT PRIMARY KEY NOT NULL,
  food_code TEXT NOT NULL,
  name TEXT NOT NULL,
  search_text TEXT NOT NULL,
  category_code TEXT,
  category_name TEXT,
  energy_kcal REAL,
  protein_g REAL,
  fat_g REAL,
  carbohydrate_g REAL,
  value_flags TEXT NOT NULL DEFAULT '{}',
  source_version TEXT,
  cached_at TEXT NOT NULL
);

CREATE TABLE custom_foods (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  search_text TEXT NOT NULL,
  energy_kcal REAL,
  protein_g REAL,
  fat_g REAL,
  carbohydrate_g REAL,
  serving_label TEXT,
  serving_grams REAL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  ${SYNC_COLS}
);

CREATE TABLE food_favorites (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  food_id TEXT,
  custom_food_id TEXT,
  default_grams REAL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  ${SYNC_COLS}
);

CREATE TABLE meal_entries (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  eaten_on TEXT NOT NULL,
  eaten_at TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  ${SYNC_COLS}
);
CREATE INDEX meal_entries_user_day ON meal_entries (user_id, eaten_on);

CREATE TABLE meal_items (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  meal_entry_id TEXT NOT NULL,
  food_id TEXT,
  custom_food_id TEXT,
  food_name TEXT NOT NULL,
  food_code TEXT,
  quantity REAL,
  unit_label TEXT,
  grams REAL NOT NULL,
  energy_kcal REAL,
  protein_g REAL,
  fat_g REAL,
  carbohydrate_g REAL,
  nutrient_source_version TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  ${SYNC_COLS}
);
CREATE INDEX meal_items_entry ON meal_items (meal_entry_id);
CREATE INDEX meal_items_user_created ON meal_items (user_id, created_at);

CREATE TABLE meal_templates (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  default_meal_type TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  ${SYNC_COLS}
);

CREATE TABLE meal_template_items (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  food_id TEXT,
  custom_food_id TEXT,
  food_name TEXT NOT NULL,
  quantity REAL,
  unit_label TEXT,
  grams REAL NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  ${SYNC_COLS}
);
CREATE INDEX meal_template_items_template ON meal_template_items (template_id);
`;

const MIGRATIONS: readonly string[] = [V1];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: SqlDb): Promise<void> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current > SCHEMA_VERSION) {
    throw new Error(`Local database schema ${current} is newer than supported ${SCHEMA_VERSION}`);
  }
  if (current === SCHEMA_VERSION) return;
  await db.transaction(async (tx) => {
    for (let v = current; v < SCHEMA_VERSION; v++) {
      await tx.exec(MIGRATIONS[v]!);
    }
    await tx.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}

/** Tables holding the signed-in user's data (wiped on logout / account deletion). */
export const USER_TABLES = [
  'profiles',
  'nutrition_goals',
  'body_measurements',
  'custom_foods',
  'food_favorites',
  'meal_entries',
  'meal_items',
  'meal_templates',
  'meal_template_items',
  'sync_cursors',
  'food_cache',
  'meta',
] as const;

export async function wipeUserData(db: SqlDb): Promise<void> {
  await db.transaction(async (tx) => {
    for (const t of USER_TABLES) await tx.exec(`DELETE FROM ${t}`);
  });
}
