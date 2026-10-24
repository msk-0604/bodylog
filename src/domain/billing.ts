/**
 * Billing rules that don't depend on the store SDK: error classification, wording and how a
 * store package / subscription state is described. Prices always come from the store.
 */
import { formatDateKeyJa, toDateKey } from './date';

export type BillingErrorKind =
  | 'cancelled'
  | 'pending'
  | 'network'
  | 'alreadyOwned'
  | 'notAllowed'
  | 'unavailable'
  | 'inProgress'
  /** restore finished but found no active Premium purchase */
  | 'nothingToRestore'
  /** the store charged but the server has not confirmed Premium yet */
  | 'verifying'
  | 'unknown';

/** RevenueCat PURCHASES_ERROR_CODE values (strings) → our categories. */
export function classifyBillingError(code: unknown): BillingErrorKind {
  switch (String(code ?? '')) {
    case '1':
      return 'cancelled';
    case '20':
      return 'pending';
    case '10':
    case '35':
    case '32':
      return 'network';
    case '6':
    case '7':
    case '13':
      return 'alreadyOwned';
    case '3':
    case '18':
      return 'notAllowed';
    case '5':
    case '2':
    case '23':
    case '24':
    case '11':
      return 'unavailable';
    case '15':
      return 'inProgress';
    default:
      return 'unknown';
  }
}

/** User-facing messages (never blame the user). `cancelled` shows nothing. */
export const BILLING_MESSAGES: Record<
  Exclude<BillingErrorKind, 'cancelled'>,
  { title: string; body: string }
> = {
  pending: {
    title: '購入の承認を待っています',
    body: '保護者の承認やお支払い方法の確認が終わると、自動的にPremiumが有効になります。',
  },
  network: {
    title: '通信できませんでした',
    body: 'インターネットに接続できる環境で、もう一度お試しください。料金は請求されていません。',
  },
  alreadyOwned: {
    title: 'すでに購入済みのようです',
    body: '「購入を復元」をお試しください。別のBODYLOGアカウントで購入している場合は、そのアカウントでログインしてください。',
  },
  notAllowed: {
    title: 'この端末では購入できません',
    body: 'スクリーンタイムやペアレンタルコントロールなどで購入が制限されている可能性があります。端末の設定をご確認ください。',
  },
  unavailable: {
    title: '現在購入できません',
    body: 'ストアで商品情報を取得できませんでした。時間をおいてもう一度お試しください。',
  },
  inProgress: {
    title: '処理中です',
    body: '前の購入処理が終わるまでお待ちください。',
  },
  nothingToRestore: {
    title: '復元できる購入が見つかりませんでした',
    body: '購入時と同じApple ID／Googleアカウントでストアにサインインしているかご確認ください。',
  },
  verifying: {
    title: '購入を確認しています',
    body: 'ストアでの購入は完了しています。Premiumの反映まで少し時間がかかる場合があります。しばらくしてからマイページで「購入を復元」をお試しください。',
  },
  unknown: {
    title: '購入を完了できませんでした',
    body: '時間をおいてもう一度お試しください。料金が請求された場合は「購入を復元」をお試しください。',
  },
};

/** ISO 8601 duration of a store product (P1M, P1Y, P1W, …) → "1か月" etc. */
export function periodLabel(iso: string | null | undefined): string | null {
  const m = /^P(\d+)([DWMY])$/.exec(iso ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  const unit = { D: '日', W: '週間', M: 'か月', Y: '年' }[m[2] as 'D' | 'W' | 'M' | 'Y'];
  return `${n}${unit}`;
}

/** "月額" / "年額" when the period is exactly one month / year, else "N か月ごと". */
export function billingCycleLabel(iso: string | null | undefined): string | null {
  if (iso === 'P1M') return '月額';
  if (iso === 'P1Y') return '年額';
  const p = periodLabel(iso);
  return p ? `${p}ごと` : null;
}

export type StorePackageInfo = {
  productId: string;
  priceString: string;
  period: string | null;
};

/** The Premium product must be an auto-renewing subscription with a known billing period. */
export function isValidPremiumPackage(p: StorePackageInfo | null): p is StorePackageInfo {
  return !!p && !!p.productId && !!p.priceString && periodLabel(p.period) !== null;
}

/* ---------------- subscription state for display ---------------- */

export type SubscriptionInfo = {
  status: string;
  expiresAt: string | null;
  willRenew: boolean;
  store: string | null;
};

const INFINITY = 'infinity';

export function subscriptionEnd(s: { expiresAt: string | null }): Date | 'never' | null {
  if (!s.expiresAt) return null;
  if (s.expiresAt === INFINITY) return 'never';
  const d = new Date(s.expiresAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** One line for My Page, e.g. "次回更新日：11月24日(火)" / "11月24日(火)まで利用できます". */
export function describeSubscription(s: SubscriptionInfo | null): string | null {
  if (!s) return null;
  const end = subscriptionEnd(s);
  if (end === 'never') return '期限なし';
  if (!end) return null;
  const day = formatDateKeyJa(toDateKey(end));
  switch (s.status) {
    case 'active':
      return s.willRenew ? `次回更新日：${day}` : `${day}まで利用できます`;
    case 'cancelled':
      return `自動更新はオフです。${day}まで利用できます`;
    case 'billing_issue':
      return `お支払いを確認できませんでした。${day}までにストアでお支払い方法をご確認ください`;
    default:
      return null;
  }
}

export const STORE_LABELS: Record<string, string> = {
  app_store: 'App Store',
  play_store: 'Google Play',
  promotional: '特典',
  test_store: 'テスト',
};
