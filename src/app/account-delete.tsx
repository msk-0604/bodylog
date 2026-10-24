import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Checkbox, ModalScreen } from '@/components/ui';
import { clearAfterAccountDeletion } from '@/features/auth/session';
import { isLocalMode } from '@/lib/config';
import { haptics } from '@/lib/haptics';
import { getSupabase } from '@/lib/supabase';
import { spacing } from '@/theme';

export default function AccountDeleteScreen() {
  const [understood, setUnderstood] = useState(false);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setDeleting(true);
    setError(null);
    try {
      if (!isLocalMode()) {
        const { error: e } = await getSupabase().functions.invoke('delete-account', {
          method: 'POST',
        });
        if (e) throw e;
      }
      await clearAfterAccountDeletion();
      haptics.success();
    } catch {
      setError('削除できませんでした。通信環境を確認して、もう一度お試しください。');
      setDeleting(false);
    }
  };

  const confirm = () => {
    haptics.warning();
    Alert.alert('アカウントを削除しますか？', 'すべての記録が完全に削除され、元に戻せません。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除する', style: 'destructive', onPress: () => void run() },
    ]);
  };

  return (
    <ModalScreen title="アカウント削除" testID="account-delete-screen">
      <Card style={styles.gap}>
        <AppText variant="headline">削除されるもの</AppText>
        <AppText variant="subhead" color="textSecondary">
          アカウント、プロフィール、目標、体重・食事・運動の記録、お気に入り、食事テンプレート、マイ食品。サーバーとこの端末の両方から削除され、復元できません。
        </AppText>
      </Card>
      <Card style={styles.gap}>
        <AppText variant="headline">Premiumをご利用中の方へ</AppText>
        <AppText variant="subhead" color="textSecondary">
          アカウントを削除しても、App Store / Google Play
          のサブスクリプションは自動では解約されません。先に各ストアの「サブスクリプション」から解約してください。
        </AppText>
      </Card>
      <View style={styles.gap}>
        <Checkbox checked={subscriptionChecked} onChange={setSubscriptionChecked}>
          <AppText variant="subhead">サブスクリプションの状況を確認しました</AppText>
        </Checkbox>
        <Checkbox checked={understood} onChange={setUnderstood}>
          <AppText variant="subhead">
            すべてのデータが削除され、元に戻せないことを理解しました
          </AppText>
        </Checkbox>
      </View>
      {error ? (
        <AppText variant="footnote" color="danger" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <Button
        label="アカウントを削除"
        variant="destructive"
        disabled={!understood || !subscriptionChecked}
        loading={deleting}
        onPress={confirm}
      />
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
});
