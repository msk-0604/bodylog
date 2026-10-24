/**
 * Public runtime configuration (inlined at build time from EXPO_PUBLIC_* env vars).
 * Only values that are safe to ship inside the app may appear here.
 */
export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  /** Versions of the legal documents the user agrees to (bump when the text changes). */
  termsVersion: '2026-10-draft',
  privacyVersion: '2026-10-draft',
};

export const isSupabaseConfigured = (): boolean =>
  /^https:\/\/.+/.test(config.supabaseUrl) && config.supabaseAnonKey.length > 20;

/**
 * Local mode: development builds without Supabase settings keep all data on the device
 * (no account, no sync). Release builds without configuration refuse to start.
 */
export const isLocalMode = (): boolean => !isSupabaseConfigured();

export const LOCAL_USER_ID = 'local-user';
