import { useLocalQuery } from '@/data/hooks';
import { getExercise, listExercises, recentSetNames } from '@/data/repo/exercise';
import { dayMarks, getPreferences, getReminders } from '@/data/repo/settings';
import type { DateKey } from '@/domain/date';

export function useExercises(range?: { from: DateKey; to: DateKey }) {
  return useLocalQuery(['exercises', range?.from ?? 'all', range?.to ?? 'all'], (db, uid) =>
    listExercises(db, uid, range),
  );
}

export function useExercise(id: string | undefined) {
  return useLocalQuery(['exercise', id ?? 'none'], (db, uid) =>
    id ? getExercise(db, uid, id) : Promise.resolve(null),
  );
}

export function useRecentSetNames() {
  return useLocalQuery(['exercise', 'setNames'], (db, uid) => recentSetNames(db, uid));
}

export function usePreferences() {
  return useLocalQuery(['preferences'], (db, uid) => getPreferences(db, uid));
}

export function useReminders() {
  return useLocalQuery(['reminders'], (db) => getReminders(db));
}

export function useDayMarks(from: DateKey, to: DateKey) {
  return useLocalQuery(['dayMarks', from, to], (db, uid) => dayMarks(db, uid, from, to));
}
