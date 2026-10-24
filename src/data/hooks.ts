import { useMutation, useQuery, type QueryKey } from '@tanstack/react-query';

import { useSession } from '@/features/auth/session';
import { queryClient } from '@/lib/queryClient';

import { getDb } from './db/expoDb';
import type { SqlDb } from './db/types';
import { scheduleSync } from './sync/syncService';

export function useUserId(): string {
  const id = useSession((s) => s.userId);
  if (!id) throw new Error('useUserId called while signed out');
  return id;
}

/** Reads local (SQLite) data. All local queries share the ['local'] key prefix. */
export function useLocalQuery<T>(key: QueryKey, fn: (db: SqlDb, userId: string) => Promise<T>) {
  const userId = useSession((s) => s.userId);
  return useQuery({
    queryKey: ['local', userId, ...key],
    queryFn: async () => fn(await getDb(), userId!),
    enabled: !!userId,
    staleTime: Infinity,
    networkMode: 'always',
  });
}

/** Runs a local write, refreshes local queries and schedules a background sync. */
export async function writeLocal<T>(fn: (db: SqlDb, userId: string) => Promise<T>): Promise<T> {
  const userId = useSession.getState().userId;
  if (!userId) throw new Error('not signed in');
  const result = await fn(await getDb(), userId);
  await queryClient.invalidateQueries({ queryKey: ['local'] });
  scheduleSync();
  return result;
}

export function useLocalMutation<A, T>(fn: (db: SqlDb, userId: string, args: A) => Promise<T>) {
  return useMutation({
    mutationFn: (args: A) => writeLocal((db, uid) => fn(db, uid, args)),
    networkMode: 'always',
  });
}
