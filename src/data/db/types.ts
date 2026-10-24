export type SqlValue = string | number | null;

/** Minimal async SQL interface. Implemented by expo-sqlite (app) and node:sqlite (tests). */
export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  get<T>(sql: string, params?: readonly SqlValue[]): Promise<T | null>;
}

export interface SqlDb extends SqlExecutor {
  /**
   * Runs `fn` in a transaction. All statements of the transaction MUST go through `tx`.
   * Other callers wait until the transaction finishes (operations are serialized).
   */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

/** Serializes async operations (one connection, no interleaving inside transactions). */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/** Wraps a raw executor + BEGIN/COMMIT into a serialized SqlDb. */
export function createSerializedDb(raw: SqlExecutor): SqlDb {
  const mutex = new Mutex();
  return {
    exec: (sql) => mutex.run(() => raw.exec(sql)),
    run: (sql, params) => mutex.run(() => raw.run(sql, params)),
    all: (sql, params) => mutex.run(() => raw.all(sql, params)),
    get: (sql, params) => mutex.run(() => raw.get(sql, params)),
    transaction: (fn) =>
      mutex.run(async () => {
        await raw.exec('BEGIN');
        try {
          const result = await fn(raw);
          await raw.exec('COMMIT');
          return result;
        } catch (e) {
          await raw.exec('ROLLBACK');
          throw e;
        }
      }),
  };
}
