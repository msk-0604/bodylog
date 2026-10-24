// Deno-side wiring shared by the billing Edge Functions (not imported by the app or Jest).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

import type { BillingStore, HttpRequest, HttpResponse } from './revenuecat.ts';

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

export const toHttpRequest = (req: Request): HttpRequest => ({
  method: req.method,
  header: (name) => req.headers.get(name),
  text: () => req.text(),
});

export const toResponse = (r: HttpResponse) =>
  new Response(JSON.stringify(r.body), {
    status: r.status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * RevenueCat REST API v1 lookup with the SECRET API key (server-only, never in the app).
 * Returns undefined when the key is not configured.
 */
export function subscriberFetcher(): ((userId: string) => Promise<unknown>) | undefined {
  const key = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!key) return undefined;
  return async (userId) => {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(`revenuecat_${res.status}`);
    return res.json();
  };
}

export function billingStore(db: SupabaseClient): BillingStore {
  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as T;
  };
  return {
    recordEvent: (e, userId, eventAt) =>
      rpc<string>('record_subscription_event', {
        p_id: e.id,
        p_user_id: userId,
        p_event_type: e.type,
        p_event_at: eventAt,
        p_payload: e,
      }),
    finishEvent: (id) => rpc<void>('finish_subscription_event', { p_id: id }),
    applyState: (userId, s, eventId, eventAt) =>
      rpc<boolean>('apply_subscription_state', {
        p_user_id: userId,
        p_status: s.status,
        p_store: s.store,
        p_product_id: s.productId,
        p_period_type: s.periodType,
        p_expires_at: s.expiresAt,
        p_will_renew: s.willRenew,
        p_event_id: eventId,
        p_event_at: eventAt,
      }),
  };
}
