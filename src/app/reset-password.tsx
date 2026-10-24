import { router } from 'expo-router';
import { useState } from 'react';

import { AppText, Button, TextField } from '@/components/ui';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { authErrorMessage, validatePassword } from '@/features/auth/authErrors';
import { useSession } from '@/features/auth/session';
import { haptics } from '@/lib/haptics';
import { getSupabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pwError = validatePassword(password);
  const mismatch = password !== confirm ? 'パスワードが一致しません' : null;

  const submit = async () => {
    setSubmitted(true);
    if (pwError || mismatch) return;
    setLoading(true);
    const { error: e } = await getSupabase().auth.updateUser({ password });
    setLoading(false);
    if (e) {
      setError(authErrorMessage(e));
      return;
    }
    haptics.success();
    useSession.setState({ passwordRecovery: false });
    router.replace('/');
  };

  return (
    <AuthScreen title="新しいパスワード" subtitle="新しいパスワードを設定してください。">
      <TextField
        label="新しいパスワード"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint="8文字以上・英字と数字を含む"
        error={submitted ? pwError : null}
      />
      <TextField
        label="新しいパスワード（確認）"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        error={submitted ? mismatch : null}
      />
      {error ? (
        <AppText variant="footnote" color="danger" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <Button label="変更する" onPress={submit} loading={loading} />
    </AuthScreen>
  );
}
