/**
 * RevenueCat → subscription state (pure logic, no Deno/Node APIs).
 *
 * Shared by the Edge Functions `revenuecat-webhook` and `subscription-sync`, and unit-tested
 * from Jest (src/__tests__/server/). The handlers take their I/O as dependencies so the
 * security-relevant decisions (authentication, idempotency, ordering, user mapping) are tested
 * without a Supabase project.
 *
 * Verify field names against the current RevenueCat docs before release:
 * webhook event fields, REST API v1 `GET /subscribers/{app_user_id}` response.
 */

export const ENTITLEMENT_ID = 'premium';

export type SubscriptionStatus =
  'active' | 'cancelled' | 'billing_issue' | 'expired' | 'refunded' | 'paused';
export type StoreName = 'app_store' | 'play_store' | 'promotional' | 'test_store';

export type SubscriptionState = {
  status: SubscriptionStatus;
  store: StoreName | null;
  productId: string | null;
  periodType: string | null;
  /** ISO timestamp, 'infinity' for grants without an end, null if unknown */
  expiresAt: string | null;
  willRenew: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** App user ids are Supabase auth uids; anonymous RevenueCat ids ($RCAnonymousID:…) never are. */
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/** Constant-time string comparison (length is not secret: the header has a fixed format). */
export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * RevenueCat sends the Authorization header value configured in the dashboard verbatim.
 * Fails closed when the server secret is missing or too short.
 */
export function isAuthorizedWebhook(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header) return false;
  return timingSafeEqual(header, `Bearer ${secret}`) || timingSafeEqual(header, secret);
}

function mapStore(store: unknown): StoreName | null {
  switch (String(store ?? '').toUpperCase()) {
    case 'APP_STORE':
    case 'MAC_APP_STORE':
      return 'app_store';
    case 'PLAY_STORE':
      return 'play_store';
    case 'PROMOTIONAL':
      return 'promotional';
    case 'TEST_STORE':
      return 'test_store';
    default:
      return null;
  }
}

const msToIso = (ms: unknown): string | null =>
  typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null;

/* ---------------- webhook events ---------------- */

export type WebhookEvent = {
  id: string;
  type: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_from?: string[];
  transferred_to?: string[];
  entitlement_ids?: string[] | null;
  product_id?: string;
  period_type?: string;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number;
  store?: string;
  environment?: string;
  cancel_reason?: string;
};

export function parseWebhookBody(text: string): WebhookEvent | null {
  try {
    const body = JSON.parse(text) as { event?: Partial<WebhookEvent> };
    const e = body?.event;
    if (!e || typeof e.id !== 'string' || !e.id || typeof e.type !== 'string') return null;
    return e as WebhookEvent;
  } catch {
    return null;
  }
}

/** Supabase users an event concerns (transfers touch both sides). */
export function affectedUserIds(e: WebhookEvent): string[] {
  const ids = [
    e.app_user_id,
    e.original_app_user_id,
    ...(e.aliases ?? []),
    ...(e.transferred_from ?? []),
    ...(e.transferred_to ?? []),
  ].filter(isUuid);
  return [...new Set(ids.map((v) => v.toLowerCase()))];
}

const GRANTING = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'NON_RENEWING_PURCHASE',
  'REFUND_REVERSED',
]);

/**
 * State implied by a single event. Used only when the REST API is not configured; otherwise
 * the handler re-reads the subscriber (authoritative and immune to ordering problems).
 * Returns null for events that do not change the premium state of `app_user_id`.
 */
export function stateFromEvent(e: WebhookEvent): SubscriptionState | null {
  if (e.entitlement_ids && !e.entitlement_ids.includes(ENTITLEMENT_ID)) return null;
  const base = {
    store: mapStore(e.store),
    productId: e.product_id ?? null,
    periodType: e.period_type ? e.period_type.toLowerCase() : null,
    expiresAt: e.expiration_at_ms === null ? 'infinity' : msToIso(e.expiration_at_ms),
  };
  if (GRANTING.has(e.type)) {
    return { ...base, status: 'active', willRenew: e.type !== 'NON_RENEWING_PURCHASE' };
  }
  switch (e.type) {
    case 'CANCELLATION':
      // A refund (customer support) ends access now; a normal cancellation keeps it to expiry.
      return e.cancel_reason === 'CUSTOMER_SUPPORT'
        ? { ...base, status: 'refunded', willRenew: false }
        : { ...base, status: 'cancelled', willRenew: false };
    case 'SUBSCRIPTION_PAUSED':
      // Play: the pause starts at the end of the period; access continues until then.
      return { ...base, status: 'cancelled', willRenew: false };
    case 'BILLING_ISSUE':
      return { ...base, status: 'billing_issue', willRenew: true };
    case 'EXPIRATION':
      return { ...base, status: 'expired', willRenew: false };
    default:
      return null; // TEST, TRANSFER (needs the REST API), INVOICE_ISSUANCE, …
  }
}

/* ---------------- REST API subscriber ---------------- */

type RestSubscriber = {
  subscriber?: {
    entitlements?: Record<
      string,
      {
        expires_date?: string | null;
        grace_period_expires_date?: string | null;
        product_identifier?: string;
      }
    >;
    subscriptions?: Record<
      string,
      {
        expires_date?: string | null;
        store?: string;
        period_type?: string;
        unsubscribe_detected_at?: string | null;
        billing_issues_detected_at?: string | null;
        refunded_at?: string | null;
      }
    >;
  };
};

