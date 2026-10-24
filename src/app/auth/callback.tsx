import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, EmptyState, LoadingView } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { isLocalMode } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

/**
 * Deep link target for email confirmation and password reset (bodylog://auth/callback).
 * Supabase (PKCE flow) appends `code`; we exchange it for a session on this device.
 */
export default function AuthCallbackScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    code?: string;
    next?: string;
    error_description?: string;
  }>();
  const [state, setState] = useState<'working' | 'confirmedElsewhere' | 'failed'>('working');
  const started = useRef(false);

  useEffect(() => {
    if (started.current || isLocalMode()) return;
    started.current = true;
    (async () => {
      if (!params.code) {
        setState(params.error_description ? 'failed' : 'confirmedElsewhere');
        return;
      }
      const { error } = await getSupabase().auth.exchangeCodeForSession(params.code);
      if (error) {
        // Typical cause: the link was opened on a different device/browser than the one that
        // requested it. The email address is still confirmed, so the user can just sign in.
        setState('confirmedElsewhere');
        return;
      }
      if (params.next === 'reset-password') useSession.setState({ passwordRecovery: true });
      router.replace(params.next === 'reset-password' ? '/reset-password' : '/');
    })();
  }, [params.code, params.next, params.error_description]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
      {state === 'working' ? (
        <LoadingView label="確認しています" />
      ) : (
        <>
          <EmptyState
            title={
              state === 'failed' ? 'リンクが無効か期限切れです' : 'メールアドレスを確認しました'
            }
            message={
              state === 'failed'
                ? 'お手数ですが、もう一度操作をやり直してください。'
                : 'この端末でログインしてご利用ください。'
            }
          />
          <Button
            label="ログイン画面へ"
            variant="ghost"
            onPress={() => router.replace('/sign-in')}
          />
        </>
      )}
    </View>
  );
}
