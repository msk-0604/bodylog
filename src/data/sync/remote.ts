import type { MasterFoodRow } from '../repo/foods';

export type Row = Record<string, unknown>;

export type RemoteErrorKind =
  /** No connection / timeout — retry later */
  | 'network'
  /** Session expired or invalid — retry after re-auth */
  | 'auth'
  /** 5xx — retry later */
  | 'server'
  /** The server refused this data (validation, RLS, free-plan limit) — don't retry as-is */
  | 'rejected';

export class RemoteError extends Error {
  constructor(
    message: string,
    readonly kind: RemoteErrorKind,
    readonly code?: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'RemoteError';
  }
}

/** Server operations used by the sync engine (Supabase in the app, in-memory fake in tests). */
export interface RemoteApi {
  upsert(table: string, rows: Row[], onConflict: string): Promise<void>;
  /** Updates the user's single row of a server-created table (profiles, user_preferences). */
  updateOwnRow(table: string, ownerColumn: string, userId: string, values: Row): Promise<void>;
  /** Rows of the user changed at or after `since` (ISO), ordered by updated_at ascending. */
  pull(
    table: string,
    ownerColumn: string,
    userId: string,
    since: string | null,
    limit: number,
  ): Promise<Row[]>;
  fetchFoods(ids: string[]): Promise<MasterFoodRow[]>;
  searchFoods(normalizedQuery: string, limit: number): Promise<MasterFoodRow[]>;
}
