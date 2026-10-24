/**
 * Date helpers.
 *
 * Records are grouped by the user's *local calendar date* at the time of recording
 * (`DateKey`, "YYYY-MM-DD"). The absolute instant is stored separately as timestamptz.
 * Date-key arithmetic is done in UTC so DST transitions never skip or repeat a day.
 */

export type DateKey = string & { readonly __brand: 'DateKey' };

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateKey(value: string): value is DateKey {
  const m = DATE_KEY_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function parseDateKey(value: string): DateKey {
  if (!isDateKey(value)) throw new RangeError(`Invalid date key: ${value}`);
  return value;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date of `date` in the device time zone. */
export function toDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` as DateKey;
}

function keyToUtc(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

function utcToKey(date: Date): DateKey {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` as DateKey;
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = keyToUtc(key);
  d.setUTCDate(d.getUTCDate() + days);
  return utcToKey(d);
}

/** Whole days from `from` to `to` (positive if `to` is later). */
export function diffDays(from: DateKey, to: DateKey): number {
  return Math.round((keyToUtc(to).getTime() - keyToUtc(from).getTime()) / 86_400_000);
}

/** Inclusive list of date keys ending at `end`, `count` days long, oldest first. */
export function lastNDays(end: DateKey, count: number): DateKey[] {
  return Array.from({ length: count }, (_, i) => addDays(end, i - count + 1));
}

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** e.g. "10月24日(土)" */
export function formatDateKeyJa(key: DateKey): string {
  const d = keyToUtc(key);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${WEEKDAYS_JA[d.getUTCDay()]})`;
}

/** e.g. "2026年10月24日(土)" */
export function formatDateKeyJaLong(key: DateKey): string {
  return `${keyToUtc(key).getUTCFullYear()}年${formatDateKeyJa(key)}`;
}

/** e.g. "7:05" in local time. */
export function formatTimeJa(date: Date): string {
  return `${date.getHours()}:${pad(date.getMinutes())}`;
}
