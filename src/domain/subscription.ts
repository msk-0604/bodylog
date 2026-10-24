/** Subscription row as stored in public.subscriptions (written only by the server). */
export type SubscriptionRow = { status: string; expires_at: string | null; entitlement: string };

/** Same rule as the DB function public.is_premium(). */
export function isActivePremium(row: SubscriptionRow | null, now = new Date()): boolean {
  if (!row || row.entitlement !== 'premium' || !row.expires_at) return false;
  if (['expired', 'refunded', 'paused'].includes(row.status)) return false;
  return new Date(row.expires_at) > now;
}
