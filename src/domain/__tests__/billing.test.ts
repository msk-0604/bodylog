import * as b from '../billing';
import { isActivePremium } from '../subscription';

describe('billing (Phase 6)', () => {
  it('describes billing periods from the store product', () => {
    expect(b.periodLabel('P1M')).toBe('1か月');
    expect(b.periodLabel('P1Y')).toBe('1年');
    expect(b.periodLabel('P2W')).toBe('2週間');
    expect(b.periodLabel(null)).toBeNull();
    expect(b.billingCycleLabel('P1M')).toBe('月額');
    expect(b.billingCycleLabel('P3M')).toBe('3か月ごと');
  });

  it('accepts only subscription packages with a known period and a store price', () => {
    expect(b.isValidPremiumPackage({ productId: 'x', priceString: '¥350', period: 'P1M' })).toBe(
      true,
    );
    expect(b.isValidPremiumPackage({ productId: 'x', priceString: '¥350', period: null })).toBe(
      false,
    );
    expect(b.isValidPremiumPackage({ productId: 'x', priceString: '', period: 'P1M' })).toBe(false);
    expect(b.isValidPremiumPackage(null)).toBe(false);
  });

  it('classifies RevenueCat error codes', () => {
    expect(b.classifyBillingError('1')).toBe('cancelled');
    expect(b.classifyBillingError('20')).toBe('pending');
    expect(b.classifyBillingError(undefined)).toBe('unknown');
  });

  it('describes the subscription state for My Page', () => {
    const end = new Date(2026, 10, 24, 12).toISOString();
    expect(
      b.describeSubscription({ status: 'active', willRenew: true, expiresAt: end, store: null }),
    ).toBe('次回更新日：11月24日(火)');
    expect(
      b.describeSubscription({
        status: 'cancelled',
        willRenew: false,
        expiresAt: end,
        store: null,
      }),
    ).toMatch(/自動更新はオフです。11月24日\(火\)まで/);
    expect(
      b.describeSubscription({
        status: 'billing_issue',
        willRenew: true,
        expiresAt: end,
        store: null,
      }),
    ).toMatch(/お支払い方法/);
    expect(
      b.describeSubscription({
        status: 'active',
        willRenew: false,
        expiresAt: 'infinity',
        store: null,
      }),
    ).toBe('期限なし');
  });

  it('treats an infinity expiry as active and expired/refunded as free', () => {
    expect(
      isActivePremium({ status: 'active', expires_at: 'infinity', entitlement: 'premium' }),
    ).toBe(true);
    expect(
      isActivePremium({ status: 'refunded', expires_at: 'infinity', entitlement: 'premium' }),
    ).toBe(false);
  });
});
