import { createTestDb } from '../db/testing/nodeDb';
import type { SqlDb } from '../db/types';
import { addWeight } from '../repo/body';
import { FakeRemote } from '../sync/testing/fakeRemote';

const U = '11111111-1111-4111-8111-111111111111';

let mockDb: (SqlDb & { close(): void }) | null = null;
// syncService caches its remote, so the same instance is reused and reset per test.
const mockRemote = new FakeRemote();
jest.mock('@/data/db/expoDb', () => ({ getDb: async () => mockDb }));
jest.mock('@/lib/config', () => ({ isSupabaseConfigured: () => true }));
jest.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));
jest.mock('@/data/sync/supabaseRemote', () => ({ createSupabaseRemote: () => mockRemote }));

// eslint-disable-next-line import/first
import { setSyncUser, syncNow, useSyncStatus } from '../sync/syncService';

const until = async (cond: () => Promise<boolean> | boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

beforeEach(async () => {
  mockRemote.tables.clear();
  mockRemote.failNext = 0;
  mockDb = await createTestDb();
  setSyncUser(U);
});
afterEach(async () => {
  await new Promise((r) => setTimeout(r, 20)); // let a pending follow-up sync start
  await syncNow().catch(() => {}); // …and finish before the next test
  setSyncUser(null);
  mockDb?.close();
});

const at = (h: number) => new Date(2026, 9, 24, h);

it('syncs again when a record is written while a sync is running', async () => {
  await addWeight(mockDb!, U, { weightKg: 70, bodyFatPct: null, measuredAt: at(7) });
  const upsert = FakeRemote.prototype.upsert.bind(mockRemote);
  let wroteDuringSync = false;
  mockRemote.upsert = async (...args) => {
    if (!wroteDuringSync) {
      wroteDuringSync = true;
      await addWeight(mockDb!, U, { weightKg: 69.5, bodyFatPct: null, measuredAt: at(8) });
      void syncNow(); // what scheduleSync does after a local write; joins the running sync
    }
    return upsert(...args);
  };

  await syncNow();
  await until(() => mockRemote.table('body_measurements').size === 2);
  await until(() => useSyncStatus.getState().phase === 'idle');
  expect(useSyncStatus.getState().pending).toBe(0);
  mockRemote.upsert = upsert;
});

it('retries with backoff after a network failure without losing the record', async () => {
  await addWeight(mockDb!, U, { weightKg: 70, bodyFatPct: null, measuredAt: at(7) });
  mockRemote.failNext = 1;
  await expect(syncNow()).rejects.toThrow('Network request failed');
  expect(useSyncStatus.getState()).toMatchObject({ phase: 'offline', pending: 1 });
  await until(() => mockRemote.table('body_measurements').size === 1, 6000); // ~4 s backoff
  await until(() => useSyncStatus.getState().pending === 0);
}, 10_000);
