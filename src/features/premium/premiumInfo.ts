import { router } from 'expo-router';

/**
 * Single entry point for "this is a Premium feature": opens the paywall with the feature name.
 * (Name kept from Phase 4 so every gate goes through one function.)
 */
export function showPremiumInfo(feature: string) {
  router.push({ pathname: '/premium', params: { feature } });
}
