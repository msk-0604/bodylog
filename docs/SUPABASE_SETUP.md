# Supabase セットアップ手順

最終更新: 2026-10-24。プロジェクト作成・設定はプロジェクトオーナーが行い、秘密情報はチャットやリポジトリに貼らないでください。

## 1. プロジェクト作成

1. https://supabase.com/dashboard で New project（リージョン：**Northeast Asia (Tokyo)** 推奨）。
2. データベースパスワードはパスワードマネージャに保存。
3. まずステージング用、公開前に本番用の2プロジェクトを推奨。

## 2. マイグレーション適用

リポジトリで実行（Supabase CLI は `npx supabase@2.119.0` で固定。手順のバージョンと揃えるため）：

```bash
npx supabase@2.119.0 login
npx supabase@2.119.0 link --project-ref <project-ref>
npx supabase@2.119.0 db push --dry-run   # 適用されるマイグレーションの一覧だけを表示（変更しない）
npx supabase@2.119.0 db push             # supabase/migrations/*.sql（4本）を適用
```

| マイグレーション                         | 内容                                              |
| ---------------------------------------- | ------------------------------------------------- |
| `20261024000000_initial_schema.sql`      | テーブル・RLS・無料枠トリガー・食品検索           |
| `20261025000000_sync_rules.sql`          | 論理削除の復活禁止、upsert時の無料枠判定          |
| `20261026000000_billing.sql`             | 課金状態の書き込み関数（service_role のみ）       |
| `20261027000000_function_privileges.sql` | 関数の実行権限を最小化（anon は何も実行できない） |

適用後の確認：

- Table Editor で全テーブルの RLS が有効（盾アイコン）
- Advisors > Security Advisor でエラーがない（警告は内容を確認して TASKS.md に記録）
- 同じ内容をローカルでは `scripts/db-test.sh` が検証（`60_security_audit.sql`：RLS・search_path・anon/authenticated の実行権限）

**本番プロジェクトへの `db push` はプロジェクトオーナーの承認後に実施**（ステージングで先に確認）。

## 3. 認証（Authentication）設定

`supabase/config.toml` に BODYLOG の認証設定（メール確認ON、パスワード8文字以上・英字と数字、リダイレクトURL、Edge Functions の JWT 検証設定）を記録しています。リンク済みのプロジェクトには次で反映できます（実行前に差分が表示されるので確認してから承認）：

```bash
npx supabase@2.119.0 config push
```

ダッシュボードで設定する場合は以下と同じ値にします。

- Providers > Email：有効、**Confirm email：ON**
- Password：最小8文字（アプリ側も8文字以上・英字と数字を要求）
- URL Configuration > Redirect URLs に追加：
  - `bodylog://auth/callback`
  - `bodylog://auth/callback?next=reset-password`
  - 開発ビルド用（Expo dev client 使用時）：`exp+bodylog://**` など、使用するスキームを追加
- Email Templates：日本語の文面に変更（確認メール・パスワード再設定）。リンク先は `{{ .ConfirmationURL }}` のまま（PKCEで `bodylog://auth/callback?code=...` にリダイレクトされます）。
- 本番では独自SMTP（送信元ドメイン）を設定（Supabase標準の送信は件数制限あり）。

## 4. Edge Functions

```bash
npx supabase functions deploy delete-account
npx supabase functions deploy subscription-sync
# RevenueCat は Supabase の JWT を送れないため、JWT検証を外し、関数内で Authorization ヘッダーを検証する
npx supabase functions deploy revenuecat-webhook --no-verify-jwt
```

| 関数                 | 役割                                                                | 呼び出し元                           |
| -------------------- | ------------------------------------------------------------------- | ------------------------------------ |
| `delete-account`     | 本人のアカウント削除（＋RevenueCat顧客の削除：秘密キー設定時）      | アプリ（ユーザーJWT）                |
| `subscription-sync`  | 呼び出し元ユーザーの購入状態を RevenueCat REST API で再確認して保存 | アプリ（購入・復元後、起動・復帰時） |
| `revenuecat-webhook` | RevenueCat Webhook を受け、`subscriptions` を更新（冪等・順序保護） | RevenueCat                           |

シークレット（**リポジトリ・アプリには置かない**。CLIで登録）：

```bash
npx supabase secrets set REVENUECAT_WEBHOOK_AUTH='<32文字以上のランダム文字列>'
npx supabase secrets set REVENUECAT_SECRET_API_KEY='<RevenueCat の Secret API key (v1)>'
```

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` はEdge実行環境が自動提供します（手動で設定・共有しない）。課金の設定全体は docs/BILLING.md。

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
- [ ] アカウント削除 → auth.users と全記録が削除される（`subscriptions` も削除、`subscription_events` は user_id が NULL になる）
- [ ] Webhook：RevenueCat ダッシュボードの「Send test event」で 200 が返る。誤った Authorization では 401
- [ ] Sandbox購入 → 数秒以内に `subscriptions` に行ができ、アプリが Premium になる（docs/BILLING.md §6）
