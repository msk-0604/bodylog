import * as SQLite from 'expo-sqlite';

import { migrate } from './schema';
import { createSerializedDb, type SqlDb, type SqlExecutor } from './types';

const DB_NAME = 'bodylog.db';

let dbPromise: Promise<SqlDb> | null = null;

/** Opens (once) and migrates the app database. */
export function getDb(): Promise<SqlDb> {
  dbPromise ??= open().catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

async function open(): Promise<SqlDb> {
  const native = await SQLite.openDatabaseAsync(DB_NAME);
  await native.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const raw: SqlExecutor = {
    exec: (sql) => native.execAsync(sql),
    run: async (sql, params = []) => {
      const r = await native.runAsync(sql, [...params]);
      return { changes: r.changes };
    },
    all: (sql, params = []) => native.getAllAsync(sql, [...params]),
    get: (sql, params = []) => native.getFirstAsync(sql, [...params]),
  };
  const db = createSerializedDb(raw);
  await migrate(db);
  return db;
}
