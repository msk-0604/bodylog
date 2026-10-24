import { BillingError, type BillingClient } from './types';

/** No billing in this build (web, or release without RevenueCat keys). */
export const unavailableBilling: BillingClient = {
  kind: 'unavailable',
  identify: async () => {},
  reset: async () => {},
  getPremiumPackage: async () => {
    throw new BillingError('unavailable');
  },
  purchase: async () => ({ ok: false, kind: 'unavailable' }),
  restore: async () => ({ ok: false, kind: 'unavailable' }),
  managementUrl: async () => null,
  onChange: () => () => {},
};
