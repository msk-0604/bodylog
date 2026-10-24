import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText, Card, ListGroup, ListRow, Screen } from '@/components/ui';
import { writeLocal } from '@/data/hooks';
import { savePreferences } from '@/data/repo/settings';
import { syncNow, useSyncStatus } from '@/data/sync/syncService';
import { formatTimeJa } from '@/domain/date';
import { FREE_LIMITS } from '@/domain/entitlements';
import { pendingChanges, signOut, useSession } from '@/features/auth/session';
import { usePreferences, useReminders } from '@/features/exercise/hooks';
import { usePlan } from '@/features/premium/usePlan';
import { useGoal, useProfile } from '@/features/profile/hooks';
import { isLocalMode } from '@/lib/config';
import { formatKcal } from '@/domain/nutrition';
import { useToday } from '@/lib/useToday';
import { spacing } from '@/theme';

/** Rows not wired yet show 「準備中」 and are disabled — never a fake success. */
const SOON = '準備中';

function syncLabel(s: ReturnType<typeof useSyncStatus.getState>): string {
  if (s.phase === 'disabled') return 'この端末のみ';
  if (s.phase === 'syncing') return '同期中…';
  if (s.errors > 0) return `${s.errors}件 保存できませんでした`;
  if (s.pending > 0) return `未同期 ${s.pending}件`;
  if (s.phase === 'offline') return 'オフライン';
  if (s.lastSyncedAt) return `同期済み ${formatTimeJa(new Date(s.lastSyncedAt))}`;
  return '同期済み';
}

export default function MyPageScreen() {
  const version = Constants.expoConfig?.version ?? '—';
  const email = useSession((s) => s.email);
  const plan = usePlan();
  const sync = useSyncStatus();
  const profile = useProfile().data;
  const goal = useGoal(useToday()).data;
  const local = isLocalMode();
  const weekStartsOn = usePreferences().data?.weekStartsOn ?? 1;
  const reminderCount = (useReminders().data ?? []).filter((r) => r.enabled).length;

  const chooseWeekStart = () => {
    const set = (v: 0 | 1) =>
      void writeLocal((db, uid) => savePreferences(db, uid, { weekStartsOn: v }));
    Alert.alert('週の始まり', 'カレンダーと週の集計に使います。', [
      { text: '月曜日', onPress: () => set(1) },
      { text: '日曜日', onPress: () => set(0) },
      { text: 'キャンセル', style: 'cancel' },
    ]);
  };

  const logout = async () => {
    const pending = await pendingChanges();
    Alert.alert(
      'ログアウトしますか？',
      pending > 0
        ? `まだ同期されていない記録が${pending}件あります。ログアウトするとこの端末から削除され、復元できません。先に通信できる環境で同期することをおすすめします。`
        : 'この端末の記録データは削除されます（サーバーには保存されています）。',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: 'ログアウト', style: 'destructive', onPress: () => void signOut() },
      ],
    );
  };

  const syncDetails = () => {
    if (sync.phase === 'disabled') {
      Alert.alert(
        'この端末のみに保存',
        '開発用のローカルモードです。記録はこの端末にのみ保存されます。',
      );
      return;
    }
    if (sync.errors > 0) {
      Alert.alert(
        '保存できなかった記録',
        'サーバーに保存できなかった記録があります（無料プランの上限を超えたお気に入り・テンプレートなど）。該当の記録を編集または削除してください。',
      );
      return;
    }
    syncNow().catch(() =>
      Alert.alert(
        '同期できませんでした',
        '通信環境を確認してください。記録はこの端末に保存されています。',
      ),
    );
  };

  return (
    <Screen title="マイページ" grouped testID="mypage-screen">
      <Card style={styles.planCard}>
        <AppText variant="footnote" color="textSecondary">
          {local ? 'ローカルモード（開発用・アカウントなし）' : (email ?? '')}
        </AppText>
        <AppText variant="title2">{plan === 'premium' ? 'Premium' : '無料プラン'}</AppText>
        {plan === 'free' ? (
          <AppText variant="subhead" color="textSecondary">
            Premium（月額350円・税込）では、お気に入り・食事テンプレートが無制限（無料版はそれぞれ
            {FREE_LIMITS.favorites}件・{FREE_LIMITS.templates}
            件）、30日以上のグラフ、詳細分析、CSV出力をご利用いただけます。
          </AppText>
        ) : null}
      </Card>

      <Group title="アカウント">
        <ListRow
          title="プロフィール"
          value={profile?.nickname ?? undefined}
          onPress={() => router.push('/profile')}
          testID="row-profile"
        />
        <ListRow
          title="目標設定"
          value={goal ? `${formatKcal(goal.calorieKcal)} kcal` : undefined}
          onPress={() => router.push('/goals')}
          testID="row-goals"
        />
        <ListRow
          title="通知設定"
          value={reminderCount > 0 ? `${reminderCount}件オン` : 'オフ'}
          onPress={() => router.push('/notifications')}
          testID="row-notifications"
        />
        <ListRow
          title="週の始まり"
          value={weekStartsOn === 0 ? '日曜日' : '月曜日'}
          onPress={chooseWeekStart}
          testID="row-week-start"
        />
        <ListRow title="単位" value="kg / cm / kcal" />
        <ListRow
          title="データ同期"
          value={syncLabel(sync)}
          onPress={syncDetails}
          testID="row-sync"
        />
      </Group>

      <Group title="Premium">
        <ListRow title="Premiumに登録" value={SOON} disabled />
        <ListRow title="購入を復元" value={SOON} disabled />
        <ListRow title="サブスクリプションの管理" value={SOON} disabled />
        <ListRow title="データのエクスポート（CSV）" value={SOON} disabled />
      </Group>

      <Group title="サポート">
        <ListRow title="よくある質問" value={SOON} disabled />
        <ListRow title="お問い合わせ" value={SOON} disabled />
        <ListRow
          title="利用規約"
          onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}
        />
        <ListRow
          title="プライバシーポリシー"
          onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}
        />
        <ListRow
          title="データ出典"
          subtitle="文部科学省「日本食品標準成分表」"
          onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'data-source' } })}
        />
        <ListRow title="アプリバージョン" value={version} />
      </Group>

      <Group>
        {!local ? (
          <ListRow title="ログアウト" onPress={() => void logout()} testID="row-logout" />
        ) : null}
        <ListRow
          title={local ? 'データをすべて削除' : 'アカウント削除'}
          destructive
          onPress={() => router.push('/account-delete')}
          testID="row-delete-account"
        />
      </Group>
    </Screen>
  );
}

function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      {title ? (
        <AppText variant="footnote" color="textSecondary" style={styles.groupTitle}>
          {title}
        </AppText>
      ) : null}
      <ListGroup>{children}</ListGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  planCard: { gap: spacing.xs },
  group: { marginTop: spacing.xxl },
  groupTitle: { marginLeft: spacing.lg, marginBottom: spacing.sm },
});
