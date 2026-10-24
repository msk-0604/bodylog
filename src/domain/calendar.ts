import { parseDateKey, type DateKey } from './date';

const pad = (n: number) => String(n).padStart(2, '0');

export type MonthKey = { year: number; month: number }; // month: 1-12

export function monthOf(date: DateKey): MonthKey {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return { year: y, month: m };
}

export function addMonths(m: MonthKey, delta: number): MonthKey {
  const idx = m.year * 12 + (m.month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function monthRange(m: MonthKey): { first: DateKey; last: DateKey } {
  const days = new Date(Date.UTC(m.year, m.month, 0)).getUTCDate();
  return {
    first: parseDateKey(`${m.year}-${pad(m.month)}-01`),
    last: parseDateKey(`${m.year}-${pad(m.month)}-${pad(days)}`),
  };
}

/**
 * 6×7 grid (weeks start on `weekStartsOn`, 0 = Sunday, 1 = Monday). Cells outside the month are null.
 */
export function monthGrid(m: MonthKey, weekStartsOn: 0 | 1 = 1): (DateKey | null)[][] {
  const firstDow = new Date(Date.UTC(m.year, m.month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(m.year, m.month, 0)).getUTCDate();
  const offset = (firstDow - weekStartsOn + 7) % 7;
  const cells: (DateKey | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(parseDateKey(`${m.year}-${pad(m.month)}-${pad(d)}`));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (DateKey | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const WEEKDAY_LABELS = (weekStartsOn: 0 | 1) =>
  weekStartsOn === 1
    ? ['月', '火', '水', '木', '金', '土', '日']
    : ['日', '月', '火', '水', '木', '金', '土'];

export function formatMonthJa(m: MonthKey): string {
  return `${m.year}年${m.month}月`;
}
