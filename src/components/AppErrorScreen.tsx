import { View } from 'react-native';

import { useTheme } from '@/theme';

import { EmptyState } from './ui';

/** Calm recovery screen for uncaught render errors (never shows technical details). */
export function AppErrorScreen({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
      <EmptyState
        title="問題が発生しました"
        message="記録データは端末に保存されています。もう一度お試しください。"
        actionLabel="再試行"
        onAction={onRetry}
      />
    </View>
  );
}
