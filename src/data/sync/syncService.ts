import { AppState } from 'react-native';
import { create } from 'zustand';

import { isSupabaseConfigured } from '@/lib/config';
import { queryClient } from '@/lib/queryClient';
import { getSupabase } from '@/lib/supabase';

import { getDb } from '../db/expoDb';
import { RemoteError, type RemoteApi } from './remote';
import { countPending, syncOnce } from './syncEngine';
import { createSupabaseRemote } from './supabaseRemote';

export type SyncState = {
  /** idle: nothing running; offline: last attempt failed for network reasons */
  phase: 'disabled' | 'idle' | 'syncing' | 'offline' | 'error';
  pending: number;
  errors: number;
  lastSyncedAt: string | null;
};

export const useSyncStatus = create<SyncState>()(() => ({
  phase: isSupabaseConfigured() ? 'idle' : 'disabled',
  pending: 0,
  errors: 0,
  lastSyncedAt: null,
}));

let userId: string | null = null;
let remote: RemoteApi | null = null;
let running: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;

const BASE_DELAY = 2_000;
const MAX_DELAY = 15 * 60_000;

function getRemote(): RemoteApi {
  remote ??= createSupabaseRemote(getSupabase());
  return remote;
}

async function refreshCounts() {
  if (!userId) return;
  const db = await getDb();
  useSyncStatus.setState(await countPending(db, userId));
}

/** Runs one full sync now. Throws on failure (callers decide how to surface it). */
export async function syncNow(): Promise<void> {
  if (!userId || !isSupabaseConfigured()) return;
  if (running) return running;
  const uid = userId;
  running = (async () => {
    useSyncStatus.setState({ phase: 'syncing' });
    try {
      const db = await getDb();
      await syncOnce(db, getRemote(), uid);
      failures = 0;
      useSyncStatus.setState({ phase: 'idle', lastSyncedAt: new Date().toISOString() });
      await queryClient.invalidateQueries({ queryKey: ['local'] });
    } catch (e) {
      failures++;
      const offline = e instanceof RemoteError && e.kind !== 'rejected';
      useSyncStatus.setState({ phase: offline ? 'offline' : 'error' });
      scheduleSync(Math.min(BASE_DELAY * 2 ** failures, MAX_DELAY) * (0.8 + Math.random() * 0.4));
      throw e;
    } finally {
      running = null;
      await refreshCounts().catch(() => {});
    }
  })();
  return running;
}

/** Debounced background sync (after local writes, on foreground, after reconnect). */
export function scheduleSync(delayMs = 1_500) {
  if (!userId || !isSupabaseConfigured()) {
    void refreshCounts().catch(() => {});
    return;
  }
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    syncNow().catch(() => {});
  }, delayMs);
  void refreshCounts().catch(() => {});
}

let appStateSub: { remove(): void } | null = null;

/** Called by the session when the signed-in user changes. */
export function setSyncUser(id: string | null) {
  userId = id;
  failures = 0;
  if (timer) clearTimeout(timer);
  appStateSub?.remove();
  appStateSub = null;
  if (id && isSupabaseConfigured()) {
    appStateSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') scheduleSync(500);
    });
  }
  useSyncStatus.setState({ pending: 0, errors: 0, lastSyncedAt: null });
}
