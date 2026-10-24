// Supabase Edge Function: re-verifies the caller's subscription with RevenueCat and stores it.
// Called by the app after purchase / restore and when the app returns to the foreground.
// Deploy: supabase functions deploy subscription-sync
// Secret: REVENUECAT_SECRET_API_KEY (server-only).
import {
  adminClient,
  billingStore,
  subscriberFetcher,
  toHttpRequest,
  toResponse,
} from '../_shared/deno.ts';
import { handleSync } from '../_shared/revenuecat.ts';

Deno.serve(async (req: Request) => {
  const db = adminClient();
  try {
    const res = await handleSync(toHttpRequest(req), {
      applyState: billingStore(db).applyState,
      userIdFromToken: async (jwt) => {
        const { data, error } = await db.auth.getUser(jwt);
        return error ? null : (data.user?.id ?? null);
      },
      fetchSubscriber: subscriberFetcher(),
    });
    return toResponse(res);
  } catch (e) {
    console.error('subscription-sync failed', e instanceof Error ? e.message : 'unknown');
    return toResponse({ status: 502, body: { error: 'upstream' } });
  }
});
