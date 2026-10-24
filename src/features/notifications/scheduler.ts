import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { getDb } from '@/data/db/expoDb';
import { getReminders } from '@/data/repo/settings';
import { REMINDER_INFO, type ReminderKind, type ReminderSetting } from '@/domain/reminders';

// Re-exported through `export *` from .types modules that eslint-plugin-import can't follow.
// eslint-disable-next-line import/namespace
const { AndroidImportance, IosAuthorizationStatus } = Notifications;

/**
 * Local reminder notifications (no server, no push token).
 *
 * Settings live in the device-local `notification_settings` table: reminders are a property of
 * the device the user carries, so they are not synced between devices. Scheduling is idempotent:
 * every change cancels all of our reminders and schedules the enabled ones again.
 */

export const REMINDER_CHANNEL_ID = 'reminders';
const ID_PREFIX = 'reminder-';

/** Screen opened when a reminder is tapped. */
export const REMINDER_ROUTES: Record<ReminderKind, '/weight-entry' | '/meals' | '/'> = {
  weigh_in: '/weight-entry',
  breakfast: '/meals',
  lunch: '/meals',
  dinner: '/meals',
  daily_review: '/',
};

export const notificationsSupported = () => Platform.OS === 'ios' || Platform.OS === 'android';

let configured = false;

/** Foreground presentation + Android channel. Safe to call more than once. */
export async function configureNotifications(): Promise<void> {
  if (configured || !notificationsSupported()) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: 'リマインダー',
      importance: AndroidImportance.DEFAULT,
    });
  }
}

export type PermissionResult = 'granted' | 'denied' | 'unsupported';

/** Asks for permission only when the user turns a reminder on. */
export async function ensureNotificationPermission(): Promise<PermissionResult> {
  if (!notificationsSupported()) return 'unsupported';
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === IosAuthorizationStatus.PROVISIONAL) {
    return 'granted';
  }
  if (!current.canAskAgain) return 'denied';
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return asked.granted ? 'granted' : 'denied';
}

export const openSystemSettings = () => Linking.openSettings().catch(() => {});

/** Cancels all BODYLOG reminders (sign-out, account deletion). */
export const cancelAllReminders = () => applyReminders([]);

/** Cancels only identifiers we own (other notifications are left alone). */
async function cancelOurs(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

let queue: Promise<void> = Promise.resolve();

/**
 * Replaces the scheduled reminders with `settings` (enabled ones only). Calls are serialized so
 * quick successive edits can't interleave cancel/schedule and leave duplicates behind.
 */
export function applyReminders(settings: ReminderSetting[]): Promise<void> {
  const run = queue.then(() => replaceReminders(settings));
  queue = run.catch(() => {});
  return run;
}

async function replaceReminders(settings: ReminderSetting[]): Promise<void> {
  if (!notificationsSupported()) return;
  await configureNotifications();
  await cancelOurs();
  const enabled = settings.filter((s) => s.enabled);
  if (enabled.length === 0) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && perm.ios?.status !== IosAuthorizationStatus.PROVISIONAL) return;
  for (const s of enabled) {
    const info = REMINDER_INFO[s.kind];
    await Notifications.scheduleNotificationAsync({
      identifier: `${ID_PREFIX}${s.kind}`,
      content: { title: info.title, body: info.body, data: { url: REMINDER_ROUTES[s.kind] } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: s.hour,
        minute: s.minute,
        channelId: REMINDER_CHANNEL_ID,
      },
    });
  }
}

/** Re-schedules from the stored settings (app start / sign-in). Never throws. */
export async function rescheduleReminders(): Promise<void> {
  try {
    await applyReminders(await getReminders(await getDb()));
  } catch {
    // Scheduling is best-effort; the settings screen shows the current state.
  }
}

const ROUTES = new Set<string>(Object.values(REMINDER_ROUTES));

function routeOf(response: Notifications.NotificationResponse | null) {
  const url = response?.notification.request.content.data?.url;
  return typeof url === 'string' && ROUTES.has(url)
    ? (url as (typeof REMINDER_ROUTES)[ReminderKind])
    : null;
}

/**
 * Opens the screen for a tapped reminder once the app is ready (signed in and onboarded),
 * including the tap that launched the app. Returns an unsubscribe function.
 */
export function listenForReminderTaps(
  open: (route: (typeof REMINDER_ROUTES)[ReminderKind]) => void,
) {
  if (!notificationsSupported()) return () => {};
  const initial = routeOf(Notifications.getLastNotificationResponse());
  if (initial) {
    Notifications.clearLastNotificationResponse();
    open(initial);
  }
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const route = routeOf(r);
    if (route) open(route);
  });
  return () => sub.remove();
}
