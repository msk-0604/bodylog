import { useEffect, useState } from 'react';

import { useLocalQuery } from '@/data/hooks';
import { hasWeightOn } from '@/data/repo/settings';
import { weighInStatus, type WeighInStatus } from '@/domain/weighIn';
import { useSession } from '@/features/auth/session';
import { usePreferences } from '@/features/exercise/hooks';
import { useToday } from '@/lib/useToday';

import { refreshWeighIn } from './weighIn';

/** Current time, refreshed every `intervalMs` (so "the reminder time has passed" updates). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Whether today's weight is recorded on this device (synced or not). */
export function useRecordedToday() {
  const today = useToday();
  return useLocalQuery(['weighIn', 'recorded', today], (db, uid) => hasWeightOn(db, uid, today));
}

/** Today's weigh-in status for the in-app prompt (works without notification permission). */
export function useWeighInStatus(): WeighInStatus | null {
  const prefs = usePreferences().data;
  const recorded = useRecordedToday().data;
  const now = useNow();
  if (!prefs || recorded === undefined) return null;
  return weighInStatus(prefs.weighIn, recorded, now);
}

/**
 * Keeps the icon badge in step with the data: every local write (weight added / edited /
 * deleted, reminder settings changed) and every sync re-runs the local queries, which re-runs
 * this effect. The badge is set by the app, not only by the push, so it clears right after
 * recording — even offline.
 */
export function useWeighInBadgeSync(active: boolean) {
  const userId = useSession((s) => s.userId);
  const status = useWeighInStatus();
  useEffect(() => {
    if (!active || !userId || status === null) return;
    void refreshWeighIn(userId).catch(() => {});
  }, [active, userId, status]);
}
