/**
 * RevenueCat client mapping (against an in-memory react-native-purchases mock) and the
 * per-user plan cache. The real SDK / stores are not exercised.
 */
import { createRevenueCatBilling } from '@/features/premium/billing/revenueCat';
import { mockPurchases } from '@/testing/purchasesMock';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

beforeEach(() => mockPurchases.reset());

describe('RevenueCat client', () => {
  it('configures with the Supabase user id (never anonymous) and switches with logIn', async () => {
    const billing = createRevenueCatBilling('appl_test');
    await billing.identify(A);
    expect(mockPurchases.configured).toEqual({ apiKey: 'appl_test', appUserID: A });
    await billing.identify(A);
    await billing.reset();
    await billing.identify(B);
    expect(mockPurchases.calls).toEqual([`configure:${A}`, 'logOut', `logIn:${B}`]);
  });

  it('maps the store product without inventing a price', async () => {
    const billing = createRevenueCatBilling('appl_test');
    await billing.identify(A);
    expect(await billing.getPremiumPackage()).toEqual({
      id: '$rc_monthly',
      productId: 'jp.bodylog.premium.monthly',
      title: 'BODYLOG Premium',
      priceString: '¥350',
      price: 350,
      currencyCode: 'JPY',
      period: 'P1M',
      intro: null,
    });
  });

  it('refuses to load products before a user is bound, and maps offering errors', async () => {
    const billing = createRevenueCatBilling('appl_test');
    await expect(billing.getPremiumPackage()).rejects.toMatchObject({ kind: 'unavailable' });
    await billing.identify(A);
    mockPurchases.offeringsFail = '10';
    await expect(billing.getPremiumPackage()).rejects.toMatchObject({ kind: 'network' });
  });

  it('purchases for the requested user only (re-binds if the SDK drifted)', async () => {
    const billing = createRevenueCatBilling('appl_test');
    await billing.identify(A);
    const pkg = (await billing.getPremiumPackage())!;
    mockPurchases.appUserId = '$RCAnonymousID:drift';
    expect(await billing.purchase(pkg, A)).toEqual({ ok: true });
    expect(mockPurchases.calls).toContain(`logIn:${A}`);
    expect(mockPurchases.calls.at(-1)).toBe(`purchase:$rc_monthly:${A}`);
  });

  it.each([
    ['1', 'cancelled'],
    ['20', 'pending'],
    ['10', 'network'],
    ['35', 'network'],
    ['6', 'alreadyOwned'],
    ['3', 'notAllowed'],
    ['5', 'unavailable'],
    ['15', 'inProgress'],
    ['999', 'unknown'],
  ])('maps purchase error code %s to %s', async (code, kind) => {
    const billing = createRevenueCatBilling('appl_test');
    await billing.identify(A);
    const pkg = (await billing.getPremiumPackage())!;
    mockPurchases.failWith = code;
    expect(await billing.purchase(pkg, A)).toEqual({ ok: false, kind });
  });

  it('restore: success only with an active premium entitlement', async () => {
    const billing = createRevenueCatBilling('appl_test');
    await billing.identify(A);
    expect(await billing.restore(A)).toEqual({ ok: false, kind: 'nothingToRestore' });
    mockPurchases.active = true;
    expect(await billing.restore(A)).toEqual({ ok: true });
  });

  it('management URL: from the SDK, else the store page', async () => {
    const billing = createRevenueCatBilling('appl_test');
    expect(await billing.managementUrl()).toBe('https://apps.apple.com/account/subscriptions');
  });

  it('notifies listeners on customer info updates', async () => {
    const billing = createRevenueCatBilling('appl_test');
    const seen: number[] = [];
    billing.onChange(() => seen.push(1));
    await billing.identify(A);
    mockPurchases.listeners.forEach((l) => l({}));
    expect(seen).toEqual([1]);
  });
});
