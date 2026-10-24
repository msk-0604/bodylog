import { useQuery } from '@tanstack/react-query';

import { getDb } from '@/data/db/expoDb';
import { getMeta, setMeta } from '@/data/repo/profile';
import type { Plan } from '@/domain/entitlements';
import { isActivePremium, type SubscriptionRow } from '@/domain/subscription';
import { useSession } from '@/features/auth/session';
import { isLocalMode } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';

const CACHE_KEY = 'plan_cache';

/**
 * Current plan from the server-side `subscriptions` row (written only by the RevenueCat webhook).
 * Offline: last known state is used until its expiry date.
 */
export function usePlan(): Plan {
  const userId = useSession((s) => s.userId);
  const { data } = useQuery({
    queryKey: ['plan', userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Plan> => {
      if (isLocalMode()) return 'free';
      const db = await getDb();
      try {
        const { data: row, error } = await getSupabase()
          .from('subscriptions')
          .select('status, expires_at, entitlement')
          .eq('user_id', userId!)
          .maybeSingle();
        if (error) throw error;
        await setMeta(db, CACHE_KEY, JSON.stringify(row ?? null));
        return isActivePremium(row) ? 'premium' : 'free';
      } catch {
        const cached = await getMeta(db, CACHE_KEY);
        return isActivePremium(cached ? (JSON.parse(cached) as SubscriptionRow) : null)
          ? 'premium'
          : 'free';
      }
    },
  });
  return data ?? 'free';
}
