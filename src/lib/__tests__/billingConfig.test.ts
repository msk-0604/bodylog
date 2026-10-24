import { revenueCatKeyFor } from '@/lib/config';

describe('RevenueCat key selection', () => {
  const keys = { revenueCatIosKey: 'appl_abc', revenueCatAndroidKey: 'goog_def' };

  it('returns the public SDK key for the platform', () => {
    expect(revenueCatKeyFor('ios', keys)).toBe('appl_abc');
    expect(revenueCatKeyFor('android', keys)).toBe('goog_def');
    expect(revenueCatKeyFor('web', keys)).toBeNull();
  });

  it('rejects secret keys, swapped keys and empty values', () => {
    expect(revenueCatKeyFor('ios', { ...keys, revenueCatIosKey: 'sk_live_secret' })).toBeNull();
    expect(revenueCatKeyFor('ios', { ...keys, revenueCatIosKey: 'goog_def' })).toBeNull();
    expect(revenueCatKeyFor('android', { ...keys, revenueCatAndroidKey: '' })).toBeNull();
  });
});
