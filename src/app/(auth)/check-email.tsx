import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AppText, Button } from '@/components/ui';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { authErrorMessage } from '@/features/auth/authErrors';
import { getSupabase } from '@/lib/supabase';

export default function CheckEmailScreen() {
  const { email, purpose } = useLocalSearchParams<{ email?: string; purpose?: string }>();
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isReset = purpose === 'reset';

  const resend = async () => {
    if (!email || isReset) return;
    setLoading(true);
    const { error } = await getSupabase().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: Linking.createURL('auth/callback') },
    });
    setLoading(false);
    setMessage(error ? authErrorMessage(error) : '確認メールを再送しました。');
  };

  return (
    <AuthScreen
      title="メールを確認してください"
      subtitle={
        isReset
          ? `${email ?? '入力したアドレス'} にパスワード再設定用のリンクを送信しました（登録がある場合）。メールのリンクをこの端末で開いてください。`
          : `${email ?? '入力したアドレス'} に確認メールを送信しました。メールのリンクを開くと登録が完了します。`
      }
    >
      <AppText variant="footnote" color="textSecondary">
        メールが届かない場合は、迷惑メールフォルダもご確認ください。
      </AppText>
      {message ? <AppText variant="footnote">{message}</AppText> : null}
      {!isReset ? (
        <Button label="確認メールを再送" variant="secondary" onPress={resend} loading={loading} />
      ) : null}
      <Button label="ログイン画面へ" variant="ghost" onPress={() => router.replace('/sign-in')} />
    </AuthScreen>
  );
}
