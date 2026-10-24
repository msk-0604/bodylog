import NetInfo from '@react-native-community/netinfo';
import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { getDb } from '@/data/db/expoDb';
import { wipeUserData } from '@/data/db/schema';
import { getMeta, getProfile, setMeta } from '@/data/repo/profile';
import { countPending } from '@/data/sync/syncEngine';
import { scheduleSync, setSyncUser, syncNow } from '@/data/sync/syncService';
import {
  cancelAllReminders,
  configureNotifications,
  rescheduleReminders,
} from '@/features/notifications/scheduler';
import { isLocalMode, LOCAL_USER_ID } from '@/lib/config';
import { queryClient } from '@/lib/queryClient';
import { getSupabase } from '@/lib/supabase';

export type SessionStatus =
  /** reading the stored session */
  | 'initializing'
  | 'signedOut'
  /** signed in on this device for the first time: downloading the user's data */
  | 'initialSync'
  /** initial sync failed (usually offline) */
  | 'initialSyncFailed'
  | 'ready';

type SessionState = {
  status: SessionStatus;
  userId: string | null;
  email: string | null;
  onboarded: boolean;
  /** opened from a password-reset email → must set a new password */
  passwordRecovery: boolean;
};

export const useSession = create<SessionState>()(() => ({
  status: 'initializing',
  userId: null,
  email: null,
  onboarded: false,
  passwordRecovery: false,
}));

const OWNER_KEY = 'owner_user_id';
const INITIAL_SYNC_KEY = 'initial_sync_done';

let initialized = false;
let netSub: (() => void) | null = null;

async function loadOnboarded(userId: string) {
  const db = await getDb();
  const profile = await getProfile(db, userId);
  return !!profile?.onboardingCompletedAt;
}

async function enterSignedIn(userId: string, email: string | null) {
  const db = await getDb();
  const owner = await getMeta(db, OWNER_KEY);
  if (owner && owner !== userId) {
    // Another account used this device before: never mix personal data between accounts.
    await wipeUserData(db);
    queryClient.clear();
  }
  await setMeta(db, OWNER_KEY, userId);
  setSyncUser(userId);
  useSession.setState({ userId, email });

  if (!isLocalMode() && (await getMeta(db, INITIAL_SYNC_KEY)) !== userId) {
    useSession.setState({ status: 'initialSync' });
    try {
      await syncNow();
      await setMeta(db, INITIAL_SYNC_KEY, userId);
    } catch {
      useSession.setState({ status: 'initialSyncFailed' });
      return;
    }
  }
  useSession.setState({ status: 'ready', onboarded: await loadOnboarded(userId) });
  void rescheduleReminders();
  if (!isLocalMode()) {
    netSub?.();
    netSub = NetInfo.addEventListener((s) => {
      if (s.isConnected) scheduleSync(1_000);
    });
    scheduleSync(0);
  }
}

function enterSignedOut() {
  setSyncUser(null);
  // Reminders belong to the signed-in user's settings (wiped on sign-out).
  void cancelAllReminders().catch(() => {});
  netSub?.();
  netSub = null;
  queryClient.clear();
  useSession.setState({
    status: 'signedOut',
    userId: null,
    email: null,
    onboarded: false,
    passwordRecovery: false,
  });
}

function onSession(session: Session | null) {
  const current = useSession.getState();
  if (!session) {
    if (current.status !== 'signedOut') enterSignedOut();
    return;
  }
  if (current.userId === session.user.id && current.status !== 'signedOut') return;
  void enterSignedIn(session.user.id, session.user.email ?? null);
}

/** Starts listening to the auth state. Safe to call more than once. */
export async function initSession(): Promise<void> {
  if (initialized) return;
  initialized = true;
  void configureNotifications().catch(() => {});
  if (isLocalMode()) {
    await enterSignedIn(LOCAL_USER_ID, null);
    return;
  }
  const supabase = getSupabase();
  supabase.auth.onAuthStateChange((event, session) => {
    // Don't await Supabase calls inside this callback (can deadlock the auth client).
    setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY') useSession.setState({ passwordRecovery: true });
      onSession(session);
    }, 0);
  });
  const { data } = await supabase.auth.getSession();
  onSession(data.session);
  if (!data.session) enterSignedOut();
}

export async function retryInitialSync(): Promise<void> {
  const { userId, email } = useSession.getState();
  if (userId) await enterSignedIn(userId, email);
}

export async function refreshOnboarded(): Promise<void> {
  const { userId } = useSession.getState();
  if (userId) useSession.setState({ onboarded: await loadOnboarded(userId) });
}

export async function pendingChanges(): Promise<number> {
  const { userId } = useSession.getState();
  if (!userId) return 0;
  return (await countPending(await getDb(), userId)).pending;
}

/** Signs out and removes this account's data from the device (server data is kept). */
export async function signOut(): Promise<void> {
  if (isLocalMode()) return;
  try {
    await syncNow();
  } catch {
    // proceed: the caller already warned about unsynced data
  }
  await getSupabase().auth.signOut({ scope: 'local' });
  await wipeUserData(await getDb());
  enterSignedOut();
}

/** Called after the server deleted the account. */
export async function clearAfterAccountDeletion(): Promise<void> {
  await wipeUserData(await getDb());
  queryClient.clear();
  if (isLocalMode()) {
    // No account in local mode: start over with an empty device profile.
    useSession.setState({ userId: null, onboarded: false });
    await enterSignedIn(LOCAL_USER_ID, null);
    return;
  }
  await getSupabase()
    .auth.signOut({ scope: 'local' })
    .catch(() => {});
  enterSignedOut();
}

/** Test helper: simulates an app restart (process memory cleared, device storage kept). */
export function resetSessionForTests(): void {
  initialized = false;
  netSub?.();
  netSub = null;
  setSyncUser(null);
  queryClient.clear();
  useSession.setState({
    status: 'initializing',
    userId: null,
    email: null,
    onboarded: false,
    passwordRecovery: false,
  });
}
