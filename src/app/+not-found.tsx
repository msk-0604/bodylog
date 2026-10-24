import { router } from 'expo-router';
import { View } from 'react-native';

import { EmptyState } from '@/components/ui';
import { useTheme } from '@/theme';

export default function NotFoundScreen() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
      <EmptyState
        title="ページが見つかりません"
        message="リンクが古いか、移動した可能性があります。"
        actionLabel="ホームへ戻る"
        onAction={() => router.replace('/')}
      />
    </View>
  );
}
