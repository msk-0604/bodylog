import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  Card,
  closeModal,
  ErrorState,
  ModalScreen,
  PressableScale,
  Skeleton,
} from '@/components/ui';
import {
  BILLING_MESSAGES,
  billingCycleLabel,
  describeSubscription,
  isValidPremiumPackage,
  periodLabel,
  type BillingErrorKind,
} from '@/domain/billing';
import { FREE_LIMITS } from '@/domain/entitlements';
import { useSession } from '@/features/auth/session';
import {
  purchasePremium,
  restorePremium,
  openSubscriptionManagement,
} from '@/features/premium/actions';
import { BillingError, getBilling, type PremiumPackage } from '@/features/premium/billing';
import { usePremium } from '@/features/premium/entitlement';
import { haptics } from '@/lib/haptics';
import { MIN_TAP, radius, spacing, useTheme } from '@/theme';

/** Only features that exist today are listed (no promises of unreleased features). */
const FEATURES = [
  {
    title: '30日・90日・全期間のグラフ',
    detail: '体重・体脂肪率の長期的な変化を確認できます（無料版は7日）',
  },
  { title: '期間の統計', detail: '期間内の平均・最小・最大・変化量・記録日数' },
  { title: 'お気に入りを無制限に', detail: `無料版は${FREE_LIMITS.favorites}件まで` },
  { title: '食事テンプレートを無制限に', detail: `無料版は${FREE_LIMITS.templates}件まで` },
] as const;

const STORE = Platform.OS === 'ios' ? 'App Store' : 'Google Play';
const ACCOUNT = Platform.OS === 'ios' ? 'Apple Account（Apple ID）' : 'Googleアカウント';
const CANCEL_PATH =
  Platform.OS === 'ios'
    ? '「設定」アプリ ＞ ユーザー名 ＞ 「サブスクリプション」'
    : 'Google Play ストア ＞ プロフィール ＞ 「お支払いと定期購入」 ＞ 「定期購入」';

function showResult(kind: BillingErrorKind) {
  if (kind === 'cancelled') return; // the user closed the store sheet: say nothing
  const m = BILLING_MESSAGES[kind];
  Alert.alert(m.title, m.body);
}

export default function PremiumScreen() {
  const { feature } = useLocalSearchParams<{ feature?: string }>();
  const userId = useSession((s) => s.userId);
  const premium = usePremium();
  const billing = getBilling();
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);

  const offering = useQuery({
    queryKey: ['billing', 'premiumPackage', userId, billing.kind],
    enabled: !!userId && billing.kind !== 'unavailable' && premium.plan === 'free',
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<PremiumPackage | null> => {
      await billing.identify(userId!);
      return billing.getPremiumPackage();
    },
  });
  const pkg = offering.data ?? null;
  const pkgValid = isValidPremiumPackage(pkg);

  const buy = async () => {
    if (!pkg || !pkgValid || busy) return;
    setBusy('purchase');
    const r = await purchasePremium(pkg);
    setBusy(null);
    if (r.ok) {
      haptics.success();
      Alert.alert('Premiumへようこそ', 'すべてのPremium機能をご利用いただけます。', [
        { text: 'OK', onPress: () => closeModal() },
      ]);
      return;
    }
    if (r.kind !== 'cancelled') haptics.warning();
    showResult(r.kind);
  };

  const restore = async () => {
    if (busy) return;
    setBusy('restore');
    const r = await restorePremium();
    setBusy(null);
    if (r.ok) {
      haptics.success();
      Alert.alert('購入を復元しました', 'Premiumをご利用いただけます。');
      return;
    }
    showResult(r.kind);
  };

  const manage = async () => {
    if (!(await openSubscriptionManagement())) {
      Alert.alert('ストアを開けませんでした', `${CANCEL_PATH} から管理できます。`);
    }
  };

  if (premium.plan === 'premium') {
    return (
      <ModalScreen title="Premium" cancelLabel="閉じる" testID="premium-screen">
        <Card style={styles.gap} testID="premium-active">
          <AppText variant="title2">Premiumをご利用中です</AppText>
          {describeSubscription(premium.subscription) ? (
            <AppText variant="subhead" color="textSecondary">
              {describeSubscription(premium.subscription)}
            </AppText>
          ) : null}
          <Button
            label="サブスクリプションの管理"
            variant="secondary"
            size="md"
            onPress={() => void manage()}
          />
        </Card>
        <FeatureList />
        <LegalLinks />
      </ModalScreen>
    );
  }

  return (
    <ModalScreen title="Premium" cancelLabel="閉じる" testID="premium-screen">
      {feature ? (
        <AppText variant="subhead" color="textSecondary" testID="premium-feature">
          「{feature}」はPremiumの機能です。
        </AppText>
      ) : null}
      <AppText variant="title2">続けるほど、変化が見えてくる</AppText>
      <AppText variant="subhead" color="textSecondary">
        食事・体重・運動の記録はこれまでどおり無料です。Premiumでは長期の分析と、記録を速くする機能が使えます。
      </AppText>
      <FeatureList />

      <PlanCard
        loading={offering.isLoading}
        error={offering.error}
        pkg={pkg}
        valid={pkgValid}
        unavailable={billing.kind === 'unavailable'}
        onRetry={() => void offering.refetch()}
      />

      <Button
        label={
          billing.kind === 'unavailable'
            ? '準備中'
            : pkgValid
              ? `${billingCycleLabel(pkg.period)} ${pkg.priceString} で登録する`
              : '登録する'
        }
        onPress={() => void buy()}
        disabled={!pkgValid || busy === 'restore'}
        loading={busy === 'purchase'}
        testID="premium-purchase"
      />
      <Button
        label="購入を復元"
        variant="ghost"
        size="md"
        onPress={() => void restore()}
        disabled={billing.kind === 'unavailable' || busy === 'purchase'}
        loading={busy === 'restore'}
        testID="premium-restore"
      />

      <Terms pkg={pkgValid ? pkg : null} />
      <LegalLinks />
    </ModalScreen>
  );
}

