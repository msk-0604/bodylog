/**
 * Weigh-in reminder, app side (local mode, node:sqlite, expo-notifications mock):
 * settings (ON/OFF, 5-minute time), in-app status without permission, icon badge set/cleared on
 * record / delete, delivered notification dismissed, foreground push hidden when recorded
 * locally, tap → weight entry, permission guidance.
 * The server side (who gets a push, once per day, time zones) is tested in
 * supabase/local-tests/70_weigh_in_reminders.sql and src/__tests__/server/weighInReminders.test.ts.
 */
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import type { SqlDb } from '@/data/db/types';
import { createTestDb } from '@/data/db/testing/nodeDb';
import { resetSessionForTests } from '@/features/auth/session';
import { mockNotifications } from '@/testing/notificationsMock';

let mockDb: (SqlDb & { close(): void }) | null = null;
jest.mock('@/data/db/expoDb', () => ({ getDb: async () => mockDb }));
jest.setTimeout(40_000);

let alert: jest.SpyInstance;
beforeEach(async () => {
  resetSessionForTests();
  mockNotifications.reset();
  mockNotifications.permission = { granted: false, canAskAgain: true };
  mockDb = await createTestDb();
  alert = jest.spyOn(Alert, 'alert');
});
afterEach(() => {
  alert.mockRestore();
  mockDb?.close();
  mockDb = null;
});

async function start() {
  const r = await renderRouter('./src/app', { initialUrl: '/' });
  await fireEvent.changeText(await screen.findByTestId('height-input'), '170');
  await fireEvent.changeText(screen.getByTestId('current-weight-input'), '70');
  await fireEvent.changeText(screen.getByTestId('target-weight-input'), '65');
  await fireEvent.press(screen.getByTestId('onboarding-next'));
  await fireEvent.changeText(await screen.findByTestId('goal-kcal-input'), '1800');
  await fireEvent.press(screen.getByTestId('terms-checkbox'));
  await fireEvent.press(screen.getByTestId('onboarding-finish'));
  await screen.findByTestId('home-screen', {}, { timeout: 5000 });
  return r;
}

async function openSettings() {
  await fireEvent.press(screen.getByTestId('tab-mypage'));
  await fireEvent.press(await screen.findByTestId('row-notifications'));
  await screen.findByTestId('weigh-in-card');
}

/**
 * Polls an async (DB) expectation. `waitFor` with an async callback leaks pending work into the
 * next test under the router's fake timers, so flush React work with act() between tries.
 */
async function eventually(check: () => Promise<void>) {
  let last: unknown;
  for (let i = 0; i < 100; i++) {
    try {
      await check();
      return;
    } catch (e) {
      last = e;
    }
    await act(async () => {
      await Promise.resolve();
    });
  }
  throw last;
}

const prefsRow = () =>
  mockDb!.get<{
    weigh_in_reminder_enabled: number;
    weigh_in_reminder_time: string;
    time_zone: string;
  }>('SELECT weigh_in_reminder_enabled, weigh_in_reminder_time, time_zone FROM user_preferences');

/** Reminder ON at 00:00 → "the time has passed" for the whole day (deterministic). */
async function enableAtMidnight() {
  await openSettings();
  await fireEvent(screen.getByTestId('weigh-in-switch'), 'valueChange', true);
  await eventually(async () => expect((await prefsRow())?.weigh_in_reminder_enabled).toBe(1));
  for (let h = 6; h >= 0; h--) {
    await fireEvent.press(screen.getByLabelText('体重の記録リマインダーの時刻を1時間前に'));
    await eventually(async () =>
      expect((await prefsRow())?.weigh_in_reminder_time).toBe(`0${h}:00`),
    );
  }
}

async function deleteTodaysWeight(kg: string) {
  await fireEvent.press(screen.getByTestId('tab-records'));
  // the goal card also shows the value; the history row is the last one
  await fireEvent.press((await screen.findAllByText(kg)).at(-1)!);
  await fireEvent.press(await screen.findByText('この記録を削除'));
  const buttons = alert.mock.calls.at(-1)![2] as { text: string; onPress?: () => Promise<void> }[];
  await buttons.find((b) => b.text === '削除')!.onPress!();
}