/** Current state from `GET /v1/subscribers/{id}`; null if the user never had Premium. */
export function stateFromSubscriber(json: unknown, now = new Date()): SubscriptionState | null {
  const s = (json as RestSubscriber)?.subscriber;
  const ent = s?.entitlements?.[ENTITLEMENT_ID];
  if (!ent) return null;
  const productId = ent.product_identifier ?? null;
  const sub = productId ? s?.subscriptions?.[productId] : undefined;
  const end = ent.grace_period_expires_date ?? ent.expires_date ?? null;
  const expiresAt = end === null ? 'infinity' : new Date(end).toISOString();
  const base = {
    store: mapStore(sub?.store),
    productId,
    periodType: sub?.period_type ?? null,
    expiresAt,
  };
  if (sub?.refunded_at) return { ...base, status: 'refunded', willRenew: false };
  if (expiresAt !== 'infinity' && new Date(expiresAt) <= now) {
    return { ...base, status: 'expired', willRenew: false };
  }
  if (sub?.billing_issues_detected_at) return { ...base, status: 'billing_issue', willRenew: true };
  if (sub?.unsubscribe_detected_at) return { ...base, status: 'cancelled', willRenew: false };
  const renews = !!sub && base.store !== 'promotional' && expiresAt !== 'infinity';
  return { ...base, status: 'active', willRenew: renews };
}

const NEVER: SubscriptionState = {
  status: 'expired',
  store: null,
  productId: null,
  periodType: null,
  expiresAt: null,
  willRenew: false,
};

export function isPremiumState(s: SubscriptionState | null, now = new Date()): boolean {
  if (!s || !s.expiresAt || ['expired', 'refunded', 'paused'].includes(s.status)) return false;
  return s.expiresAt === 'infinity' || new Date(s.expiresAt) > now;
}

/* ---------------- handlers ---------------- */

export type HttpRequest = {
  method: string;
  header(name: string): string | null;
  text(): Promise<string>;
};
export type HttpResponse = { status: number; body: Record<string, unknown> };

export type BillingStore = {
  /** returns 'new' | 'retry' | 'duplicate' */
  recordEvent(e: WebhookEvent, userId: string | null, eventAt: string): Promise<string>;
  finishEvent(id: string): Promise<void>;
  applyState(
    userId: string,
    s: SubscriptionState,
    eventId: string,
    eventAt: string,
  ): Promise<boolean>;
};

export type WebhookDeps = BillingStore & {
  webhookSecret: string | undefined;
  /** REST API lookup; undefined when the secret API key is not configured */
  fetchSubscriber?: (userId: string) => Promise<unknown>;
  now?: () => Date;
};

export async function handleWebhook(req: HttpRequest, deps: WebhookDeps): Promise<HttpResponse> {
  if (req.method !== 'POST') return { status: 405, body: { error: 'method_not_allowed' } };
  if (!isAuthorizedWebhook(req.header('Authorization'), deps.webhookSecret)) {
    return { status: 401, body: { error: 'unauthorized' } };
  }
  const event = parseWebhookBody(await req.text());
  if (!event) return { status: 400, body: { error: 'invalid_body' } };
  if (event.type === 'TEST') return { status: 200, body: { ok: true, ignored: 'test' } };

  const now = deps.now?.() ?? new Date();
  const eventAt = msToIso(event.event_timestamp_ms) ?? now.toISOString();
  const users = affectedUserIds(event);
  const primary = isUuid(event.app_user_id) ? event.app_user_id.toLowerCase() : null;

  const recorded = await deps.recordEvent(event, primary, eventAt);
  if (recorded === 'duplicate') return { status: 200, body: { ok: true, duplicate: true } };

  if (deps.fetchSubscriber) {
    // Authoritative: re-read every affected user. Stamped with "now" so that older events
    // delivered later cannot roll the state back.
    for (const uid of users) {
      const state = stateFromSubscriber(await deps.fetchSubscriber(uid), now) ?? NEVER;
      await deps.applyState(uid, state, event.id, now.toISOString());
    }
  } else if (primary) {
    const state = stateFromEvent(event);
    if (state) await deps.applyState(primary, state, event.id, eventAt);
  }
  await deps.finishEvent(event.id);
  return { status: 200, body: { ok: true } };
}

export type SyncDeps = Pick<BillingStore, 'applyState'> & {
  /** Supabase user id from the caller's access token (never from the body) */
  userIdFromToken(jwt: string): Promise<string | null>;
  fetchSubscriber?: (userId: string) => Promise<unknown>;
  now?: () => Date;
};

/** Called by the app after a purchase/restore and on launch to re-verify with RevenueCat. */
export async function handleSync(req: HttpRequest, deps: SyncDeps): Promise<HttpResponse> {
  if (req.method !== 'POST') return { status: 405, body: { error: 'method_not_allowed' } };
  const jwt = (req.header('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const userId = jwt ? await deps.userIdFromToken(jwt) : null;
  if (!userId) return { status: 401, body: { error: 'unauthorized' } };
  if (!deps.fetchSubscriber) return { status: 503, body: { error: 'not_configured' } };

  const now = deps.now?.() ?? new Date();
  const state = stateFromSubscriber(await deps.fetchSubscriber(userId), now);
  await deps.applyState(userId, state ?? NEVER, `sync:${now.getTime()}`, now.toISOString());
  return { status: 200, body: { ok: true, premium: isPremiumState(state, now) } };
}
