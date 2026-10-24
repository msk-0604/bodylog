import { useQuery } from '@tanstack/react-query';

import { getDb } from '@/data/db/expoDb';
import { getMeta, setMeta } from '@/data/repo/profile';
import type { SubscriptionInfo } from '@/domain/billing';
import type { Plan } from '@/domain/entitlements';
import { isActivePremium, type SubscriptionRow } from '@/domain/subscription';
import { useSession } from '@/features/auth/session';
import { isLocalMode } from '@/lib/config';
import { queryClient } from '@/lib/queryClient';
import { getSupabase } from '@/lib/supabase';

import { mockBillingState } from './billing/mock';

/**
 * Premium is decided by the server: `public.subscriptions`, written only by the RevenueCat
 * webhook / `subscription-sync` Edge Function after RevenueCat verified the store receipt.
 * The store SDK's own state is never used to unlock features.
 *
 * Offline, the last server answer is used until its `expires_at` (cached per user, so an
 * account switch on the same device can never inherit another account's Premium).
 */
export type PremiumState = {
  plan: Plan;
  subscription: SubscriptionInfo | null;
  /** server: fresh answer; cache: offline fallback; none: nothing known (treated as free) */
  source: 'server' | 'cache' | 'local' | 'none';
};

type Row = SubscriptionRow & { will_renew?: boolean | null; store?: string | null };
type Cached = { userId: string; row: Row | null; checkedAt: string };

const cacheKey = (userId: string) => `plan_cache:${userId}`;

function toState(row: Row | null, source: PremiumState['source']): PremiumState {
  return {
    plan: isActivePremium(row) ? 'premium' : 'free',
    subscription: row
      ? {
          status: row.status,
          expiresAt: row.expires_at,
          willRenew: !!row.will_renew,
          store: row.store ?? null,
        }
      : null,
    source,
  };
}

export async function loadPremiumState(userId: string): Promise<PremiumState> {
  if (isLocalMode()) {
    // Development only: the mock store plays the server's role (no account, no backend).
    return toState((__DEV__ && mockBillingState.subscriptions.get(userId)) || null, 'local');
  }
  const db = await getDb();
  try {
    const { data, error } = await getSupabase()
      .from('subscriptions')
      .select('status, expires_at, entitlement, will_renew, store')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    const cached: Cached = {
      userId,
      row: (data as Row | null) ?? null,
      checkedAt: new Date().toISOString(),
    };
    await setMeta(db, cacheKey(userId), JSON.stringify(cached));
    return toState(cached.row, 'server');
  } catch {
    const raw = await getMeta(db, cacheKey(userId));
    const cached = raw ? (JSON.parse(raw) as Cached) : null;
    if (!cached || cached.userId !== userId) return toState(null, 'none');
    return toState(cached.row, 'cache');
  }
}

export function usePremium(): PremiumState {
  const userId = useSession((s) => s.userId);
  const { data } = useQuery({
    queryKey: ['plan', userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: () => loadPremiumState(userId!),
  });
  // Different user than the cached answer → free until this user's state is loaded.
  return data ?? { plan: 'free', subscription: null, source: 'none' };
}

export const usePlan = (): Plan => usePremium().plan;

/** Re-reads the plan for the current user and returns it. */
export async function reloadPlan(): Promise<Plan> {
  const userId = useSession.getState().userId;
  if (!userId) return 'free';
  await queryClient.invalidateQueries({ queryKey: ['plan', userId], refetchType: 'none' });
  const state = await queryClient.fetchQuery({
    queryKey: ['plan', userId],
    queryFn: () => loadPremiumState(userId),
  });
  return state.plan;
}

/**
 * Asks the server to re-verify the caller's purchases with RevenueCat and store the result.
 * Returns the server's verdict, or null if it couldn't be reached / isn't configured.
 */
export async function verifyWithServer(): Promise<boolean | null> {
  if (isLocalMode()) return null;
  try {
    const { data, error } = await getSupabase().functions.invoke<{ premium?: boolean }>(
      'subscription-sync',
      { method: 'POST' },
    );
    if (error || typeof data?.premium !== 'boolean') return null;
    return data.premium;
  } catch {
    return null;
  }
}

let lastVerify = 0;
const VERIFY_INTERVAL = 10 * 60_000;

/** Foreground re-check (renewals, cancellations, refunds) at most every 10 minutes. */
export async function revalidatePremium(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastVerify < VERIFY_INTERVAL) return;
  lastVerify = now;
  await verifyWithServer();
  await reloadPlan().catch(() => {});
}

export function resetPremiumForTests() {
  lastVerify = 0;
}
