// Supabase Edge Function: sends the daily weigh-in reminder as an Expo push notification to
// users who have NOT recorded their weight today (in their own time zone).
// Started every 5 minutes by pg_cron (supabase/manual/schedule_weigh_in_reminders.sql).
// Deploy: supabase functions deploy weigh-in-reminders --no-verify-jwt
// Secrets (supabase secrets set …, never in the repository):
//   REMINDER_CRON_SECRET  shared secret the cron job sends as "Authorization: Bearer …" (≥ 32 chars)
//   EXPO_ACCESS_TOKEN     optional; required only if "Enhanced push security" is enabled in Expo
import { adminClient, toHttpRequest, toResponse } from '../_shared/deno.ts';
import {
  handleReminderRun,
  type ClaimedDelivery,
  type ExpoMessage,
  type ExpoReceipt,
  type ExpoTicket,
} from '../_shared/weighInReminders.ts';

const EXPO = 'https://exp.host/--/api/v2/push';

async function expoPost<T>(path: string, body: unknown): Promise<T> {
  const token = Deno.env.get('EXPO_ACCESS_TOKEN');
  const res = await fetch(`${EXPO}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`expo_${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.data === undefined) throw new Error('expo_no_data');
  return json.data;
}

Deno.serve(async (req: Request) => {
  const db = adminClient();
  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as T;
  };
  try {
    const res = await handleReminderRun(toHttpRequest(req), {
      cronSecret: Deno.env.get('REMINDER_CRON_SECRET'),
      claim: (now) =>
        rpc<ClaimedDelivery[]>('claim_weigh_in_reminders', { p_now: now.toISOString() }),
      sendPush: (messages: ExpoMessage[]) => expoPost<ExpoTicket[]>('send', messages),
      recordResults: (id, results) =>
        rpc<string>('record_weigh_in_results', { p_delivery_id: id, p_results: results }),
      failDelivery: (id, error) =>
        rpc<void>('fail_weigh_in_delivery', { p_delivery_id: id, p_error: error }),
      pendingReceipts: async (now) =>
        (
          await rpc<{ ticket_id: string }[]>('pending_push_receipts', { p_now: now.toISOString() })
        ).map((r) => r.ticket_id),
      fetchReceipts: (ids) => expoPost<Record<string, ExpoReceipt>>('getReceipts', { ids }),
      recordReceipts: (rows) => rpc<void>('record_push_receipts', { p_receipts: rows }),
    });
    return toResponse(res);
  } catch (e) {
    // No personal data in logs; deliveries stay "sending" and are retried after 15 min.
    console.error('weigh-in-reminders failed', e instanceof Error ? e.message : 'unknown');
    return toResponse({ status: 500, body: { error: 'internal' } });
  }
});
