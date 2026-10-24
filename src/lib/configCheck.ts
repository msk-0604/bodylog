/**
 * Validation of the PUBLIC configuration values (EXPO_PUBLIC_*). Shared by the app (refuses
 * dangerous values at runtime) and `scripts/check-env.ts` (checks .env / EAS values before a
 * build). Never prints or returns the values themselves.
 */

export type CheckResult = { ok: boolean; problem?: string };

const ok: CheckResult = { ok: true };
const ng = (problem: string): CheckResult => ({ ok: false, problem });

function jwtRole(token: string): string | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = JSON.parse(
      // base64url → base64; atob exists in Hermes, browsers and Node ≥ 16
      atob(
        part
          .replace(/-/g, '+')
          .replace(/_/g, '/')
          .padEnd(Math.ceil(part.length / 4) * 4, '='),
      ),
    ) as { role?: unknown };
    return typeof json.role === 'string' ? json.role : null;
  } catch {
    return null;
  }
}

export function checkSupabaseUrl(url: string): CheckResult {
  if (!url) return ng('未設定');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) && !/^https:\/\/[^/]+$/.test(url)) {
    return ng('https:// で始まるプロジェクトURL（例 https://xxxx.supabase.co）を設定してください');
  }
  return ok;
}

/** anon (legacy JWT) or publishable key. A service_role / secret key must never ship in the app. */
export function checkSupabaseAnonKey(key: string): CheckResult {
  if (!key) return ng('未設定');
  if (key.startsWith('sb_secret_'))
    return ng('secret キーです。anon / publishable キーを設定してください');
  if (key.startsWith('sb_publishable_')) return ok;
  if (key.startsWith('eyJ')) {
    const role = jwtRole(key);
    if (role === 'service_role') return ng('service_role キーです。anon キーを設定してください');
    if (role !== 'anon') return ng('anon キーとして読み取れません');
    return ok;
  }
  return ng('anon / publishable キーの形式ではありません');
}

export function checkRevenueCatKey(key: string, os: 'ios' | 'android'): CheckResult {
  if (!key) return ng('未設定（課金は「準備中」になります）');
  if (key.startsWith('sk_'))
    return ng('RevenueCat の秘密キー（sk_）です。公開SDKキーを設定してください');
  const prefix = os === 'ios' ? 'appl_' : 'goog_';
  if (!key.startsWith(prefix)) return ng(`${prefix} で始まる公開SDKキーを設定してください`);
  return ok;
}
