/** Maps Supabase Auth errors to Japanese messages. Raw messages are never shown. */
export function authErrorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string; status?: number } | null;
  const code = e?.code ?? '';
  const msg = (e?.message ?? '').toLowerCase();
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return 'メールアドレスまたはパスワードが正しくありません。';
  }
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return 'メールアドレスの確認が完了していません。届いたメールのリンクを開いてください。';
  }
  if (code === 'user_already_exists' || msg.includes('already registered')) {
    return 'このメールアドレスは既に登録されています。ログインしてください。';
  }
  if (code === 'weak_password' || msg.includes('password should')) {
    return 'パスワードが弱すぎます。8文字以上で、推測されにくいものにしてください。';
  }
  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    e?.status === 429
  ) {
    return '短時間に操作が集中しました。しばらく待ってからお試しください。';
  }
  if (code === 'same_password') return '以前と異なるパスワードを設定してください。';
  if (msg.includes('network') || msg.includes('fetch')) {
    return '通信できませんでした。接続を確認してください。';
  }
  return 'エラーが発生しました。時間をおいて再度お試しください。';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  return EMAIL_RE.test(email.trim()) ? null : 'メールアドレスの形式が正しくありません';
}

export const PASSWORD_MIN = 8;

export function validatePassword(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `${PASSWORD_MIN}文字以上で入力してください`;
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return '英字と数字を両方含めてください';
  return null;
}
