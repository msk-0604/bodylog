# Supabase セットアップ手順

最終更新: 2026-10-24。プロジェクト作成・設定はプロジェクトオーナーが行い、秘密情報はチャットやリポジトリに貼らないでください。

## 1. プロジェクト作成

1. https://supabase.com/dashboard で New project（リージョン：**Northeast Asia (Tokyo)** 推奨）。
2. データベースパスワードはパスワードマネージャに保存。
3. まずステージング用、公開前に本番用の2プロジェクトを推奨。

## 2. マイグレーション適用

Supabase CLI をインストールし、リポジトリで実行：

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push          # supabase/migrations/*.sql を適用
```

適用後、Table Editor で全テーブルの RLS が有効（盾アイコン）になっていることを確認。

## 3. 認証（Authentication）設定

- Providers > Email：有効、**Confirm email：ON**
- Password：最小8文字（アプリ側も8文字以上・英字と数字を要求）
- URL Configuration > Redirect URLs に追加：
  - `bodylog://auth/callback`
  - `bodylog://auth/callback?next=reset-password`
  - 開発ビルド用（Expo dev client 使用時）：`exp+bodylog://**` など、使用するスキームを追加
- Email Templates：日本語の文面に変更（確認メール・パスワード再設定）。リンク先は `{{ .ConfirmationURL }}` のまま（PKCEで `bodylog://auth/callback?code=...` にリダイレクトされます）。
- 本番では独自SMTP（送信元ドメイン）を設定（Supabase標準の送信は件数制限あり）。

## 4. Edge Function（アカウント削除）

```bash
npx supabase functions deploy delete-account
```

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` はEdge実行環境が自動提供します（手動で設定・共有しない）。

## 5. 食品マスタ

`docs/FOOD_DATA.md` の手順で取り込み。

## 6. アプリへの設定

Project Settings > API から以下を取得し、ローカルは `.env.local`、EAS ビルドは EAS の環境変数に設定：

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
```

**service_role キーはアプリに絶対に設定しない。**

未設定の開発ビルドは「ローカルモード」（アカウントなし・端末内のみ保存・同期なし）で動作します。リリースビルドは未設定だと起動時に「設定エラー」を表示します。

## 7. 動作確認チェックリスト（実プロジェクト接続後に実施・未実施）

- [ ] 新規登録 → 確認メール → リンクでアプリが開きログイン状態になる
- [ ] 別端末でメールのリンクを開いた場合、「確認済み・ログインしてください」と表示される
- [ ] パスワード再設定メール → 新パスワード設定 → ログイン
- [ ] 食事・体重を記録 → Table Editor に行が作成される（自分の行のみ見えること）
- [ ] 2台目の端末でログインすると記録が同期される
- [ ] 機内モードで記録 → 復帰後に同期される
- [ ] アカウント削除 → auth.users と全記録が削除される
