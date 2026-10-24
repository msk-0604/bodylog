import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, TextField } from '@/components/ui';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { authErrorMessage, validateEmail } from '@/features/auth/authErrors';
import { haptics } from '@/lib/haptics';
import { getSupabase } from '@/lib/supabase';
import { spacing } from '@/theme';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const emailError = validateEmail(email);
    if (emailError || !password) {
      setError(emailError ?? 'パスワードを入力してください');
      haptics.warning();
      return;
    }
    setLoading(true);
    setError(null);
    const { error: e } = await getSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (e) {
      setError(authErrorMessage(e));
      haptics.warning();
    }
    // On success the session listener moves the app forward.
  };

  return (
    <AuthScreen
      title="ログイン"
      subtitle="毎日の食事と体重を、かんたんに記録。"
      testID="sign-in-screen"
    >
      <TextField
        label="メールアドレス"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        testID="email-input"
      />
      <TextField
        label="パスワード"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        testID="password-input"
      />
      {error ? (
        <AppText variant="footnote" color="danger" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <Button label="ログイン" onPress={submit} loading={loading} testID="sign-in-button" />
      <Button
        label="パスワードをお忘れの方"
        variant="ghost"
        size="md"
        onPress={() => router.push('/forgot-password')}
      />
      <View style={styles.footer}>
        <AppText variant="subhead" color="textSecondary">
          はじめての方は
        </AppText>
        <Link href="/sign-up" style={styles.link}>
          <AppText variant="subhead" color="accent">
            新規登録
          </AppText>
        </Link>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs },
  link: { padding: spacing.sm },
});
