import type { DateKey } from '@/domain/date';
import {
  defaultReminders,
  isValidTime,
  REMINDER_KINDS,
  type ReminderKind,
  type ReminderSetting,
} from '@/domain/reminders';

import type { SqlDb } from '../db/types';
import { insertRow, nowIso, updateRow } from './common';

/* ---------------- user_preferences (synced) ---------------- */

export type Preferences = { includeExerciseInBudget: boolean; weekStartsOn: 0 | 1 };

export async function getPreferences(db: SqlDb, userId: string): Promise<Preferences> {
  const r = await db.get<{ include_exercise_in_budget: number; week_starts_on: number }>(
    'SELECT include_exercise_in_budget, week_starts_on FROM user_preferences WHERE user_id = ?',
    [userId],
  );
  return {
    includeExerciseInBudget: Number(r?.include_exercise_in_budget ?? 0) === 1,
    weekStartsOn: Number(r?.week_starts_on ?? 1) === 0 ? 0 : 1,
  };
}

export async function savePreferences(db: SqlDb, userId: string, p: Partial<Preferences>) {
  const patch: Record<string, number> = {};
  if (p.includeExerciseInBudget !== undefined)
    patch.include_exercise_in_budget = p.includeExerciseInBudget ? 1 : 0;
  if (p.weekStartsOn !== undefined) patch.week_starts_on = p.weekStartsOn;
  await db.transaction(async (tx) => {
    const exists = await tx.get('SELECT 1 FROM user_preferences WHERE user_id = ?', [userId]);
    if (exists) await updateRow(tx, 'user_preferences', userId, patch, 'user_id');
    else
      await insertRow(tx, 'user_preferences', { user_id: userId, created_at: nowIso(), ...patch });
  });
}

/* ---------------- notification_settings (device-local) ---------------- */

export async function getReminders(db: SqlDb): Promise<ReminderSetting[]> {
  const rows = await db.all<{ kind: string; enabled: number; hour: number; minute: number }>(
    'SELECT kind, enabled, hour, minute FROM notification_settings',
  );
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  return defaultReminders().map((d) => {
    const r = byKind.get(d.kind);
    return r
      ? {
          kind: d.kind,
          enabled: Number(r.enabled) === 1,
          hour: Number(r.hour),
          minute: Number(r.minute),
        }
      : d;
  });
}

export async function saveReminder(db: SqlDb, setting: ReminderSetting) {
  if (!(REMINDER_KINDS as readonly string[]).includes(setting.kind)) throw new RangeError('kind');
  if (!isValidTime(setting.hour, setting.minute)) throw new RangeError('time');
  await db.run(
    `INSERT INTO notification_settings (kind, enabled, hour, minute, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (kind) DO UPDATE SET enabled = excluded.enabled, hour = excluded.hour,
       minute = excluded.minute, updated_at = excluded.updated_at`,
    [setting.kind, setting.enabled ? 1 : 0, setting.hour, setting.minute, nowIso()],
  );
}

export async function disableAllReminders(db: SqlDb) {
  await db.run('UPDATE notification_settings SET enabled = 0, updated_at = ?', [nowIso()]);
}

export type { ReminderKind };

/* ---------------- calendar ---------------- */

export type DayMarks = { meals: boolean; weight: boolean; exercise: boolean };

/** Which kinds of records exist on each day of a range (for calendar dots). */
export async function dayMarks(
  db: SqlDb,
  userId: string,
  from: DateKey,
  to: DateKey,
): Promise<Map<DateKey, DayMarks>> {
  const map = new Map<DateKey, DayMarks>();
  const mark = (d: string, k: keyof DayMarks) => {
    const cur = map.get(d as DateKey) ?? { meals: false, weight: false, exercise: false };
    cur[k] = true;
    map.set(d as DateKey, cur);
  };
  const meals = await db.all<{ d: string }>(
    `SELECT DISTINCT e.eaten_on AS d FROM meal_entries e JOIN meal_items i ON i.meal_entry_id = e.id
     WHERE e.user_id = ? AND e.deleted_at IS NULL AND i.deleted_at IS NULL AND e.eaten_on BETWEEN ? AND ?`,
    [userId, from, to],
  );
  meals.forEach((r) => mark(r.d, 'meals'));
  const weights = await db.all<{ d: string }>(
    `SELECT DISTINCT measured_on AS d FROM body_measurements
     WHERE user_id = ? AND deleted_at IS NULL AND measured_on BETWEEN ? AND ?`,
    [userId, from, to],
  );
  weights.forEach((r) => mark(r.d, 'weight'));
  const ex = await db.all<{ d: string }>(
    `SELECT DISTINCT performed_on AS d FROM exercise_entries
     WHERE user_id = ? AND deleted_at IS NULL AND performed_on BETWEEN ? AND ?`,
    [userId, from, to],
  );
  ex.forEach((r) => mark(r.d, 'exercise'));
  return map;
}
