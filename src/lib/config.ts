/**
 * Public runtime configuration (inlined at build time from EXPO_PUBLIC_* env vars).
 * Only values that are safe to ship inside the app may appear here.
 */
export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  /** RevenueCat PUBLIC SDK keys (appl_… / goog_…). Secret keys (sk_…) must never be here. */
  revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
  revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
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

/**
 * Public RevenueCat SDK key for the platform, or null when billing is not configured.
 * A key with the secret-key prefix is rejected so a misconfigured build can't ship it as "public".
 */
export function revenueCatKeyFor(
  os: string,
  c: Pick<typeof config, 'revenueCatIosKey' | 'revenueCatAndroidKey'> = config,
): string | null {
  const key = os === 'ios' ? c.revenueCatIosKey : os === 'android' ? c.revenueCatAndroidKey : '';
  if (!key || key.startsWith('sk_')) return null;
  const prefix = os === 'ios' ? 'appl_' : 'goog_';
  return key.startsWith(prefix) ? key : null;
}
