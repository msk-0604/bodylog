/**
 * Free vs Premium limits. Premium status itself must come from the server
 * (subscriptions table updated by the RevenueCat webhook / verified SDK state),
 * never from a client-side flag alone.
 */

export type Plan = 'free' | 'premium';

export const FREE_LIMITS = {
  favorites: 10,
  templates: 1,
} as const;

export const GRAPH_RANGES = ['7d', '30d', '90d', 'all'] as const;
export type GraphRange = (typeof GRAPH_RANGES)[number];

export const GRAPH_RANGE_LABELS: Record<GraphRange, string> = {
  '7d': '7日',
  '30d': '30日',
  '90d': '90日',
  all: '全期間',
};

export function canAddFavorite(plan: Plan, currentCount: number): boolean {
  return plan === 'premium' || currentCount < FREE_LIMITS.favorites;
}

export function canCreateTemplate(plan: Plan, currentCount: number): boolean {
  return plan === 'premium' || currentCount < FREE_LIMITS.templates;
}

export function isGraphRangeAvailable(plan: Plan, range: GraphRange): boolean {
  return plan === 'premium' || range === '7d';
}

export function canExportCsv(plan: Plan): boolean {
  return plan === 'premium';
}

/**
 * Templates after Premium lapses: nothing is deleted. On the free plan, the
 * `FREE_LIMITS.templates` oldest templates (by created_at) stay fully usable/editable;
 * the rest are view/delete only until the user upgrades again.
 */
export function usableTemplateIds(
  plan: Plan,
  templates: readonly { id: string; createdAt: Date }[],
): Set<string> {
  if (plan === 'premium') return new Set(templates.map((t) => t.id));
  return new Set(
    [...templates]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      .slice(0, FREE_LIMITS.templates)
      .map((t) => t.id),
  );
}

/**
 * Favorites after Premium lapses: all remain visible and usable for logging;
 * adding new ones is blocked while count >= the free limit.
 */
export function favoritesOverLimit(plan: Plan, count: number): number {
  return plan === 'premium' ? 0 : Math.max(count - FREE_LIMITS.favorites, 0);
}
