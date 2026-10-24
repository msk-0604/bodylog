import { defaultReminders, type ReminderSetting } from '@/domain/reminders';
import {
  applyReminders,
  cancelAllReminders,
  ensureNotificationPermission,
  REMINDER_CHANNEL_ID,
  routeOf,
} from '@/features/notifications/scheduler';
import { mockNotifications } from '@/testing/notificationsMock';

jest.mock('@/data/db/expoDb', () => ({ getDb: async () => null }));

const on = (kind: ReminderSetting['kind'], hour: number, minute: number): ReminderSetting[] =>
  defaultReminders().map((r) => (r.kind === kind ? { ...r, enabled: true, hour, minute } : r));

beforeEach(() => {
  mockNotifications.reset();
  mockNotifications.permission = { granted: true, canAskAgain: true };
});

it('schedules one daily notification per enabled reminder on the reminders channel', async () => {
  await applyReminders(on('dinner', 19, 45));
  expect([...mockNotifications.scheduled.keys()]).toEqual(['reminder-dinner']);
  expect(mockNotifications.scheduled.get('reminder-dinner')).toMatchObject({
    content: { title: '夕食を記録しましょう', data: { url: '/meals' } },
    trigger: { type: 'daily', hour: 19, minute: 45, channelId: REMINDER_CHANNEL_ID },
  });
});

it('serializes quick successive changes (no duplicates, last one wins)', async () => {
  await Promise.all([
    applyReminders(on('lunch', 12, 0)),
    applyReminders(on('lunch', 12, 5)),
    applyReminders(on('lunch', 12, 10)),
  ]);
  expect(mockNotifications.scheduled.size).toBe(1);
  expect(mockNotifications.scheduled.get('reminder-lunch')!.trigger).toMatchObject({ minute: 10 });
});

it('cancels only its own notifications', async () => {
  mockNotifications.scheduled.set('other', { identifier: 'other', content: {}, trigger: null });
  await applyReminders(on('breakfast', 8, 0));
  await cancelAllReminders();
  expect([...mockNotifications.scheduled.keys()]).toEqual(['other']);
});

it('schedules nothing without permission and never prompts by itself', async () => {
  mockNotifications.permission = { granted: false, canAskAgain: true };
  await applyReminders(on('breakfast', 8, 0));
  expect(mockNotifications.scheduled.size).toBe(0);
  expect(mockNotifications.requests).toBe(0);
});

it('does not prompt again once the user denied it', async () => {
  mockNotifications.permission = { granted: false, canAskAgain: false };
  expect(await ensureNotificationPermission()).toBe('denied');
  expect(mockNotifications.requests).toBe(0);
});

it('removes the local weigh-in reminder of earlier versions (the server push replaces it)', async () => {
  mockNotifications.scheduled.set('reminder-weigh_in', {
    identifier: 'reminder-weigh_in',
    content: {},
    trigger: { type: 'daily', hour: 7, minute: 0 },
  });
  await applyReminders(on('lunch', 12, 0));
  expect([...mockNotifications.scheduled.keys()]).toEqual(['reminder-lunch']);
});

it('routes the weigh-in push and local reminders by their data.url only', () => {
  const resp = (data: Record<string, unknown>) =>
    ({ notification: { request: { content: { data } } } }) as never;
  expect(routeOf(resp({ url: '/weight-entry', kind: 'weigh_in' }))).toBe('/weight-entry');
  expect(routeOf(resp({ url: '/meals' }))).toBe('/meals');
  expect(routeOf(resp({ url: 'https://evil.example' }))).toBeNull();
});
