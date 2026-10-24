/**
 * Supabase mode with a mocked Supabase client: signed-out gate, sign-in errors, successful
 * sign-in → initial sync → onboarding, sign-up validation. The real Supabase Auth service is
 * NOT exercised here (no project available in CI).
 */
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import type { SqlDb } from '@/data/db/types';
import { createTestDb } from '@/data/db/testing/nodeDb';
import { resetSessionForTests } from '@/features/auth/session';

let mockDb: (SqlDb & { close(): void }) | null = null;
jest.mock('@/data/db/expoDb', () => ({ getDb: async () => mockDb }));

jest.mock('@/lib/config', () => ({
  config: {
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'test-anon-key-xxxxxxxxxxxxxxxxxxxxxxxx',
    termsVersion: 'test',
    privacyVersion: 'test',
  },
  isSupabaseConfigured: () => true,
  isLocalMode: () => false,
  LOCAL_USER_ID: 'local-user',
}));

const mockSync = { calls: 0, fail: false };
jest.mock('@/data/sync/syncService', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { create } = require('zustand');
  return {
    useSyncStatus: create(() => ({ phase: 'idle', pending: 0, errors: 0, lastSyncedAt: null })),
    syncNow: async () => {
      mockSync.calls++;
      if (mockSync.fail) throw new Error('offline');
    },
    scheduleSync: () => {},
    setSyncUser: () => {},
  };
});

type Listener = (event: string, session: unknown) => void;
const mockAuth = {
  listeners: [] as Listener[],
  signIn: jest.fn(),
  signUp: jest.fn(),
};
const session = { user: { id: '11111111-1111-4111-8111-111111111111', email: 'a@example.com' } };

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (cb: Listener) => {
        mockAuth.listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithPassword: (args: unknown) => mockAuth.signIn(args),
      signUp: (args: unknown) => mockAuth.signUp(args),
      signOut: async () => ({ error: null }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  }),
}));

jest.setTimeout(30_000);

beforeEach(async () => {
  resetSessionForTests();
  mockAuth.listeners = [];
  mockAuth.signIn.mockReset();
  mockAuth.signUp.mockReset();
  mockSync.calls = 0;
  mockSync.fail = false;
  mockDb = await createTestDb();
});
afterEach(() => {
  mockDb?.close();
  mockDb = null;
});

describe('authentication', () => {
  it('shows sign-in when signed out and maps errors to Japanese', async () => {
    mockAuth.signIn.mockResolvedValue({
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });
    await renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByTestId('sign-in-screen')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('email-input'), 'a@example.com');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'wrongpass1');
    await fireEvent.press(screen.getByTestId('sign-in-button'));
    expect(
      await screen.findByText('メールアドレスまたはパスワードが正しくありません。'),
    ).toBeTruthy();
    expect(mockAuth.signIn).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'wrongpass1',
    });
  });

  it('signs in, runs the initial sync and continues to onboarding', async () => {
    mockAuth.signIn.mockImplementation(async () => {
      setTimeout(() => mockAuth.listeners.forEach((l) => l('SIGNED_IN', session)), 0);
      return { error: null, data: { session } };
    });
    await renderRouter('./src/app', { initialUrl: '/' });
    await fireEvent.changeText(await screen.findByTestId('email-input'), 'a@example.com');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'goodpass1');
    await fireEvent.press(screen.getByTestId('sign-in-button'));
    expect(await screen.findByTestId('onboarding-screen')).toBeTruthy();
    expect(mockSync.calls).toBe(1);
  });

  it('shows a retry screen when the first sync on a new device fails', async () => {
    mockSync.fail = true;
    mockAuth.signIn.mockImplementation(async () => {
      setTimeout(() => mockAuth.listeners.forEach((l) => l('SIGNED_IN', session)), 0);
      return { error: null, data: { session } };
    });
    await renderRouter('./src/app', { initialUrl: '/' });
    await fireEvent.changeText(await screen.findByTestId('email-input'), 'a@example.com');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'goodpass1');
    await fireEvent.press(screen.getByTestId('sign-in-button'));
    expect(await screen.findByText('データを取得できませんでした')).toBeTruthy();
  });

  it('validates sign-up input and requires agreeing to the terms', async () => {
    const r = await renderRouter('./src/app', { initialUrl: '/sign-up' });
    expect(await screen.findByTestId('sign-up-screen')).toBeTruthy();
    await fireEvent.press(screen.getByText('登録する'));
    expect(await screen.findByText('メールアドレスの形式が正しくありません')).toBeTruthy();
    expect(screen.getByText('登録には同意が必要です')).toBeTruthy();
    expect(mockAuth.signUp).not.toHaveBeenCalled();

    mockAuth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    await fireEvent.changeText(screen.getByLabelText('メールアドレス'), 'new@example.com');
    await fireEvent.changeText(screen.getByLabelText('パスワード'), 'newpass123');
    await fireEvent.press(screen.getByTestId('terms-checkbox'));
    await fireEvent.press(screen.getByText('登録する'));
    await waitFor(() => expect(r.getPathname()).toBe('/check-email'));
    expect(mockAuth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', password: 'newpass123' }),
    );
  });
});
