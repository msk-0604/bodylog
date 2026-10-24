/**
 * Weigh-in reminder run (supabase/functions/_shared/weighInReminders.ts) with in-memory deps.
 * The SQL side (who is due, once per local day, retries) is tested in
 * supabase/local-tests/70_weigh_in_reminders.sql.
 */
import {
  batches,
  buildMessage,
  handleReminderRun,
  runWeighInReminders,
  type ClaimedDelivery,
  type ExpoMessage,
  type ExpoTicket,
  type ReminderDeps,
  type TicketResult,
} from '../../../supabase/functions/_shared/weighInReminders';

const SECRET = 'cron-secret-0123456789abcdef0123456789abcdef';
const NOW = new Date('2026-10-24T11:05:00Z');

const delivery = (id: string, tokens: string[]): ClaimedDelivery => ({
  delivery_id: id,
  user_id: `user-${id}`,
  local_date: '2026-10-24',
  tokens: tokens.map((t, i) => ({
    id: `${id}-tok${i}`,
    token: `ExponentPushToken[${t}]`,
    platform: 'ios',
  })),
});

function harness(claimed: ClaimedDelivery[], send?: (m: ExpoMessage[]) => Promise<ExpoTicket[]>) {
  const sent: ExpoMessage[][] = [];
  const recorded = new Map<string, TicketResult[]>();
  const failed = new Map<string, string>();
  const receipts: unknown[] = [];
  const deps: ReminderDeps = {
    cronSecret: SECRET,
    now: () => NOW,
    claim: async () => claimed,
    sendPush:
      send ??
      (async (m) => {
        sent.push(m);
        return m.map((_, i) => ({ status: 'ok', id: `ticket-${sent.length}-${i}` }));
      }),
    recordResults: async (id, results) => {
      recorded.set(id, results);
      if (results.some((r) => r.status === 'ok')) return 'sent';
      return results.length === 0 || results.every((r) => r.error === 'DeviceNotRegistered')
        ? 'no_devices'
        : 'failed';
    },
    failDelivery: async (id, error) => void failed.set(id, error),
    pendingReceipts: async () => [],
    fetchReceipts: async () => ({}),
    recordReceipts: async (r) => void receipts.push(...r),
  };
  return { deps, sent, recorded, failed, receipts };
}

const req = (auth: string | null, method = 'POST') => ({
  method,
  header: (n: string) => (n.toLowerCase() === 'authorization' ? auth : null),
  text: async () => '',
});

