import { Redirect, router } from 'expo-router';
import { View } from 'react-native';

import { EmptyState } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { useTheme } from '@/theme';

/**
 * Also the fallback when a protected route is opened in the wrong auth state
 * (e.g. "/" while signed out): send the user to the screen for their state.
 */
export default function NotFoundScreen() {
  const { colors } = useTheme();
  const status = useSession((s) => s.status);
  const onboarded = useSession((s) => s.onboarded);
  const recovery = useSession((s) => s.passwordRecovery);

  if (status === 'signedOut') return <Redirect href="/sign-in" />;
  if (status === 'ready' && recovery) return <Redirect href="/reset-password" />;
  if (status === 'ready' && !onboarded) return <Redirect href="/onboarding" />;

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
