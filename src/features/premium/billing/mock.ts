import type { BillingErrorKind } from '@/domain/billing';
import type { SubscriptionRow } from '@/domain/subscription';

import { BillingError, type BillingClient, type BillingResult, type PremiumPackage } from './types';

/**
 * Development / test stand-in for the store. Used only in local mode (no Supabase, dev build)
 * and in Jest. It also plays the server's role for local mode: a "purchase" stores a fictional
 * subscription row that the plan query reads. Release builds never use it.
 */
export type MockScenario = 'success' | Exclude<BillingErrorKind, 'nothingToRestore' | 'verifying'>;

const PACKAGE: PremiumPackage = {
  id: '$rc_monthly',
  productId: 'mock.premium.monthly',
  title: 'BODYLOG Premium（テスト）',
  priceString: '¥350',
  price: 350,
  currencyCode: 'JPY',
  period: 'P1M',
  intro: null,
};

export const mockBillingState = {
  scenario: 'success' as MockScenario,
  /** what getPremiumPackage returns/throws */
  offering: 'ok' as 'ok' | 'none' | BillingErrorKind,
  boundUser: null as string | null,
  /** "server" state per user (local mode only) */
  subscriptions: new Map<string, SubscriptionRow & { will_renew: boolean; store: string }>(),
  purchases: 0,
  /** purchase attempts, including failed/cancelled ones */
  attempts: 0,
  reset() {
    this.scenario = 'success';
    this.offering = 'ok';
    this.boundUser = null;
    this.subscriptions.clear();
    this.purchases = 0;
    this.attempts = 0;
  },
};

const listeners = new Set<() => void>();

function grant(userId: string) {
  mockBillingState.subscriptions.set(userId, {
    entitlement: 'premium',
    status: 'active',
    expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    will_renew: true,
    store: 'test_store',
  });
}

export const mockBilling: BillingClient = {
  kind: 'mock',
  identify: async (userId) => {
    mockBillingState.boundUser = userId;
  },
  reset: async () => {
    mockBillingState.boundUser = null;
  },
  getPremiumPackage: async () => {
    const o = mockBillingState.offering;
    if (o === 'ok') return PACKAGE;
    if (o === 'none') return null;
    throw new BillingError(o);
  },
  purchase: async (_pkg, userId): Promise<BillingResult> => {
    if (mockBillingState.boundUser !== userId) return { ok: false, kind: 'unknown' };
    mockBillingState.attempts += 1;
    const s = mockBillingState.scenario;
    if (s !== 'success') return { ok: false, kind: s };
    mockBillingState.purchases += 1;
    grant(userId);
    listeners.forEach((l) => l());
    return { ok: true };
  },
  restore: async (userId): Promise<BillingResult> => {
    if (mockBillingState.boundUser !== userId) return { ok: false, kind: 'unknown' };
    const s = mockBillingState.scenario;
    if (s !== 'success') return { ok: false, kind: s };
    return mockBillingState.subscriptions.has(userId)
      ? { ok: true }
      : { ok: false, kind: 'nothingToRestore' };
  },
  managementUrl: async () => 'https://apps.apple.com/account/subscriptions',
  onChange: (l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
