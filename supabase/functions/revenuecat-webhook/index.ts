// Supabase Edge Function: RevenueCat webhook → public.subscriptions.
// Deploy: supabase functions deploy revenuecat-webhook --no-verify-jwt
//   (RevenueCat cannot send a Supabase JWT; the request is authenticated with the
//    Authorization header value configured in the RevenueCat dashboard instead.)
// Secrets (supabase secrets set …, never in the repository):
//   REVENUECAT_WEBHOOK_AUTH      the Authorization header value (≥ 32 random characters)
//   REVENUECAT_SECRET_API_KEY    RevenueCat secret API key (v1) for authoritative re-reads
import {
  adminClient,
  billingStore,
  subscriberFetcher,
  toHttpRequest,
  toResponse,
} from '../_shared/deno.ts';
import { handleWebhook } from '../_shared/revenuecat.ts';

Deno.serve(async (req: Request) => {
  try {
    const res = await handleWebhook(toHttpRequest(req), {
      ...billingStore(adminClient()),
      webhookSecret: Deno.env.get('REVENUECAT_WEBHOOK_AUTH'),
      fetchSubscriber: subscriberFetcher(),
    });
    return toResponse(res);
  } catch (e) {
    // 5xx makes RevenueCat retry later; the event row stays unfinished and is reprocessed.
    console.error('revenuecat-webhook failed', e instanceof Error ? e.message : 'unknown');
    return toResponse({ status: 500, body: { error: 'internal' } });
  }
});
