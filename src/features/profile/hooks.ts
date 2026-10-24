import { useLocalQuery } from '@/data/hooks';
import { listWeights } from '@/data/repo/body';
import { getGoalForDate, getProfile } from '@/data/repo/profile';
import type { DateKey } from '@/domain/date';
import { latestMeasurement } from '@/domain/weight';

export function useProfile() {
  return useLocalQuery(['profile'], (db, uid) => getProfile(db, uid));
}

export function useGoal(date: DateKey) {
  return useLocalQuery(['goal', date], (db, uid) => getGoalForDate(db, uid, date));
}

export function useWeights() {
  return useLocalQuery(['weights'], (db, uid) => listWeights(db, uid));
}

export function useLatestWeight() {
  const q = useWeights();
  return q.data ? latestMeasurement(q.data) : null;
}