function FeatureList() {
  const { colors } = useTheme();
  return (
    <Card style={styles.gap}>
      {FEATURES.map((f) => (
        <View key={f.title} style={styles.feature}>
          <View style={[styles.check, { backgroundColor: colors.accentSoft }]}>
            <AppText variant="footnote" color="accent" style={styles.checkMark}>
              ✓
            </AppText>
          </View>
          <View style={styles.flex}>
            <AppText variant="body">{f.title}</AppText>
            <AppText variant="footnote" color="textSecondary">
              {f.detail}
            </AppText>
          </View>
        </View>
      ))}
    </Card>
  );
}

function PlanCard({
  loading,
  error,
  pkg,
  valid,
  unavailable,
  onRetry,
}: {
  loading: boolean;
  error: unknown;
  pkg: PremiumPackage | null;
  valid: boolean;
  unavailable: boolean;
  onRetry: () => void;
}) {
  const { colors } = useTheme();
  if (unavailable) {
    return (
      <Card testID="premium-unavailable">
        <AppText variant="subhead" color="textSecondary">
          この環境ではまだ購入できません（準備中）。iPhone・Androidのアプリで順次ご利用いただけるようになります。
        </AppText>
      </Card>
    );
  }
  if (loading) {
    return (
      <Card style={styles.gap}>
        <Skeleton width="40%" height={14} />
        <Skeleton width="60%" height={28} />
      </Card>
    );
  }
  if (error || !valid || !pkg) {
    const kind = error instanceof BillingError ? error.kind : 'unavailable';
    const m = kind === 'network' ? BILLING_MESSAGES.network : BILLING_MESSAGES.unavailable;
    return (
      <Card testID="premium-offering-error">
        <ErrorState title={m.title} message={m.body} onRetry={onRetry} />
      </Card>
    );
  }
  return (
    <Card style={[styles.plan, { borderColor: colors.accent }]} testID="premium-plan">
      <AppText variant="footnote" color="textSecondary">
        {pkg.title || 'BODYLOG Premium'}
      </AppText>
      <AppText variant="title1" tabular testID="premium-price">
        {pkg.priceString}
        <AppText variant="subhead" color="textSecondary">
          {' '}
          / {periodLabel(pkg.period)}（税込）
        </AppText>
      </AppText>
      <AppText variant="footnote" color="textSecondary">
        {periodLabel(pkg.period)}ごとに自動更新されます。いつでも解約できます。
      </AppText>
      {pkg.intro ? (
        <AppText variant="footnote" color="accent">
          初回特典：{pkg.intro.priceString}（{periodLabel(pkg.intro.period) ?? ''}×
          {pkg.intro.cycles}回）
        </AppText>
      ) : null}
    </Card>
  );
}

function Terms({ pkg }: { pkg: PremiumPackage | null }) {
  const price = pkg
    ? `${pkg.priceString}（${periodLabel(pkg.period)}ごと）`
    : 'ストアに表示される料金';
  return (
    <View style={styles.terms} testID="premium-terms">
      {[
        `料金：${price}。表示価格は${STORE}の価格（税込）です。`,
        `お支払いは購入の確定時に${ACCOUNT}に請求されます。`,
        `自動更新：現在の期間が終了する24時間以上前に自動更新をオフにしない限り、同じ料金で自動的に更新され、期間終了前の24時間以内に請求されます。`,
        `解約方法：${CANCEL_PATH}、またはBODYLOGのマイページ「サブスクリプションの管理」から自動更新をオフにできます。アプリを削除しても解約にはなりません。`,
        '期間の途中で解約しても、期間の終了まではPremiumをご利用いただけます。返金は各ストアの規定に従います。',
      ].map((t) => (
        <AppText key={t} variant="caption" color="textSecondary">
          {t}
        </AppText>
      ))}
    </View>
  );
}

function LegalLinks() {
  const open = (doc: 'terms' | 'privacy') =>
    router.push({ pathname: '/legal/[doc]', params: { doc } });
  return (
    <View style={styles.links}>
      <PressableScale
        onPress={() => open('terms')}
        accessibilityRole="link"
        style={styles.link}
        testID="premium-terms-link"
      >
        <AppText variant="footnote" color="accent">
          利用規約
        </AppText>
      </PressableScale>
      <AppText variant="footnote" color="textTertiary">
        ・
      </AppText>
      <PressableScale
        onPress={() => open('privacy')}
        accessibilityRole="link"
        style={styles.link}
        testID="premium-privacy-link"
      >
        <AppText variant="footnote" color="accent">
          プライバシーポリシー
        </AppText>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
  flex: { flex: 1, gap: 2 },
  feature: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  check: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkMark: { fontWeight: '700' },
  plan: { gap: spacing.xs, borderWidth: 2 },
  terms: { gap: spacing.sm, paddingHorizontal: spacing.xs },
  link: { minHeight: MIN_TAP, justifyContent: 'center', paddingHorizontal: spacing.xs },
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
});
