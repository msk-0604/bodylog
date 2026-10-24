/**
 * Weigh-in reminder, device side in Supabase mode: push token registration (never prompts),
 * sign-out unregistration, badge from local data, device time zone sync, settings sync between
 * two devices.
 */
import type { SqlDb } from '@/data/db/types';
import { createTestDb } from '@/data/db/testing/nodeDb';
import { addWeight, deleteWeight } from '@/data/repo/body';
import { getPreferences, savePreferences } from '@/data/repo/settings';
import { syncOnce } from '@/data/sync/syncEngine';
import { FakeRemote } from '@/data/sync/testing/fakeRemote';
import { weighInStatus } from '@/domain/weighIn';
import {
  getInstallationId,
  pushConfig,
  refreshWeighIn,
  registerPushToken,
  syncDeviceTimeZone,
  unregisterPushToken,
} from '@/features/notifications/weighIn';
import { mockNotifications } from '@/testing/notificationsMock';

const U = '11111111-1111-4111-8111-111111111111';

let mockDb: (SqlDb & { close(): void }) | null = null;
jest.mock('@/data/db/expoDb', () => ({ getDb: async () => mockDb }));
jest.mock('@/lib/config', () => ({
  config: {},
  isSupabaseConfigured: () => true,
  isLocalMode: () => false,
  LOCAL_USER_ID: 'local-user',
  revenueCatKeyFor: () => null,
}));
const mockRpc = {
  calls: [] as [string, Record<string, unknown>][],
  error: null as null | { message: string },
};
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      mockRpc.calls.push([fn, args]);
      return { data: null, error: mockRpc.error };
    },
  }),
}));

const at = (h: number, m = 0) => new Date(2026, 9, 24, h, m);

beforeEach(async () => {
  mockDb = await createTestDb();
  mockNotifications.reset();
  mockRpc.calls = [];
  mockRpc.error = null;
  pushConfig.projectId = () => 'eas-project-id';
});
afterEach(() => mockDb?.close());

describe('push token', () => {
  it('registers this installation for the signed-in user without prompting', async () => {
    mockNotifications.permission = { granted: true, canAskAgain: true };
    expect(await registerPushToken()).toBe('registered');
    const device = await getInstallationId();
    expect(mockRpc.calls).toEqual([
      [
        'register_push_token',
        { p_device_id: device, p_token: 'ExponentPushToken[test-device]', p_platform: 'ios' },
      ],
    ]);
    expect(mockNotifications.requests).toBe(0);
    // the installation id is stable
    expect(await getInstallationId()).toBe(device);
  });

  it('does nothing without permission or without an EAS project id', async () => {
    expect(await registerPushToken()).toBe('no-permission');
    mockNotifications.permission = { granted: true, canAskAgain: true };
    pushConfig.projectId = () => null;
    expect(await registerPushToken()).toBe('unavailable');
    expect(mockRpc.calls).toEqual([]);
  });

  it('reports errors (no network / APNs) instead of throwing, so the next launch retries', async () => {
    mockNotifications.permission = { granted: true, canAskAgain: true };
    mockNotifications.pushTokenError = new Error('Network request failed');
    expect(await registerPushToken()).toBe('error');
    mockNotifications.pushTokenError = null;
    mockRpc.error = { message: 'offline' };
    expect(await registerPushToken()).toBe('error');
  });

  it('sign-out unregisters the same installation', async () => {
    await unregisterPushToken();
    expect(mockRpc.calls).toEqual([
      ['unregister_push_token', { p_device_id: await getInstallationId() }],
    ]);
  });
});

