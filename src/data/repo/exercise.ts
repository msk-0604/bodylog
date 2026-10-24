import { toDateKey, type DateKey } from '@/domain/date';
import {
  DURATION_MAX_MIN,
  REPS_MAX,
  SET_WEIGHT_MAX_KG,
  type ExerciseType,
  type SetInput,
} from '@/domain/exerciseTypes';
import { roundTo } from '@/domain/nutrition';

import type { SqlDb, SqlExecutor } from '../db/types';
import { deviceTimeZone, insertRow, newId, nowIso, num, softDelete, updateRow } from './common';

export type ExerciseSet = {
  id: string;
  exerciseName: string;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
};

export type ExerciseRecord = {
  id: string;
  type: ExerciseType;
  name: string;
  performedAt: Date;
  performedOn: DateKey;
  durationMin: number;
  kcal: number | null;
  kcalIsEstimated: boolean;
  mets: number | null;
  note: string | null;
  sets: ExerciseSet[];
  syncError: string | null;
};

export type ExerciseInput = {
  type: ExerciseType;
  name: string;
  performedAt: Date;
  durationMin: number;
  kcal: number | null;
  kcalIsEstimated: boolean;
  mets: number | null;
  note?: string | null;
  sets?: readonly SetInput[];
};

type EntryRow = {
  id: string;
  exercise_type: string;
  name: string;
  performed_at: string;
  performed_on: string;
  duration_min: number;
  kcal: number | null;
  kcal_is_estimated: number;
  mets: number | null;
  note: string | null;
  sync_error: string | null;
};
type SetRow = {
  id: string;
  exercise_entry_id: string;
  exercise_name: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
};

export function validateExercise(input: ExerciseInput): string | null {
  if (!input.name.trim()) return '運動名を入力してください';
  if (
    !Number.isInteger(input.durationMin) ||
    input.durationMin < 1 ||
    input.durationMin > DURATION_MAX_MIN
  ) {
    return `時間は1〜${DURATION_MAX_MIN}分で入力してください`;
  }
  if (input.kcal !== null && !(input.kcal >= 0 && input.kcal <= 10000)) {
    return '消費カロリーは0〜10000kcalで入力してください';
  }
  for (const s of input.sets ?? []) {
    if (s.weightKg !== null && !(s.weightKg >= 0 && s.weightKg <= SET_WEIGHT_MAX_KG)) {
      return `重量は0〜${SET_WEIGHT_MAX_KG}kgで入力してください`;
    }
    if (s.reps !== null && !(Number.isInteger(s.reps) && s.reps >= 1 && s.reps <= REPS_MAX)) {
      return `回数は1〜${REPS_MAX}回で入力してください`;
    }
  }
  return null;
}

async function loadSets(db: SqlDb, ids: readonly string[]): Promise<Map<string, ExerciseSet[]>> {
  const map = new Map<string, ExerciseSet[]>();
  if (ids.length === 0) return map;
  const rows = await db.all<SetRow>(
    `SELECT * FROM exercise_sets WHERE deleted_at IS NULL AND exercise_entry_id IN (${ids
      .map(() => '?')
      .join(', ')}) ORDER BY set_number`,
    ids,
  );
  for (const r of rows) {
    const list = map.get(r.exercise_entry_id) ?? [];
    list.push({
      id: r.id,
      exerciseName: r.exercise_name,
      setNumber: Number(r.set_number),
      weightKg: num(r.weight_kg),
      reps: r.reps === null ? null : Number(r.reps),
    });
    map.set(r.exercise_entry_id, list);
  }
  return map;
}

function toRecord(r: EntryRow, sets: ExerciseSet[]): ExerciseRecord {
  return {
    id: r.id,
    type: r.exercise_type as ExerciseType,
    name: r.name,
    performedAt: new Date(r.performed_at),
    performedOn: r.performed_on as DateKey,
    durationMin: Number(r.duration_min),
    kcal: num(r.kcal),
    kcalIsEstimated: Number(r.kcal_is_estimated) === 1,
    mets: num(r.mets),
    note: r.note,
    sets,
    syncError: r.sync_error,
  };
}

