import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type PurchasesPackage,
  type PurchasesStoreProduct,
} from 'react-native-purchases';

import { classifyBillingError } from '@/domain/billing';

import { BillingError, type BillingClient, type BillingResult, type PremiumPackage } from './types';

const ENTITLEMENT = 'premium';

function toPremiumPackage(p: PurchasesPackage): PremiumPackage {
  const product: PurchasesStoreProduct = p.product;
  return {
    id: p.identifier,
    productId: product.identifier,
    title: product.title,
    priceString: product.priceString,
    price: product.price,
    currencyCode: product.currencyCode,
    period: product.subscriptionPeriod ?? null,
    intro: product.introPrice
      ? {
          priceString: product.introPrice.priceString,
          period: product.introPrice.period ?? null,
          cycles: product.introPrice.cycles,
        }
      : null,
  };
}

const errorCode = (e: unknown) => (e as { code?: unknown } | null)?.code;

/** RevenueCat-backed billing. The SDK is configured lazily with the signed-in user's id. */
export function createRevenueCatBilling(apiKey: string): BillingClient {
  let sdkConfigured = false;
  /** user the SDK is currently bound to (null after sign-out) */
  let configuredFor: string | null = null;
  let packages = new Map<string, PurchasesPackage>();
  const listeners = new Set<() => void>();

  const fire = () => listeners.forEach((l) => l());

  async function bindTo(userId: string) {
    if (!sdkConfigured) {
      if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.WARN);
      // Configure with the user id directly: never create an anonymous RevenueCat user whose
      // purchases could later be merged into the wrong account.
      Purchases.configure({ apiKey, appUserID: userId });
      Purchases.addCustomerInfoUpdateListener(fire);
      sdkConfigured = true;
      configuredFor = userId;
      return;
    }
    if (configuredFor !== userId || (await Purchases.getAppUserID()) !== userId) {
      await Purchases.logIn(userId);
      configuredFor = userId;
      packages = new Map();
    }
  }

  return {
    kind: 'revenuecat',
    identify: bindTo,
    async reset() {
      if (configuredFor === null) return;
      packages = new Map();
      try {
        await Purchases.logOut();
      } catch {
        // LOG_OUT_ANONYMOUS_USER_ERROR etc.: nothing bound, nothing to undo
      }
      configuredFor = null;
    },
    async getPremiumPackage() {
      if (configuredFor === null) throw new BillingError('unavailable');
      try {
        const offerings = await Purchases.getOfferings();
        const offering = offerings.current;
        const pkg = offering?.monthly ?? offering?.availablePackages[0] ?? null;
        if (!pkg) return null;
        packages.set(pkg.identifier, pkg);
        return toPremiumPackage(pkg);
      } catch (e) {
        throw new BillingError(classifyBillingError(errorCode(e)));
      }
    },
    async purchase(pkg, userId): Promise<BillingResult> {
      const native = packages.get(pkg.id);
      if (!native) return { ok: false, kind: 'unavailable' };
      try {
        await bindTo(userId);
        if ((await Purchases.getAppUserID()) !== userId) return { ok: false, kind: 'unknown' };
        await Purchases.purchasePackage(native);
        return { ok: true };
      } catch (e) {
        return { ok: false, kind: classifyBillingError(errorCode(e)) };
      }
    },
    async restore(userId): Promise<BillingResult> {
      try {
        await bindTo(userId);
        const info = await Purchases.restorePurchases();
        return info.entitlements.active[ENTITLEMENT]
          ? { ok: true }
          : { ok: false, kind: 'nothingToRestore' };
      } catch (e) {
        return { ok: false, kind: classifyBillingError(errorCode(e)) };
      }
    },
    async managementUrl() {
      if (configuredFor !== null) {
        try {
          const info = await Purchases.getCustomerInfo();
          if (info.managementURL) return info.managementURL;
        } catch {
          // fall back to the store's generic page
        }
      }
      return Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions';
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
