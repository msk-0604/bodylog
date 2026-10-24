import * as Crypto from 'expo-crypto';

import type { SqlExecutor, SqlValue } from '../db/types';

export function newId(): string {
  return Crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';
  } catch {
    return 'Asia/Tokyo';
  }
}

/** Inserts a synced row as a new local change (dirty). Column names must be trusted constants. */
export async function insertRow(
  tx: SqlExecutor,
  table: string,
  row: Record<string, SqlValue>,
): Promise<void> {
  const data: Record<string, SqlValue> = { ...row, rev: 1, synced_rev: 0, updated_at: nowIso() };
  const cols = Object.keys(data);
  await tx.run(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    cols.map((c) => data[c] ?? null),
  );
}

/** Updates a synced row as a local change: bumps rev, clears a previous sync error. */
export async function updateRow(
  tx: SqlExecutor,
  table: string,
  id: string,
  patch: Record<string, SqlValue>,
  idColumn = 'id',
): Promise<number> {
  const cols = Object.keys(patch);
  const sets = [
    ...cols.map((c) => `${c} = ?`),
    'rev = rev + 1',
    'updated_at = ?',
    'sync_error = NULL',
  ];
  const r = await tx.run(`UPDATE ${table} SET ${sets.join(', ')} WHERE ${idColumn} = ?`, [
    ...cols.map((c) => patch[c] ?? null),
    nowIso(),
    id,
  ]);
  return r.changes;
}

export function softDelete(tx: SqlExecutor, table: string, id: string): Promise<number> {
  return updateRow(tx, table, id, { deleted_at: nowIso() });
}

export const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);
