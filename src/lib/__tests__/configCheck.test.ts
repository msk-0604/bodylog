import { checkRevenueCatKey, checkSupabaseAnonKey, checkSupabaseUrl } from '@/lib/configCheck';

const jwt = (payload: object) =>
  [{ alg: 'HS256', typ: 'JWT' }, payload]
    .map((p) => Buffer.from(JSON.stringify(p)).toString('base64url'))
    .join('.') + '.signature';

describe('public config validation', () => {
  it('accepts Supabase project URLs only over https', () => {
    expect(checkSupabaseUrl('https://abcdefgh.supabase.co').ok).toBe(true);
    expect(checkSupabaseUrl('http://abcdefgh.supabase.co').ok).toBe(false);
    expect(checkSupabaseUrl('').ok).toBe(false);
  });

  it('accepts anon / publishable keys and rejects service_role / secret keys', () => {
    expect(checkSupabaseAnonKey(jwt({ role: 'anon', iss: 'supabase' })).ok).toBe(true);
    expect(checkSupabaseAnonKey('sb_publishable_abc123').ok).toBe(true);
    expect(checkSupabaseAnonKey(jwt({ role: 'service_role' }))).toMatchObject({ ok: false });
    expect(checkSupabaseAnonKey('sb_secret_abc123')).toMatchObject({ ok: false });
    expect(checkSupabaseAnonKey('random-string').ok).toBe(false);
  });

  it('accepts only public RevenueCat SDK keys for the right platform', () => {
    expect(checkRevenueCatKey('appl_x', 'ios').ok).toBe(true);
    expect(checkRevenueCatKey('goog_x', 'android').ok).toBe(true);
    expect(checkRevenueCatKey('goog_x', 'ios').ok).toBe(false);
    expect(checkRevenueCatKey('sk_live', 'ios').ok).toBe(false);
  });
});
