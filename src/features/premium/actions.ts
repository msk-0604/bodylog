import NetInfo from '@react-native-community/netinfo';
import { Linking } from 'react-native';

import type { BillingErrorKind } from '@/domain/billing';
import { useSession } from '@/features/auth/session';

import { getBilling, type PremiumPackage } from './billing';
import { reloadPlan, verifyWithServer } from './entitlement';

export type FlowResult = { ok: true } | { ok: false; kind: BillingErrorKind };

/** Delays between server confirmations after the store reported success (webhook latency). */
export const CONFIRM_DELAYS_MS = [0, 1_500, 3_000, 5_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function isOffline() {
  try {
    const s = await NetInfo.fetch();
    return s.isConnected === false;
  } catch {
    return false;
  }
}

/**
 * The store said "purchased/restored": now wait until the SERVER agrees (RevenueCat verified
 * the receipt and our webhook / subscription-sync stored it). Stops if the account changed.
 */
async function confirmPremium(userId: string, delays = CONFIRM_DELAYS_MS): Promise<boolean> {
  for (const d of delays) {
    if (d) await sleep(d);
    if (useSession.getState().userId !== userId) return false;
    const verdict = await verifyWithServer();
    const plan = await reloadPlan().catch(() => 'free' as const);
    if (verdict === true || plan === 'premium') return true;
  }
  return false;
}

let busy = false;

async function run(fn: (userId: string) => Promise<FlowResult>): Promise<FlowResult> {
  if (busy) return { ok: false, kind: 'inProgress' };
  const userId = useSession.getState().userId;
  if (!userId) return { ok: false, kind: 'unknown' };
  busy = true;
  try {
    return await fn(userId);
  } finally {
    busy = false;
  }
}

/** Purchase → server confirmation. Never unlocks on the store's word alone. */
export function purchasePremium(pkg: PremiumPackage, delays?: number[]): Promise<FlowResult> {
  return run(async (userId) => {
    if (await isOffline()) return { ok: false, kind: 'network' };
    const billing = getBilling();
    await billing.identify(userId);
    const r = await billing.purchase(pkg, userId);
    if (!r.ok) return r;
    return (await confirmPremium(userId, delays)) ? { ok: true } : { ok: false, kind: 'verifying' };
  });
}

export function restorePremium(delays?: number[]): Promise<FlowResult> {
  return run(async (userId) => {
    if (await isOffline()) return { ok: false, kind: 'network' };
    const billing = getBilling();
    await billing.identify(userId);
    const r = await billing.restore(userId);
    if (!r.ok && r.kind !== 'nothingToRestore') return r;
    // Even when the device found nothing, the server may know a purchase (e.g. other platform).
    const confirmed = await confirmPremium(userId, r.ok ? delays : [0]);
    if (confirmed) return { ok: true };
    return { ok: false, kind: r.ok ? 'verifying' : 'nothingToRestore' };
  });
}

/** Opens the store's subscription management (cancel / change payment). */
export async function openSubscriptionManagement(): Promise<boolean> {
  const url = await getBilling().managementUrl();
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export function resetPurchaseFlowForTests() {
  busy = false;
}
