import type { BillingErrorKind } from '@/domain/billing';

/** The Premium product as the store currently offers it (price/period are the store's). */
export type PremiumPackage = {
  /** package identifier inside the RevenueCat offering */
  id: string;
  productId: string;
  title: string;
  /** localized price incl. tax, exactly as the store formats it (e.g. "¥350") */
  priceString: string;
  price: number;
  currencyCode: string;
  /** ISO 8601 billing period, e.g. "P1M" */
  period: string | null;
  /** free trial / intro price if the store offers one */
  intro: { priceString: string; period: string | null; cycles: number } | null;
};

export type BillingResult = { ok: true } | { ok: false; kind: BillingErrorKind };

export class BillingError extends Error {
  constructor(public readonly kind: BillingErrorKind) {
    super(kind);
  }
}

/**
 * Store billing behind one interface so screens never import the SDK:
 * RevenueCat in builds with public SDK keys, a mock in local development, otherwise
 * "unavailable" (purchase buttons show 準備中).
 */
export interface BillingClient {
  readonly kind: 'revenuecat' | 'mock' | 'unavailable';
  /** Binds purchases to the Supabase user (RevenueCat app user id = auth uid). */
  identify(userId: string): Promise<void>;
  /** Unbinds on sign-out / account switch so one account's purchases never show for another. */
  reset(): Promise<void>;
  /** Throws BillingError when the store or network is unavailable. */
  getPremiumPackage(): Promise<PremiumPackage | null>;
  /** Purchases for `userId` only; refuses if the SDK is bound to another user. */
  purchase(pkg: PremiumPackage, userId: string): Promise<BillingResult>;
  restore(userId: string): Promise<BillingResult>;
  /** Store page to manage / cancel the subscription. */
  managementUrl(): Promise<string | null>;
  /** Called when the store reports a change (renewal, refund, purchase on another device…). */
  onChange(listener: () => void): () => void;
}