describe('weigh-in reminder (app)', () => {
  it('saves ON/OFF and a 5-minute time to the synced preferences (with the device time zone)', async () => {
    await start();
    await openSettings();
    expect(screen.getByTestId('weigh-in-today')).toHaveTextContent(/記録済み/); // onboarding weight
    await fireEvent(screen.getByTestId('weigh-in-switch'), 'valueChange', true);
    await eventually(async () =>
      expect(await prefsRow()).toMatchObject({ weigh_in_reminder_enabled: 1 }),
    );
    // the permission prompt includes the icon badge
    expect(mockNotifications.lastRequest).toMatchObject({ ios: { allowBadge: true } });

    await fireEvent.press(screen.getByLabelText('体重の記録リマインダーの時刻を5分後に'));
    await eventually(async () =>
      expect(await prefsRow()).toMatchObject({
        weigh_in_reminder_time: '07:05',
        time_zone: 'Asia/Tokyo',
      }),
    );
    // the old local daily weigh-in notification no longer exists (no double notification)
    expect([...mockNotifications.scheduled.keys()].some((k) => k.includes('weigh'))).toBe(false);

    await fireEvent(screen.getByTestId('weigh-in-switch'), 'valueChange', false);
    await eventually(async () =>
      expect(await prefsRow()).toMatchObject({ weigh_in_reminder_enabled: 0 }),
    );
  });

  it('shows the badge and home prompt only while today is unrecorded; record/delete update them', async () => {
    const r = await start();
    await enableAtMidnight();
    await fireEvent.press(screen.getByText('閉じる'));
    expect(mockNotifications.badge).toBe(0); // recorded today (onboarding)

    // deleting today's only record → unrecorded again
    await deleteTodaysWeight('70.0 kg');
    await waitFor(() => expect(mockNotifications.badge).toBe(1));
    await fireEvent.press(screen.getByTestId('tab-home'));
    expect(await screen.findByTestId('weigh-in-prompt')).toBeTruthy();

    // a delivered weigh-in notification is still in the notification center
    mockNotifications.presented = [
      {
        request: {
          identifier: 'push-1',
          content: { data: { kind: 'weigh_in', url: '/weight-entry' } },
        },
      },
    ];
    await fireEvent.press(screen.getByTestId('weigh-in-prompt-record'));
    await fireEvent.changeText(await screen.findByTestId('weight-input'), '69.9');
    await fireEvent.press(screen.getByTestId('weight-save-button'));
    await waitFor(() => expect(r.getPathname()).toBe('/'));
    await waitFor(() => expect(mockNotifications.badge).toBe(0));
    expect(screen.queryByTestId('weigh-in-prompt')).toBeNull();
    await waitFor(() => expect(mockNotifications.presented).toHaveLength(0));
  });

  it('turning the reminder OFF clears the badge', async () => {
    await start();
    await enableAtMidnight();
    await fireEvent.press(screen.getByText('閉じる'));
    await deleteTodaysWeight('70.0 kg');
    await waitFor(() => expect(mockNotifications.badge).toBe(1));
    await openSettings();
    await fireEvent(screen.getByTestId('weigh-in-switch'), 'valueChange', false);
    await waitFor(() => expect(mockNotifications.badge).toBe(0));
  });

  it('tapping the push opens the weight entry screen', async () => {
    const r = await start();
    mockNotifications.tap({ url: '/weight-entry', kind: 'weigh_in', date: '2026-10-24' });
    await waitFor(() => expect(r.getPathname()).toBe('/weight-entry'));
    expect(await screen.findByTestId('weight-entry-screen')).toBeTruthy();
  });

  it('hides a weigh-in push that arrives while the app is open if today is recorded on this device', async () => {
    await start();
    const handler = mockNotifications.handler!;
    const push = { request: { content: { data: { kind: 'weigh_in', url: '/weight-entry' } } } };
    // onboarding recorded today's weight (possibly not yet synced → server didn't know)
    await eventually(async () =>
      expect(await handler.handleNotification(push)).toMatchObject({ shouldShowBanner: false }),
    );
    await deleteTodaysWeight('70.0 kg');
    expect(await handler.handleNotification(push)).toMatchObject({
      shouldShowBanner: true,
      shouldSetBadge: true,
    });
    // other notifications are unaffected
    expect(
      await handler.handleNotification({ request: { content: { data: { url: '/meals' } } } }),
    ).toMatchObject({ shouldShowBanner: true });
  });

  it('explains how to allow notifications when permission is denied and still shows the status in-app', async () => {
    mockNotifications.grantOnRequest = false;
    await start();
    await openSettings();
    await fireEvent(screen.getByTestId('weigh-in-switch'), 'valueChange', true);
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        '通知がオフになっています',
        expect.any(String),
        expect.arrayContaining([expect.objectContaining({ text: '設定を開く' })]),
      ),
    );
    expect(await screen.findByTestId('weigh-in-permission-warning')).toBeTruthy();
    expect(screen.getByTestId('weigh-in-today')).toBeTruthy();
    expect((await prefsRow())?.weigh_in_reminder_enabled).toBe(1); // other devices may still be notified
  });
});
