import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, ListGroup, ListRow, Screen } from '@/components/ui';
import { FREE_LIMITS } from '@/domain/entitlements';
import { spacing } from '@/theme';

/** Rows not wired yet show 「準備中」 and are disabled — never a fake success. */
const SOON = '準備中';

export default function MyPageScreen() {
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <Screen title="マイページ" grouped testID="mypage-screen">
      <Card style={styles.planCard}>
        <AppText variant="footnote" color="textSecondary">
          現在のプラン
        </AppText>
        <AppText variant="title2">無料プラン</AppText>
        <AppText variant="subhead" color="textSecondary">
          Premium（月額350円・税込）では、お気に入り・食事テンプレートが無制限（無料版はそれぞれ
          {FREE_LIMITS.favorites}件・{FREE_LIMITS.templates}
          件）、30日以上のグラフ、詳細分析、CSV出力をご利用いただけます。
        </AppText>
      </Card>

      <Group title="アカウント">
        <ListRow title="プロフィール編集" value={SOON} disabled />
        <ListRow title="目標設定" value={SOON} disabled />
        <ListRow title="通知設定" value={SOON} disabled />
        <ListRow title="単位・表示設定" value="kg / cm / kcal" />
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
        <ListRow title="利用規約" value={SOON} disabled />
        <ListRow title="プライバシーポリシー" value={SOON} disabled />
        <ListRow
          title="データ出典"
          subtitle="食品成分値：文部科学省「日本食品標準成分表」（取り込み予定）"
        />
        <ListRow title="アプリバージョン" value={version} />
      </Group>

      <Group>
        <ListRow title="ログアウト" value={SOON} disabled />
        <ListRow title="アカウント削除" destructive value={SOON} disabled />
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
