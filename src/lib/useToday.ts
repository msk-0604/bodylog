import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { toDateKey, type DateKey } from '@/domain/date';

/**
 * Today's local date key. Updates when the app returns to the foreground and
 * at local midnight, so "today" stays correct across date / time zone changes.
 */
export function useToday(): DateKey {
  const [today, setToday] = useState(() => toDateKey(new Date()));

  useEffect(() => {
    const refresh = () => setToday(toDateKey(new Date()));
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });

    let timer: ReturnType<typeof setTimeout>;
    const scheduleMidnight = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(() => {
        refresh();
        scheduleMidnight();
      }, next.getTime() - now.getTime());
    };
    scheduleMidnight();

    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, []);

  return today;
}
