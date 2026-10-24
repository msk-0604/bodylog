import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getDb } from '@/data/db/expoDb';
import { newId } from '@/data/repo/common';
import { getMeta } from '@/data/repo/profile';
import { getPreferences, hasWeightOn, savePreferences } from '@/data/repo/settings';
import { toDateKey } from '@/domain/date';
import { badgeCountFor, deviceTimeZone, weighInStatus, type WeighInStatus } from '@/domain/weighIn';
import { isLocalMode } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';

import { notificationsSupported } from './scheduler';

/**
 * Weigh-in reminder, app side. The reminder itself is a SERVER push (Edge Function
 * weigh-in-reminders) sent only when the server has no weight for the user's local date.
 * The app:
 * - registers this installation's Expo push token for the signed-in user (and removes it on
 *   sign-out),
 * - keeps the icon badge right: 1 while today's weight is missing after the reminder time,
 *   0 as soon as a weight is recorded on this device (also offline), or the reminder is off,
 * - keeps the user's time zone up to date for the server's schedule.
 *
 * Limits (documented in docs/MVP_SPEC.md §11): a weight recorded OFFLINE is unknown to the
 * server until it syncs, so a push can still arrive; when the app is in the foreground it is
 * hidden (see scheduler.presentationFor), otherwise the OS shows it. Android launchers decide
 * whether and how badges appear.
 */

const INSTALLATION_KEY = 'installation_id';

export const pushConfig = {
  /** EAS project id (set by `eas init`); push tokens can't be issued without it. */
  projectId: (): string | null =>
    (Constants.easConfig as { projectId?: string } | null)?.projectId ??
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    null,
};

/** Stable id of this app installation (kept across sign-outs; new after reinstall). */
export async function getInstallationId(): Promise<string> {
  const db = await getDb();
  // insert-if-absent, then read: concurrent first calls agree on one id
  await db.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING', [
    INSTALLATION_KEY,
    `inst-${newId()}`,
  ]);
  return (await getMeta(db, INSTALLATION_KEY))!;
}

export type PushRegistration = 'registered' | 'no-permission' | 'unavailable' | 'error';

// Re-exported through `export *` from a .types module that eslint-plugin-import can't follow.
// eslint-disable-next-line import/namespace
const { IosAuthorizationStatus } = Notifications;

async function hasPermission(): Promise<boolean> {
  const p = await Notifications.getPermissionsAsync();
  return p.granted || p.ios?.status === IosAuthorizationStatus.PROVISIONAL;
}

/** Registers (or re-assigns) this device's push token to the signed-in user. Never prompts. */
export async function registerPushToken(): Promise<PushRegistration> {
  if (!notificationsSupported() || isLocalMode()) return 'unavailable';
  const projectId = pushConfig.projectId();
  if (!projectId) return 'unavailable';
  try {
    if (!(await hasPermission())) return 'no-permission';
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await getSupabase().rpc('register_push_token', {
      p_device_id: await getInstallationId(),
      p_token: token,
      p_platform: Platform.OS,
    });
    return error ? 'error' : 'registered';
  } catch {
    return 'error'; // offline or no APNs/FCM: retried on the next launch / foreground
  }
}

/** Sign-out: this device stops receiving the user's reminders. Best effort (needs network). */
export async function unregisterPushToken(): Promise<void> {
  if (!notificationsSupported() || isLocalMode()) return;
  try {
    await getSupabase().rpc('unregister_push_token', { p_device_id: await getInstallationId() });
  } catch {
    // offline: the next account signing in on this device takes the installation over
  }
}

export async function setAppBadge(count: number): Promise<void> {
  if (!notificationsSupported()) return;
  await Notifications.setBadgeCountAsync(count).catch(() => false);
}

async function dismissDeliveredWeighIn(): Promise<void> {
  const shown = await Notifications.getPresentedNotificationsAsync().catch(() => []);
  await Promise.all(
    shown
      .filter(
        (n) => (n.request.content.data as { kind?: unknown } | undefined)?.kind === 'weigh_in',
      )
      .map((n) => Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {})),
  );
}

export async function isWeighInRecordedToday(userId: string, now = new Date()): Promise<boolean> {
  return hasWeightOn(await getDb(), userId, toDateKey(now));
}

/**
 * Recomputes today's weigh-in status from THIS device's data (including unsynced records) and
 * updates the icon badge; clears delivered weigh-in notifications once recorded.
 */
export async function refreshWeighIn(userId: string, now = new Date()): Promise<WeighInStatus> {
  const db = await getDb();
  const prefs = await getPreferences(db, userId);
  const recorded = await hasWeightOn(db, userId, toDateKey(now));
  const status = weighInStatus(prefs.weighIn, recorded, now);
  await setAppBadge(badgeCountFor(status));
  if (status === 'recorded' || status === 'off') await dismissDeliveredWeighIn();
  return status;
}

/** Keeps the server's time zone for the reminder in line with this device (travel, DST). */
export async function syncDeviceTimeZone(
  userId: string,
  write: (
    fn: (db: Awaited<ReturnType<typeof getDb>>, uid: string) => Promise<void>,
  ) => Promise<void>,
): Promise<boolean> {
  const db = await getDb();
  const prefs = await getPreferences(db, userId);
  const tz = deviceTimeZone();
  if (!prefs.weighIn.enabled || prefs.timeZone === tz) return false;
  await write((d, uid) => savePreferences(d, uid, { timeZone: tz }));
  return true;
}

/** Sign-out / account deletion: no badge may stay on the icon. */
export async function clearWeighInOnDevice(): Promise<void> {
  await setAppBadge(0);
  if (notificationsSupported()) await dismissDeliveredWeighIn();
}
