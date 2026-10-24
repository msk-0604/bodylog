/**
 * Weigh-in reminder run (pure logic, no Deno/Node APIs; unit-tested from Jest).
 *
 * 1. claim: the DB returns users whose reminder time has passed in their zone, who have no
 *    weight record for that local date and haven't been sent one today (idempotent).
 * 2. send: one Expo push per valid device token, batched (≤ 100 messages per request).
 * 3. record: per-device tickets; DeviceNotRegistered invalidates the token; a failed request
 *    marks the delivery failed so a later run retries it (bounded in SQL).
 * 4. receipts: tickets older than ~15 min are checked with Expo's receipts API.
 *
 * "Accepted by Expo" (ticket) and "accepted by APNs/FCM" (receipt) are delivery results only;
 * whether the phone actually displayed it is not observable from the server.
 */
import { isAuthorizedWebhook } from './revenuecat.ts';
import type { HttpRequest, HttpResponse } from './revenuecat.ts';

export type DeviceToken = { id: string; token: string; platform: 'ios' | 'android' };
export type ClaimedDelivery = {
  delivery_id: string;
  user_id: string;
  local_date: string;
  tokens: DeviceToken[];
};

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: { url: '/weight-entry'; kind: 'weigh_in'; date: string };
  sound: 'default';
  badge: number;
  channelId: string;
  priority: 'high';
};

export type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

export type ExpoReceipt =
  { status: 'ok' } | { status: 'error'; message?: string; details?: { error?: string } };

export type TicketResult = {
  token_id: string;
  status: 'ok' | 'error';
  ticket_id?: string;
  error?: string;
};

export type ReminderDeps = {
  cronSecret: string | undefined;
  now?: () => Date;
  claim(now: Date): Promise<ClaimedDelivery[]>;
  /** Throws when the request itself fails (network, non-2xx). */
  sendPush(messages: ExpoMessage[]): Promise<ExpoTicket[]>;
  recordResults(deliveryId: string, results: TicketResult[]): Promise<string>;
  failDelivery(deliveryId: string, error: string): Promise<void>;
  pendingReceipts(now: Date): Promise<string[]>;
  fetchReceipts(ids: string[]): Promise<Record<string, ExpoReceipt>>;
  recordReceipts(
    receipts: { ticket_id: string; status: 'ok' | 'error'; error?: string }[],
  ): Promise<void>;
};

export const ANDROID_CHANNEL_ID = 'weigh-in';
const MAX_MESSAGES = 100;
const MAX_RECEIPT_IDS = 1000;

export function buildMessage(d: ClaimedDelivery, t: DeviceToken): ExpoMessage {
  return {
    to: t.token,
    title: '体重を記録しましょう',
    body: '今日の体重はまだ記録されていません。毎日同じタイミングで測ると、変化がわかりやすくなります。',
    data: { url: '/weight-entry', kind: 'weigh_in', date: d.local_date },
    sound: 'default',
    // iOS shows it on the icon; Android launchers decide themselves (dot, count or nothing)
    badge: 1,
    channelId: ANDROID_CHANNEL_ID,
    priority: 'high',
  };
}

/** Groups deliveries so one delivery's devices are never split across requests. */
export function batches(deliveries: ClaimedDelivery[], max = MAX_MESSAGES): ClaimedDelivery[][] {
  const out: ClaimedDelivery[][] = [];
  let cur: ClaimedDelivery[] = [];
  let size = 0;
  for (const d of deliveries) {
    const n = Math.min(d.tokens.length, max);
    if (size + n > max && cur.length) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push({ ...d, tokens: d.tokens.slice(0, max) });
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

const ticketResult = (tokenId: string, t: ExpoTicket | undefined): TicketResult =>
  t?.status === 'ok'
    ? { token_id: tokenId, status: 'ok', ticket_id: t.id }
    : {
        token_id: tokenId,
        status: 'error',
        error: (t && t.status === 'error' && (t.details?.error ?? t.message)) || 'NoTicket',
      };

export type RunSummary = {
  claimed: number;
  sent: number;
  failed: number;
  noDevices: number;
  receiptsChecked: number;
};

export async function runWeighInReminders(deps: ReminderDeps): Promise<RunSummary> {
  const now = deps.now?.() ?? new Date();
  const claimed = await deps.claim(now);
  const summary: RunSummary = {
    claimed: claimed.length,
    sent: 0,
    failed: 0,
    noDevices: 0,
    receiptsChecked: 0,
  };

  for (const group of batches(claimed)) {
    const ready = group.filter((d) => d.tokens.length > 0);
    for (const d of group.filter((g) => g.tokens.length === 0)) {
      await deps.recordResults(d.delivery_id, []);
      summary.noDevices++;
    }
    if (!ready.length) continue;
    const messages = ready.flatMap((d) => d.tokens.map((t) => buildMessage(d, t)));
    let tickets: ExpoTicket[];
    try {
      tickets = await deps.sendPush(messages);
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'send failed';
      for (const d of ready) await deps.failDelivery(d.delivery_id, reason);
      summary.failed += ready.length;
      continue;
    }
    let i = 0;
    for (const d of ready) {
      const results = d.tokens.map((t) => ticketResult(t.id, tickets[i++]));
      const status = await deps.recordResults(d.delivery_id, results);
      if (status === 'sent') summary.sent++;
      else if (status === 'no_devices') summary.noDevices++;
      else summary.failed++;
    }
  }

  // Receipts are best effort: a failure here must not undo the sends above.
  try {
    const ids = await deps.pendingReceipts(now);
    for (let k = 0; k < ids.length; k += MAX_RECEIPT_IDS) {
      const chunk = ids.slice(k, k + MAX_RECEIPT_IDS);
      const receipts = await deps.fetchReceipts(chunk);
      const rows = Object.entries(receipts).map(([ticket_id, r]) =>
        r.status === 'ok'
          ? { ticket_id, status: 'ok' as const }
          : {
              ticket_id,
              status: 'error' as const,
              error: r.details?.error ?? r.message ?? 'Unknown',
            },
      );
      if (rows.length) await deps.recordReceipts(rows);
      summary.receiptsChecked += rows.length;
    }
  } catch {
    // retried on the next run (receipts stay available for about a day)
  }
  return summary;
}

/** HTTP entry for the scheduled call (pg_cron → pg_net → this function). */
export async function handleReminderRun(
  req: HttpRequest,
  deps: ReminderDeps,
): Promise<HttpResponse> {
  if (req.method !== 'POST') return { status: 405, body: { error: 'method_not_allowed' } };
  if (!isAuthorizedWebhook(req.header('Authorization'), deps.cronSecret)) {
    return { status: 401, body: { error: 'unauthorized' } };
  }
  const summary = await runWeighInReminders(deps);
  return { status: 200, body: { ok: true, ...summary } };
}
