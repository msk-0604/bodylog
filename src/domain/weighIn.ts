/**
 * Weigh-in reminder rules shared by the app (badge, home prompt, foreground handling). The server
 * applies the same rule in SQL (claim_weigh_in_reminders): due when the reminder is on, the local
 * time has reached the reminder time and there is no weight record for the local date.
 */
import { formatTime, isValidTime } from './reminders';

export type WeighInReminder = { enabled: boolean; hour: number; minute: number };

export const DEFAULT_WEIGH_IN: WeighInReminder = { enabled: false, hour: 7, minute: 0 };
export const WEIGH_IN_MINUTE_STEP = 5;

/** "HH:MM" (server / sync format) → reminder time; invalid values fall back to 07:00. */
export function parseReminderTime(text: string | null | undefined): {
  hour: number;
  minute: number;
} {
  const m = /^(\d{2}):(\d{2})$/.exec(text ?? '');
  const hour = Number(m?.[1]);
  const minute = Number(m?.[2]);
  return m && isValidTime(hour, minute) && minute % WEIGH_IN_MINUTE_STEP === 0
    ? { hour, minute }
    : { hour: DEFAULT_WEIGH_IN.hour, minute: DEFAULT_WEIGH_IN.minute };
}

export function toReminderTime(hour: number, minute: number): string {
  if (!isValidTime(hour, minute) || minute % WEIGH_IN_MINUTE_STEP !== 0) {
    throw new RangeError('reminder time must be HH:MM in 5-minute steps');
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * - off: reminder disabled
 * - recorded: a weight exists for today (nothing to do, badge cleared)
 * - upcoming: not recorded yet, reminder time not reached
 * - pending: not recorded and the reminder time has passed → badge 1, home prompt
 */
export type WeighInStatus = 'off' | 'recorded' | 'upcoming' | 'pending';

export function weighInStatus(
  reminder: WeighInReminder,
  recordedToday: boolean,
  now: Date,
): WeighInStatus {
  if (!reminder.enabled) return 'off';
  if (recordedToday) return 'recorded';
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= reminder.hour * 60 + reminder.minute ? 'pending' : 'upcoming';
}

export const badgeCountFor = (s: WeighInStatus) => (s === 'pending' ? 1 : 0);

export const describeReminder = (r: WeighInReminder) =>
  r.enabled ? `毎日 ${formatTime(r.hour, r.minute)}` : 'オフ';

/** Device's IANA time zone, e.g. "Asia/Tokyo" (falls back to Asia/Tokyo). */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';
  } catch {
    return 'Asia/Tokyo';
  }
}
