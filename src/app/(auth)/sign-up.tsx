import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';

import { AppText, Button, Checkbox, TextField } from '@/components/ui';
import { getDb } from '@/data/db/expoDb';
import { setMeta } from '@/data/repo/profile';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { authErrorMessage, validateEmail, validatePassword } from '@/features/auth/authErrors';
import { LegalLinks, PENDING_TERMS_KEY } from '@/features/auth/legal';
import { config } from '@/lib/config';
import { haptics } from '@/lib/haptics';
import { getSupabase } from '@/lib/supabase';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);

  const submit = async () => {
    setSubmitted(true);
    if (emailError || passwordError || !agreed) {
      haptics.warning();
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: e } = await getSupabase().auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: Linking.createURL('auth/callback') },
    });
    setLoading(false);
    if (e) {
      setError(authErrorMessage(e));
      haptics.warning();
      return;
    }
    // Remember the agreement; it is written to the profile when onboarding completes.
    await setMeta(
      await getDb(),
      PENDING_TERMS_KEY,
      JSON.stringify({
        termsVersion: config.termsVersion,
        privacyVersion: config.privacyVersion,
        acceptedAt: new Date().toISOString(),
      }),
    );
    if (!data.session)
      router.replace({ pathname: '/check-email', params: { email: email.trim() } });
  };

  return (
    <AuthScreen title="新規登録" subtitle="メールアドレスで登録します。" testID="sign-up-screen">
      <TextField
        label="メールアドレス"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        error={submitted ? emailError : null}
      />
      <TextField
        label="パスワード"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint="8文字以上・英字と数字を含む"
        error={submitted ? passwordError : null}
      />
      <Checkbox checked={agreed} onChange={setAgreed} testID="terms-checkbox">
        <AppText variant="subhead">利用規約とプライバシーポリシーに同意します</AppText>
      </Checkbox>
      <LegalLinks />
      {submitted && !agreed ? (
        <AppText variant="footnote" color="danger">
          登録には同意が必要です
        </AppText>
      ) : null}
      {error ? (
        <AppText variant="footnote" color="danger" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <Button label="登録する" onPress={submit} loading={loading} />
      <Button label="ログイン画面に戻る" variant="ghost" size="md" onPress={() => router.back()} />
    </AuthScreen>
  );
}
