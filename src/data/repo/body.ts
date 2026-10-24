import { toDateKey, type DateKey } from '@/domain/date';
import { roundTo } from '@/domain/nutrition';
import { isValidBodyFatPct, isValidWeightKg, type WeightMeasurement } from '@/domain/weight';

import type { SqlDb } from '../db/types';
import { deviceTimeZone, insertRow, newId, nowIso, num, softDelete, updateRow } from './common';

export type WeightRecord = WeightMeasurement & { note: string | null; syncError: string | null };

type Row = {
  id: string;
  weight_kg: number;
  body_fat_pct: number | null;
  measured_at: string;
  measured_on: string;
  note: string | null;
  sync_error: string | null;
};

const toRecord = (r: Row): WeightRecord => ({
  id: r.id,
  weightKg: Number(r.weight_kg),
  bodyFatPct: num(r.body_fat_pct),
  measuredAt: new Date(r.measured_at),
  measuredOn: r.measured_on as DateKey,
  note: r.note,
  syncError: r.sync_error,
});

export async function listWeights(db: SqlDb, userId: string): Promise<WeightRecord[]> {
  const rows = await db.all<Row>(
    `SELECT * FROM body_measurements WHERE user_id = ? AND deleted_at IS NULL ORDER BY measured_at`,
    [userId],
  );
  return rows.map(toRecord);
}

export type WeightInput = {
  weightKg: number;
  bodyFatPct: number | null;
  measuredAt: Date;
  note?: string | null;
};

function validate(input: WeightInput) {
  if (!isValidWeightKg(input.weightKg)) throw new RangeError('invalid weight');
  if (input.bodyFatPct !== null && !isValidBodyFatPct(input.bodyFatPct)) {
    throw new RangeError('invalid body fat');
  }
}

export async function addWeight(db: SqlDb, userId: string, input: WeightInput): Promise<string> {
  validate(input);
  const id = newId();
  await db.transaction((tx) =>
    insertRow(tx, 'body_measurements', {
      id,
      user_id: userId,
      weight_kg: roundTo(input.weightKg, 1),
      body_fat_pct: input.bodyFatPct === null ? null : roundTo(input.bodyFatPct, 1),
      measured_at: input.measuredAt.toISOString(),
      measured_on: toDateKey(input.measuredAt),
      time_zone: deviceTimeZone(),
      note: input.note?.trim() || null,
      created_at: nowIso(),
      deleted_at: null,
    }),
  );
  return id;
}

export async function updateWeight(db: SqlDb, userId: string, id: string, input: WeightInput) {
  validate(input);
  await db.transaction(async (tx) => {
    const own = await tx.get('SELECT 1 FROM body_measurements WHERE id = ? AND user_id = ?', [
      id,
      userId,
    ]);
    if (!own) return;
    await updateRow(tx, 'body_measurements', id, {
      weight_kg: roundTo(input.weightKg, 1),
      body_fat_pct: input.bodyFatPct === null ? null : roundTo(input.bodyFatPct, 1),
      measured_at: input.measuredAt.toISOString(),
      measured_on: toDateKey(input.measuredAt),
      note: input.note?.trim() || null,
    });
  });
}

export async function deleteWeight(db: SqlDb, userId: string, id: string) {
  await db.transaction(async (tx) => {
    const own = await tx.get('SELECT 1 FROM body_measurements WHERE id = ? AND user_id = ?', [
      id,
      userId,
    ]);
    if (own) await softDelete(tx, 'body_measurements', id);
  });
}
