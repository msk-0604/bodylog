import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { getDb } from '@/data/db/expoDb';
import { getReminders } from '@/data/repo/settings';
import { REMINDER_INFO, type ReminderKind, type ReminderSetting } from '@/domain/reminders';

// Re-exported through `export *` from .types modules that eslint-plugin-import can't follow.
// eslint-disable-next-line import/namespace
const { AndroidImportance, IosAuthorizationStatus } = Notifications;

/**
 * Notifications:
 * - meal / daily-review reminders: LOCAL daily notifications (no server). Settings live in the
 *   device-local `notification_settings` table. Scheduling is idempotent: every change cancels
 *   our reminders and schedules the enabled ones again (this also removes the old local
 *   "reminder-weigh_in" from earlier versions, so it can't double up with the server push).
 * - weigh-in reminder: a SERVER push sent only when today's weight is missing (push.ts).
 */

export const REMINDER_CHANNEL_ID = 'reminders';
/** Android channel of the server-sent weigh-in push (must match the Edge Function). */
export const WEIGH_IN_CHANNEL_ID = 'weigh-in';
const ID_PREFIX = 'reminder-';

export type NotificationRoute = '/weight-entry' | '/meals' | '/';

/** Screen opened when a reminder is tapped. */
export const REMINDER_ROUTES: Record<ReminderKind, NotificationRoute> = {
  breakfast: '/meals',
  lunch: '/meals',
  dinner: '/meals',
  daily_review: '/',
};

export const notificationsSupported = () => Platform.OS === 'ios' || Platform.OS === 'android';

let configured = false;

/**
 * Returns true when today's weight is already recorded ON THIS DEVICE (synced or not). Set by
 * the weigh-in module; used to hide a server push that arrives while the app is open after an
 * offline record the server hasn't received yet.
 */
let weighInRecordedLocally: (() => Promise<boolean>) | null = null;
export function setWeighInRecordedCheck(fn: (() => Promise<boolean>) | null) {
  weighInRecordedLocally = fn;
}

const HIDDEN = {
  shouldShowBanner: false,
  shouldShowList: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
} as const;

/** Foreground presentation for one notification. Exported for tests. */
export async function presentationFor(n: Notifications.Notification) {
  const data = n.request.content.data as { kind?: unknown } | undefined;
  if (data?.kind === 'weigh_in') {
    if (await weighInRecordedLocally?.().catch(() => false)) return HIDDEN;
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    };
  }
  return {
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  };
}

/** Foreground presentation + Android channels. Safe to call more than once. */
export async function configureNotifications(): Promise<void> {
  if (configured || !notificationsSupported()) return;
  configured = true;
  Notifications.setNotificationHandler({ handleNotification: presentationFor });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: 'リマインダー',
      importance: AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync(WEIGH_IN_CHANNEL_ID, {
      name: '体重の記録リマインダー',
      importance: AndroidImportance.HIGH,
      showBadge: true,
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
    // badge: the weigh-in push shows "1" on the icon until today's weight is recorded
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
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

const ROUTES = new Set<string>([...Object.values(REMINDER_ROUTES), '/weight-entry']);

/** Route of a tapped notification (local reminders and the weigh-in push carry data.url). */
export function routeOf(
  response: Notifications.NotificationResponse | null,
): NotificationRoute | null {
  const url = response?.notification.request.content.data?.url;
  return typeof url === 'string' && ROUTES.has(url) ? (url as NotificationRoute) : null;
}

/**
 * Opens the screen for a tapped reminder once the app is ready (signed in and onboarded),
 * including the tap that launched the app. Returns an unsubscribe function.
 */
export function listenForReminderTaps(open: (route: NotificationRoute) => void) {
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
