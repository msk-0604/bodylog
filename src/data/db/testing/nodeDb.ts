/* Test-only SqlDb backed by Node's built-in SQLite (node:sqlite). Not bundled into the app. */
import { migrate } from '../schema';
import { createSerializedDb, type SqlDb, type SqlExecutor, type SqlValue } from '../types';

type StatementSync = {
  run(...params: SqlValue[]): { changes: number | bigint };
  all(...params: SqlValue[]): unknown[];
  get(...params: SqlValue[]): unknown;
};
type DatabaseSync = { exec(sql: string): void; prepare(sql: string): StatementSync; close(): void };

export async function createTestDb(): Promise<SqlDb & { close(): void }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (path: string) => DatabaseSync;
  };
  const native = new DatabaseSync(':memory:');
  const norm = (params: readonly SqlValue[] = []) =>
    params.map((p) => (p === undefined ? null : p));
  const raw: SqlExecutor = {
    exec: async (sql) => native.exec(sql),
    run: async (sql, params) => {
      const r = native.prepare(sql).run(...norm(params));
      return { changes: Number(r.changes) };
    },
    all: async <T>(sql: string, params?: readonly SqlValue[]) =>
      native
        .prepare(sql)
        .all(...norm(params))
        .map((r) => ({ ...(r as object) })) as T[],
    get: async <T>(sql: string, params?: readonly SqlValue[]) => {
      const r = native.prepare(sql).get(...norm(params));
      return (r ? { ...(r as object) } : null) as T | null;
    },
  };
  const db = createSerializedDb(raw);
  await migrate(db);
  return Object.assign(db, { close: () => native.close() });
}