export async function listExercises(
  db: SqlDb,
  userId: string,
  range?: { from: DateKey; to: DateKey },
): Promise<ExerciseRecord[]> {
  const rows = await db.all<EntryRow>(
    `SELECT * FROM exercise_entries WHERE user_id = ? AND deleted_at IS NULL
     ${range ? 'AND performed_on BETWEEN ? AND ?' : ''}
     ORDER BY performed_at DESC`,
    range ? [userId, range.from, range.to] : [userId],
  );
  const sets = await loadSets(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toRecord(r, sets.get(r.id) ?? []));
}

export async function getExercise(
  db: SqlDb,
  userId: string,
  id: string,
): Promise<ExerciseRecord | null> {
  const r = await db.get<EntryRow>(
    'SELECT * FROM exercise_entries WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [id, userId],
  );
  if (!r) return null;
  return toRecord(r, (await loadSets(db, [id])).get(id) ?? []);
}

function entryColumns(input: ExerciseInput) {
  return {
    exercise_type: input.type,
    name: input.name.trim().slice(0, 60),
    performed_at: input.performedAt.toISOString(),
    performed_on: toDateKey(input.performedAt),
    duration_min: input.durationMin,
    kcal: input.kcal === null ? null : roundTo(input.kcal, 0),
    kcal_is_estimated: input.kcalIsEstimated ? 1 : 0,
    mets: input.mets,
    note: input.note?.trim() || null,
  };
}

async function writeSets(
  tx: SqlExecutor,
  userId: string,
  entryId: string,
  sets: readonly SetInput[],
) {
  const existing = await tx.all<{ id: string }>(
    'SELECT id FROM exercise_sets WHERE exercise_entry_id = ? AND deleted_at IS NULL',
    [entryId],
  );
  for (const e of existing) await softDelete(tx, 'exercise_sets', e.id);
  let n = 1;
  for (const s of sets) {
    if (!s.exerciseName.trim()) continue;
    await insertRow(tx, 'exercise_sets', {
      id: newId(),
      user_id: userId,
      exercise_entry_id: entryId,
      exercise_name: s.exerciseName.trim().slice(0, 60),
      set_number: n++,
      weight_kg: s.weightKg === null ? null : roundTo(s.weightKg, 1),
      reps: s.reps,
      created_at: nowIso(),
      deleted_at: null,
    });
  }
}

export async function addExercise(
  db: SqlDb,
  userId: string,
  input: ExerciseInput,
): Promise<string> {
  const err = validateExercise(input);
  if (err) throw new RangeError(err);
  const id = newId();
  await db.transaction(async (tx) => {
    await insertRow(tx, 'exercise_entries', {
      id,
      user_id: userId,
      ...entryColumns(input),
      time_zone: deviceTimeZone(),
      created_at: nowIso(),
      deleted_at: null,
    });
    await writeSets(tx, userId, id, input.sets ?? []);
  });
  return id;
}

/** Replaces the entry's values; sets are replaced only when `input.sets` is given. */
export async function updateExercise(db: SqlDb, userId: string, id: string, input: ExerciseInput) {
  const err = validateExercise(input);
  if (err) throw new RangeError(err);
  await db.transaction(async (tx) => {
    const own = await tx.get('SELECT 1 FROM exercise_entries WHERE id = ? AND user_id = ?', [
      id,
      userId,
    ]);
    if (!own) return;
    await updateRow(tx, 'exercise_entries', id, entryColumns(input));
    if (input.sets) await writeSets(tx, userId, id, input.sets);
  });
}

export async function deleteExercise(db: SqlDb, userId: string, id: string) {
  await db.transaction(async (tx) => {
    const own = await tx.get('SELECT 1 FROM exercise_entries WHERE id = ? AND user_id = ?', [
      id,
      userId,
    ]);
    if (!own) return;
    const sets = await tx.all<{ id: string }>(
      'SELECT id FROM exercise_sets WHERE exercise_entry_id = ? AND deleted_at IS NULL',
      [id],
    );
    for (const s of sets) await softDelete(tx, 'exercise_sets', s.id);
    await softDelete(tx, 'exercise_entries', id);
  });
}

/** Distinct strength exercise names used before (for quick input), most recent first. */
export async function recentSetNames(db: SqlDb, userId: string, limit = 12): Promise<string[]> {
  const rows = await db.all<{ exercise_name: string }>(
    `SELECT exercise_name, MAX(created_at) AS last FROM exercise_sets
     WHERE user_id = ? AND deleted_at IS NULL GROUP BY exercise_name ORDER BY last DESC LIMIT ?`,
    [userId, limit],
  );
  return rows.map((r) => r.exercise_name);
}