describe('weigh-in reminder run', () => {
  it('rejects calls without the cron secret (fails closed without a configured secret)', async () => {
    const { deps, sent } = harness([delivery('a', ['x'])]);
    expect((await handleReminderRun(req(null), deps)).status).toBe(401);
    expect((await handleReminderRun(req('Bearer nope'), deps)).status).toBe(401);
    expect((await handleReminderRun(req(`Bearer ${SECRET}`, 'GET'), deps)).status).toBe(405);
    expect(
      (await handleReminderRun(req(`Bearer ${SECRET}`), { ...deps, cronSecret: undefined })).status,
    ).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it('sends one message per device of each claimed (unrecorded) user and opens the weight entry', async () => {
    const { deps, sent, recorded } = harness([
      delivery('a', ['phone', 'tablet']),
      delivery('b', ['b1']),
    ]);
    const res = await handleReminderRun(req(`Bearer ${SECRET}`), deps);
    expect(res).toEqual({
      status: 200,
      body: { ok: true, claimed: 2, sent: 2, failed: 0, noDevices: 0, receiptsChecked: 0 },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.map((m) => m.to)).toEqual([
      'ExponentPushToken[phone]',
      'ExponentPushToken[tablet]',
      'ExponentPushToken[b1]',
    ]);
    expect(sent[0]![0]).toMatchObject({
      data: { url: '/weight-entry', kind: 'weigh_in', date: '2026-10-24' },
      badge: 1,
      channelId: 'weigh-in',
    });
    expect(recorded.get('a')).toEqual([
      { token_id: 'a-tok0', status: 'ok', ticket_id: 'ticket-1-0' },
      { token_id: 'a-tok1', status: 'ok', ticket_id: 'ticket-1-1' },
    ]);
  });

  it('sends nothing when nobody is due (recorded today, OFF, already sent)', async () => {
    const { deps, sent } = harness([]);
    expect(await runWeighInReminders(deps)).toMatchObject({ claimed: 0, sent: 0 });
    expect(sent).toHaveLength(0);
  });

  it('maps Expo ticket errors per device (DeviceNotRegistered → token invalidated in SQL)', async () => {
    const { deps, recorded } = harness([delivery('a', ['ok', 'gone'])], async () => [
      { status: 'ok', id: 't1' },
      { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } },
    ]);
    const s = await runWeighInReminders(deps);
    expect(s.sent).toBe(1);
    expect(recorded.get('a')![1]).toEqual({
      token_id: 'a-tok1',
      status: 'error',
      error: 'DeviceNotRegistered',
    });
  });

  it('all devices gone → no_devices (not retried)', async () => {
    const { deps } = harness([delivery('a', ['gone'])], async () => [
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
    ]);
    expect(await runWeighInReminders(deps)).toMatchObject({ sent: 0, noDevices: 1, failed: 0 });
  });

  it('a network error marks the batch failed for a later retry instead of losing it', async () => {
    const { deps, failed, recorded } = harness(
      [delivery('a', ['x']), delivery('b', ['y'])],
      async () => {
        throw new Error('expo_503');
      },
    );
    expect(await runWeighInReminders(deps)).toMatchObject({ claimed: 2, sent: 0, failed: 2 });
    expect([...failed.entries()]).toEqual([
      ['a', 'expo_503'],
      ['b', 'expo_503'],
    ]);
    expect(recorded.size).toBe(0);
  });

  it('a missing ticket is recorded as an error, not as success', async () => {
    const { deps, recorded } = harness([delivery('a', ['x', 'y'])], async () => [
      { status: 'ok', id: 't1' },
    ]);
    await runWeighInReminders(deps);
    expect(recorded.get('a')![1]).toMatchObject({ status: 'error', error: 'NoTicket' });
  });

  it('batches at most 100 messages without splitting one user across requests', () => {
    const many = Array.from({ length: 60 }, (_, i) => delivery(`u${i}`, ['p', 'q']));
    const groups = batches(many);
    expect(groups.map((g) => g.reduce((n, d) => n + d.tokens.length, 0))).toEqual([100, 20]);
  });

  it('checks receipts for older tickets and stores them (receipt ≠ displayed on the phone)', async () => {
    const h = harness([]);
    h.deps.pendingReceipts = async () => ['t1', 't2'];
    h.deps.fetchReceipts = async () => ({
      t1: { status: 'ok' },
      t2: { status: 'error', details: { error: 'DeviceNotRegistered' } },
    });
    const s = await runWeighInReminders(h.deps);
    expect(s.receiptsChecked).toBe(2);
    expect(h.receipts).toEqual([
      { ticket_id: 't1', status: 'ok' },
      { ticket_id: 't2', status: 'error', error: 'DeviceNotRegistered' },
    ]);
  });

  it('a receipts outage does not fail the run', async () => {
    const h = harness([delivery('a', ['x'])]);
    h.deps.pendingReceipts = async () => {
      throw new Error('db down');
    };
    expect(await runWeighInReminders(h.deps)).toMatchObject({ sent: 1 });
  });

  it('message text never blames the user', () => {
    const m = buildMessage(delivery('a', ['x']), {
      id: 't',
      token: 'ExponentPushToken[x]',
      platform: 'android',
    });
    expect(m.title).toBe('体重を記録しましょう');
    expect(m.body).not.toMatch(/忘れ|サボ/);
  });
});
