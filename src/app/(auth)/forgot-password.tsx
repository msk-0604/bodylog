import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';

import { AppText, Button, TextField } from '@/components/ui';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { authErrorMessage, validateEmail } from '@/features/auth/authErrors';
import { getSupabase } from '@/lib/supabase';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const v = validateEmail(email);
    if (v) {
      setError(v);
      return;
    }
    setLoading(true);
    const { error: e } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: Linking.createURL('auth/callback', { queryParams: { next: 'reset-password' } }),
    });
    setLoading(false);
    if (e) {
      setError(authErrorMessage(e));
      return;
    }
    // Same message whether or not the address is registered (no account enumeration).
    router.replace({ pathname: '/check-email', params: { email: email.trim(), purpose: 'reset' } });
  };

  return (
    <AuthScreen
      title="パスワードの再設定"
      subtitle="登録したメールアドレスに再設定用のリンクを送信します。"
    >
      <TextField
        label="メールアドレス"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      {error ? (
        <AppText variant="footnote" color="danger" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <Button label="送信する" onPress={submit} loading={loading} />
      <Button label="戻る" variant="ghost" size="md" onPress={() => router.back()} />
    </AuthScreen>
  );
}
