/**
 * Plan resolution in Supabase mode: server row is the source of truth, offline uses the
 * last answer for THAT user only, and it expires with the subscription.
 */
import type { SqlDb } from '@/data/db/types';
import { createTestDb } from '@/data/db/testing/nodeDb';
import { wipeUserData } from '@/data/db/schema';
import { loadPremiumState } from '@/features/premium/entitlement';

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

const mockServer = {
  offline: false,
  rows: new Map<string, Record<string, unknown>>(),
  queriedUser: '' as string,
};
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, uid: string) => ({
          maybeSingle: async () => {
            mockServer.queriedUser = uid;
            if (mockServer.offline) throw new Error('Network request failed');
            return { data: mockServer.rows.get(uid) ?? null, error: null };
          },
        }),
      }),
    }),
  }),
}));

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

beforeEach(async () => {
  mockDb = await createTestDb();
  mockServer.offline = false;
  mockServer.rows.clear();
});
afterEach(() => mockDb?.close());

it('reads the server row for the signed-in user', async () => {
  mockServer.rows.set(A, {
    status: 'active',
    expires_at: inDays(20),
    entitlement: 'premium',
    will_renew: true,
    store: 'app_store',
  });
  const s = await loadPremiumState(A);
  expect(mockServer.queriedUser).toBe(A);
  expect(s).toMatchObject({
    plan: 'premium',
    source: 'server',
    subscription: { willRenew: true, store: 'app_store' },
  });
});

it('uses the cached answer offline, only for the same user', async () => {
  mockServer.rows.set(A, { status: 'active', expires_at: inDays(20), entitlement: 'premium' });
  await loadPremiumState(A);
  mockServer.offline = true;
  expect(await loadPremiumState(A)).toMatchObject({ plan: 'premium', source: 'cache' });
  // another account on the same device never inherits A's Premium
  expect(await loadPremiumState(B)).toMatchObject({ plan: 'free', source: 'none' });
});

it('does not trust a cached answer past its expiry', async () => {
  mockServer.rows.set(A, {
    status: 'cancelled',
    expires_at: new Date(Date.now() - 1000).toISOString(),
    entitlement: 'premium',
  });
  await loadPremiumState(A);
  mockServer.offline = true;
  expect((await loadPremiumState(A)).plan).toBe('free');
});

it('reflects cancellation (until expiry), refund and expiry from the server', async () => {
  mockServer.rows.set(A, { status: 'cancelled', expires_at: inDays(3), entitlement: 'premium' });
  expect((await loadPremiumState(A)).plan).toBe('premium');
  mockServer.rows.set(A, { status: 'refunded', expires_at: inDays(3), entitlement: 'premium' });
  expect((await loadPremiumState(A)).plan).toBe('free');
  mockServer.rows.set(A, { status: 'expired', expires_at: inDays(-1), entitlement: 'premium' });
  expect((await loadPremiumState(A)).plan).toBe('free');
});

it('sign-out / account switch wipes cached plan answers', async () => {
  mockServer.rows.set(A, { status: 'active', expires_at: inDays(20), entitlement: 'premium' });
  await loadPremiumState(A);
  await wipeUserData(mockDb!);
  mockServer.offline = true;
  expect(await loadPremiumState(A)).toMatchObject({ plan: 'free', source: 'none' });
});
