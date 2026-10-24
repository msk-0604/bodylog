/**
 * Server-side billing logic shared by the Edge Functions (supabase/functions/_shared).
 * The Deno wiring (Supabase client, fetch to RevenueCat) is not executed here.
 */
import {
  affectedUserIds,
  handleSync,
  handleWebhook,
  isAuthorizedWebhook,
  stateFromEvent,
  stateFromSubscriber,
  type HttpRequest,
  type SubscriptionState,
  type WebhookDeps,
  type WebhookEvent,
} from '../../../supabase/functions/_shared/revenuecat';

const SECRET = 'whsec-test-0123456789abcdef0123456789abcdef';
const U = '11111111-1111-4111-8111-111111111111';
const V = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-24T00:00:00Z');
const DAY = 86_400_000;

const req = (
  body: unknown,
  auth: string | null = `Bearer ${SECRET}`,
  method = 'POST',
): HttpRequest => ({
  method,
  header: (n) => (n.toLowerCase() === 'authorization' ? auth : null),
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

const event = (e: Partial<WebhookEvent>) => ({
  api_version: '1.0',
  event: {
    id: 'evt-1',
    type: 'INITIAL_PURCHASE',
    app_user_id: U,
    entitlement_ids: ['premium'],
    product_id: 'jp.bodylog.premium.monthly',
    period_type: 'NORMAL',
    store: 'APP_STORE',
    environment: 'SANDBOX',
    event_timestamp_ms: NOW.getTime() - 60_000,
    expiration_at_ms: NOW.getTime() + 30 * DAY,
    ...e,
  },
});

function fakeStore() {
  const events = new Map<string, boolean>(); // id → finished
  const applied: { userId: string; state: SubscriptionState; eventId: string; eventAt: string }[] =
    [];
  const deps: WebhookDeps = {
    webhookSecret: SECRET,
    now: () => NOW,
    recordEvent: async (e) => {
      if (!events.has(e.id)) {
        events.set(e.id, false);
        return 'new';
      }
      return events.get(e.id) ? 'duplicate' : 'retry';
    },
    finishEvent: async (id) => void events.set(id, true),
    applyState: async (userId, state, eventId, eventAt) => {
      applied.push({ userId, state, eventId, eventAt });
      return true;
    },
  };
  return { deps, events, applied };
}

describe('webhook authentication', () => {
  it('accepts only the configured Authorization value (constant-time compare)', () => {
    expect(isAuthorizedWebhook(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isAuthorizedWebhook(SECRET, SECRET)).toBe(true);
    expect(isAuthorizedWebhook(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isAuthorizedWebhook('Bearer wrong', SECRET)).toBe(false);
    expect(isAuthorizedWebhook(null, SECRET)).toBe(false);
  });

  it('fails closed when the server secret is missing or weak', () => {
    expect(isAuthorizedWebhook('Bearer ', '')).toBe(false);
    expect(isAuthorizedWebhook('Bearer short', 'short')).toBe(false);
    expect(isAuthorizedWebhook('Bearer x', undefined)).toBe(false);
  });

  it('rejects unauthenticated, wrong-method and malformed requests without touching the DB', async () => {
    const { deps, applied, events } = fakeStore();
    expect((await handleWebhook(req(event({}), 'Bearer nope'), deps)).status).toBe(401);
    expect((await handleWebhook(req(event({}), null), deps)).status).toBe(401);
    expect((await handleWebhook(req(event({}), `Bearer ${SECRET}`, 'GET'), deps)).status).toBe(405);
    expect((await handleWebhook(req('{not json'), deps)).status).toBe(400);
    expect((await handleWebhook(req({ event: { type: 'X' } }), deps)).status).toBe(400);
    expect(applied).toHaveLength(0);
    expect(events.size).toBe(0);
  });
});

describe('webhook processing without the REST API (event-derived state)', () => {
  it('grants Premium on purchase and stamps the event time for ordering', async () => {
    const { deps, applied, events } = fakeStore();
    const res = await handleWebhook(req(event({})), deps);
    expect(res.status).toBe(200);
    expect(applied).toEqual([
      {
        userId: U,
        eventId: 'evt-1',
        eventAt: new Date(NOW.getTime() - 60_000).toISOString(),
        state: {
          status: 'active',
          store: 'app_store',
          productId: 'jp.bodylog.premium.monthly',
          periodType: 'normal',
          expiresAt: new Date(NOW.getTime() + 30 * DAY).toISOString(),
          willRenew: true,
        },
      },
    ]);
    expect(events.get('evt-1')).toBe(true);
  });

  it('ignores duplicate deliveries but reprocesses an unfinished one', async () => {
    const { deps, applied, events } = fakeStore();
    await handleWebhook(req(event({})), deps);
    const dup = await handleWebhook(req(event({})), deps);
    expect(dup.body).toMatchObject({ duplicate: true });
    expect(applied).toHaveLength(1);

    events.set('evt-2', false); // stored earlier, crashed before finishing
    await handleWebhook(req(event({ id: 'evt-2', type: 'RENEWAL' })), deps);
    expect(applied).toHaveLength(2);
  });

  it('ignores anonymous RevenueCat ids, TEST events and other entitlements', async () => {
    const { deps, applied } = fakeStore();
    await handleWebhook(req(event({ app_user_id: '$RCAnonymousID:abc' })), deps);
    await handleWebhook(req(event({ id: 'evt-t', type: 'TEST' })), deps);
    await handleWebhook(req(event({ id: 'evt-o', entitlement_ids: ['other'] })), deps);
    expect(applied).toHaveLength(0);
  });

  it('maps cancellation, refund, billing issue, pause and expiration', () => {
    const s = (e: Partial<WebhookEvent>) => stateFromEvent(event(e).event as WebhookEvent);
    expect(s({ type: 'CANCELLATION' })).toMatchObject({ status: 'cancelled', willRenew: false });
    expect(s({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' })).toMatchObject({
      status: 'refunded',
    });
    expect(s({ type: 'BILLING_ISSUE' })).toMatchObject({ status: 'billing_issue' });
    expect(s({ type: 'SUBSCRIPTION_PAUSED' })).toMatchObject({ status: 'cancelled' });
    expect(s({ type: 'EXPIRATION' })).toMatchObject({ status: 'expired' });
    expect(s({ type: 'UNCANCELLATION' })).toMatchObject({ status: 'active', willRenew: true });
    expect(s({ type: 'TRANSFER' })).toBeNull();
    expect(s({ store: 'PLAY_STORE' })).toMatchObject({ store: 'play_store' });
  });
});

describe('webhook processing with the REST API (authoritative re-read)', () => {
  it('re-reads every affected user, including both sides of a transfer', async () => {
    const { deps, applied } = fakeStore();
    const subscribers: Record<string, unknown> = {
      [U]: { subscriber: { entitlements: {}, subscriptions: {} } },
      [V]: {
        subscriber: {
          entitlements: {
            premium: {
              expires_date: '2026-11-24T00:00:00Z',
              product_identifier: 'jp.bodylog.premium.monthly',
            },
          },
          subscriptions: {
            'jp.bodylog.premium.monthly': { store: 'play_store', period_type: 'normal' },
          },
        },
      },
    };
    deps.fetchSubscriber = async (id) => subscribers[id];
    const transfer = event({
      id: 'evt-x',
      type: 'TRANSFER',
      app_user_id: undefined,
      transferred_from: [U],
      transferred_to: [V, '$RCAnonymousID:zzz'],
    });
    expect(affectedUserIds(transfer.event as WebhookEvent)).toEqual([U, V]);
    await handleWebhook(req(transfer), deps);
    expect(applied.map((a) => [a.userId, a.state.status, a.eventAt])).toEqual([
      [U, 'expired', NOW.toISOString()],
      [V, 'active', NOW.toISOString()],
    ]);
  });
});

describe('REST subscriber → state', () => {
  const sub = (ent: object, subscription: object = {}) => ({
    subscriber: {
      entitlements: { premium: { product_identifier: 'm', ...ent } },
      subscriptions: { m: { store: 'app_store', period_type: 'normal', ...subscription } },
    },
  });
  const future = '2026-11-24T00:00:00.000Z';

  it('active, cancelled (access until expiry), billing issue (grace), refunded, expired', () => {
    expect(stateFromSubscriber(sub({ expires_date: future }), NOW)).toMatchObject({
      status: 'active',
      willRenew: true,
      expiresAt: future,
      store: 'app_store',
    });
    expect(
      stateFromSubscriber(sub({ expires_date: future }, { unsubscribe_detected_at: 'x' }), NOW),
    ).toMatchObject({ status: 'cancelled', willRenew: false });
    expect(
      stateFromSubscriber(
        sub(
          { expires_date: '2026-10-23T00:00:00Z', grace_period_expires_date: future },
          { billing_issues_detected_at: 'x' },
        ),
        NOW,
      ),
    ).toMatchObject({ status: 'billing_issue', expiresAt: future });
    expect(
      stateFromSubscriber(sub({ expires_date: future }, { refunded_at: 'x' }), NOW),
    ).toMatchObject({ status: 'refunded' });
    expect(stateFromSubscriber(sub({ expires_date: '2026-10-01T00:00:00Z' }), NOW)).toMatchObject({
      status: 'expired',
    });
  });

  it('lifetime promotional grants and users without Premium', () => {
    expect(
      stateFromSubscriber(
        {
          subscriber: {
            entitlements: { premium: { expires_date: null, product_identifier: 'p' } },
          },
        },
        NOW,
      ),
    ).toMatchObject({ status: 'active', expiresAt: 'infinity', willRenew: false });
    expect(stateFromSubscriber({ subscriber: { entitlements: {} } }, NOW)).toBeNull();
    expect(stateFromSubscriber(null, NOW)).toBeNull();
  });
});

describe('subscription-sync', () => {
  const syncReq = (auth: string | null) => req('', auth);

  it('identifies the caller only from the access token', async () => {
    const applied: string[] = [];
    const deps = {
      now: () => NOW,
      userIdFromToken: async (jwt: string) => (jwt === 'good' ? U : null),
      fetchSubscriber: async () => ({
        subscriber: {
          entitlements: {
            premium: { expires_date: '2026-11-24T00:00:00Z', product_identifier: 'm' },
          },
          subscriptions: { m: { store: 'app_store' } },
        },
      }),
      applyState: async (uid: string) => {
        applied.push(uid);
        return true;
      },
    };
    expect((await handleSync(syncReq(null), deps)).status).toBe(401);
    expect((await handleSync(syncReq('Bearer bad'), deps)).status).toBe(401);
    const ok = await handleSync(syncReq('Bearer good'), deps);
    expect(ok).toEqual({ status: 200, body: { ok: true, premium: true } });
    expect(applied).toEqual([U]);
  });

  it('reports not_configured when the RevenueCat secret key is missing', async () => {
    const res = await handleSync(syncReq('Bearer good'), {
      userIdFromToken: async () => U,
      applyState: async () => true,
    });
    expect(res).toEqual({ status: 503, body: { error: 'not_configured' } });
  });
});
