import { Platform } from 'react-native';

import { isLocalMode, revenueCatKeyFor } from '@/lib/config';

import { mockBilling } from './mock';
import { createRevenueCatBilling } from './revenueCat';
import type { BillingClient } from './types';
import { unavailableBilling } from './unavailable';

export type { BillingClient, PremiumPackage } from './types';
export { BillingError } from './types';

let client: BillingClient | null = null;

/**
 * - iOS/Android with a public RevenueCat key and Supabase → RevenueCat
 * - local mode (dev build without Supabase) → mock store (fictional purchases)
 * - otherwise (web, keys missing) → unavailable
 */
export function getBilling(): BillingClient {
  if (client) return client;
  const key = revenueCatKeyFor(Platform.OS);
  if (isLocalMode()) client = __DEV__ ? mockBilling : unavailableBilling;
  else if (key) client = createRevenueCatBilling(key);
  else client = unavailableBilling;
  return client;
}

/** Test helper. */
export function setBillingForTests(c: BillingClient | null) {
  client = c;
}
