/**
 * Supabase mode, session level: two accounts on one device. Premium, cached plan answers,
 * store bindings and reminders must never leak from account A to account B.
 */
import type { SqlDb } from '@/data/db/types';
import { createTestDb } from '@/data/db/testing/nodeDb';
import { getMeta } from '@/data/repo/profile';
import { resetSessionForTests, initSession, signOut, useSession } from '@/features/auth/session';
import { setBillingForTests, type BillingClient } from '@/features/premium/billing';
import { reloadPlan } from '@/features/premium/entitlement';
import { queryClient } from '@/lib/queryClient';
import { mockNotifications } from '@/testing/notificationsMock';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

let mockDb: (SqlDb & { close(): void }) | null = null;
jest.mock('@/data/db/expoDb', () => ({ getDb: async () => mockDb }));
jest.mock('@/lib/config', () => ({
  config: {},
  isSupabaseConfigured: () => true,
  isLocalMode: () => false,
  LOCAL_USER_ID: 'local-user',
  revenueCatKeyFor: () => null,
}));
jest.mock('@/data/sync/syncService', () => ({
  syncNow: async () => {},
  scheduleSync: () => {},
  setSyncUser: () => {},
  useSyncStatus: { getState: () => ({}), setState: () => {} },
}));

type Listener = (event: string, session: unknown) => void;
const mockServer = {
  listeners: [] as Listener[],
  offline: false,
  subscriptions: new Map<string, Record<string, unknown>>(),
};
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (cb: Listener) => {
        mockServer.listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: async () => ({ error: null }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, uid: string) => ({
          maybeSingle: async () => {
            if (mockServer.offline) throw new Error('Network request failed');
            if (table === 'subscriptions')
              return { data: mockServer.subscriptions.get(uid) ?? null, error: null };
            return { data: null, error: null };
          },
        }),
      }),
    }),
    functions: { invoke: async () => ({ data: null, error: new Error('not deployed') }) },
  }),
}));

const calls: string[] = [];
const recorder: BillingClient = {
  kind: 'revenuecat',
  identify: async (id) => void calls.push(`identify:${id}`),
  reset: async () => void calls.push('reset'),
  getPremiumPackage: async () => null,
  purchase: async () => ({ ok: false, kind: 'unknown' }),
  restore: async () => ({ ok: false, kind: 'nothingToRestore' }),
  managementUrl: async () => null,
  onChange: () => () => {},
};

const signIn = async (id: string) => {
  mockServer.listeners.forEach((l) => l('SIGNED_IN', { user: { id, email: `${id}@example.com` } }));
  for (
    let i = 0;
    i < 200 && !(useSession.getState().userId === id && useSession.getState().status === 'ready');
    i++
  ) {
    await new Promise((r) => setTimeout(r, 5));
  }
  expect(useSession.getState()).toMatchObject({ userId: id, status: 'ready' });
};

beforeEach(async () => {
  resetSessionForTests();
  mockServer.listeners = [];
  mockServer.offline = false;
  mockServer.subscriptions.clear();
  mockNotifications.reset();
  calls.length = 0;
  setBillingForTests(recorder);
  mockDb = await createTestDb();
});
afterEach(() => {
  queryClient.clear(); // drops cache GC timers so the worker can exit
  setBillingForTests(null);
  mockDb?.close();
});

it('A is Premium, B (same device, after sign-out) is not — even offline', async () => {
  mockServer.subscriptions.set(A, {
    status: 'active',
    expires_at: new Date(Date.now() + 20 * 86_400_000).toISOString(),
    entitlement: 'premium',
  });
  await initSession();
  await signIn(A);
  expect(await reloadPlan()).toBe('premium');
  expect(await getMeta(mockDb!, `plan_cache:${A}`)).not.toBeNull();

  await signOut();
  await new Promise((r) => setTimeout(r, 10));
  expect(useSession.getState().status).toBe('signedOut');
  expect(await getMeta(mockDb!, `plan_cache:${A}`)).toBeNull(); // wiped with the account data

  mockServer.offline = true; // B signs in without network: no cache may grant Premium
  await signIn(B);
  expect(await reloadPlan()).toBe('free');
  // (the signed-out start also resets; only the order around the accounts matters)
  expect(calls.slice(calls.indexOf(`identify:${A}`))).toEqual([
    `identify:${A}`,
    'reset',
    `identify:${B}`,
  ]);
});

it('switching accounts without an explicit sign-out wipes A’s data and plan cache', async () => {
  mockServer.subscriptions.set(A, {
    status: 'active',
    expires_at: new Date(Date.now() + 20 * 86_400_000).toISOString(),
    entitlement: 'premium',
  });
  await initSession();
  await signIn(A);
  await reloadPlan();
  await mockDb!.run(
    "INSERT INTO notification_settings (kind, enabled, hour, minute, updated_at) VALUES ('weigh_in', 1, 7, 0, 'x')",
  );

  // a different user's session arrives (e.g. signed in on the web, deep link)
  await signIn(B);
  expect(await getMeta(mockDb!, `plan_cache:${A}`)).toBeNull();
  expect(await mockDb!.all('SELECT * FROM notification_settings')).toEqual([]);
  mockServer.offline = true;
  expect(await reloadPlan()).toBe('free');
  expect(calls.at(-1)).toBe(`identify:${B}`);
});
