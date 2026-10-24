import { Alert } from 'react-native';

/**
 * Explains a Premium-only feature. Phase 6 replaces this with navigation to the paywall
 * (`/premium`), so every Premium gate already goes through this single function.
 */
export function showPremiumInfo(feature: string) {
  Alert.alert(
    'Premiumの機能です',
    `${feature}はPremium（月額350円・税込）でご利用いただけます。記録や基本機能はこれまでどおり無料でご利用いただけます。`,
  );
}