describe('badge from local data', () => {
  const enable = (hour = 7, minute = 0) =>
    savePreferences(mockDb!, U, { weighIn: { enabled: true, hour, minute } });

  it('is 1 only after the reminder time while today is unrecorded; record/delete update it', async () => {
    await enable(7, 0);
    expect(await refreshWeighIn(U, at(6, 55))).toBe('upcoming');
    expect(mockNotifications.badge).toBe(0);
    expect(await refreshWeighIn(U, at(7, 0))).toBe('pending');
    expect(mockNotifications.badge).toBe(1);

    const id = await addWeight(mockDb!, U, {
      weightKg: 70,
      bodyFatPct: null,
      measuredAt: at(7, 30),
    });
    expect(await refreshWeighIn(U, at(7, 31))).toBe('recorded');
    expect(mockNotifications.badge).toBe(0);

    await deleteWeight(mockDb!, U, id);
    expect(await refreshWeighIn(U, at(7, 40))).toBe('pending');
    expect(mockNotifications.badge).toBe(1);
  });

  it('a record from yesterday does not count for today', async () => {
    await enable(7, 0);
    await addWeight(mockDb!, U, { weightKg: 70, bodyFatPct: null, measuredAt: at(7, 0) });
    expect(await refreshWeighIn(U, new Date(2026, 9, 25, 8, 0))).toBe('pending');
  });

  it('OFF clears the badge and the delivered notification', async () => {
    mockNotifications.badge = 1;
    mockNotifications.presented = [
      { request: { identifier: 'p1', content: { data: { kind: 'weigh_in' } } } },
      { request: { identifier: 'p2', content: { data: { url: '/meals' } } } },
    ];
    expect(await refreshWeighIn(U, at(9))).toBe('off');
    expect(mockNotifications.badge).toBe(0);
    expect(mockNotifications.presented.map((p) => p.request.identifier)).toEqual(['p2']);
  });

  it('status rule matches the server rule at the boundary (≥ reminder time)', () => {
    const r = { enabled: true, hour: 21, minute: 30 };
    expect(weighInStatus(r, false, at(21, 29))).toBe('upcoming');
    expect(weighInStatus(r, false, at(21, 30))).toBe('pending');
    expect(weighInStatus(r, true, at(23, 0))).toBe('recorded');
  });
});

describe('time zone and multiple devices', () => {
  it('updates the server time zone when the device moves to another zone', async () => {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const elsewhere = device === 'Europe/London' ? 'Asia/Tokyo' : 'Europe/London';
    await savePreferences(mockDb!, U, {
      weighIn: { enabled: true, hour: 7, minute: 0 },
      timeZone: elsewhere,
    });
    const write = async (fn: (db: SqlDb, uid: string) => Promise<void>) => fn(mockDb!, U);
    expect(await syncDeviceTimeZone(U, write)).toBe(true);
    expect((await getPreferences(mockDb!, U)).timeZone).toBe(device);
    expect(await syncDeviceTimeZone(U, write)).toBe(false); // unchanged → no write
  });

  it('settings saved on one device reach the other through sync', async () => {
    const remote = new FakeRemote();
    const phone = mockDb!;
    const tablet = await createTestDb();
    try {
      await savePreferences(phone, U, {
        weighIn: { enabled: true, hour: 6, minute: 45 },
        timeZone: 'Asia/Tokyo',
      });
      expect((await syncOnce(phone, remote, U)).rejected).toBe(0);
      const row = [...remote.table('user_preferences').values()][0]!;
      expect(row).toMatchObject({
        weigh_in_reminder_enabled: true, // boolean, not 0/1
        weigh_in_reminder_time: '06:45',
        time_zone: 'Asia/Tokyo',
      });
      await syncOnce(tablet, remote, U);
      expect((await getPreferences(tablet, U)).weighIn).toEqual({
        enabled: true,
        hour: 6,
        minute: 45,
      });
    } finally {
      tablet.close();
    }
  });

  it('rejects times that are not in 5-minute steps', async () => {
    await expect(
      savePreferences(mockDb!, U, { weighIn: { enabled: true, hour: 7, minute: 3 } }),
    ).rejects.toThrow(RangeError);
  });
});
