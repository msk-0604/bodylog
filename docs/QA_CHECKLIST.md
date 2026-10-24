# Phase 7 準備：リリース前確認チェックリスト

最終更新: 2026-10-24。凡例: ✅ 確認済み（このリポジトリ内のテストで）/ ⏳ 未実施（外部設定・実機が必要）/ ⚠️ 要対応

## 1. Supabase 本番接続に必要な設定

| 項目                                                                        | 状態                            | 手順                 |
| --------------------------------------------------------------------------- | ------------------------------- | -------------------- |
| 本番プロジェクト（東京）作成・DBパスワード保管                              | ⏳                              | SUPABASE_SETUP.md §1 |
| マイグレーション 3本の適用（`supabase db push`）                            | ⏳（ローカルPostgreSQLでは ✅） | §2                   |
| Auth：メール確認ON、Redirect URLs、日本語テンプレート、独自SMTP             | ⏳                              | §3                   |
| Edge Functions 3本のデプロイ（webhook は `--no-verify-jwt`）                | ⏳（Deno 型チェックは ✅）      | §4                   |
| シークレット：`REVENUECAT_WEBHOOK_AUTH` / `REVENUECAT_SECRET_API_KEY`       | ⏳                              | §4、BILLING.md §5    |
| アプリ環境変数：Supabase URL / anon key、RevenueCat 公開キー（EAS環境変数） | ⏳                              | §6                   |
| バックアップ（PITR）・監視（ログ/アラート）                                 | ⏳                              | DATABASE.md §7       |

## 2. 公式食品データ

| 項目                                                    | 状態                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 取り込みスクリプト（列検出・Tr/推定値/未測定・冪等SQL） | ✅ ダミーExcelでCLI〜DB適用まで                                                |
| 文部科学省サイトからの取得・利用条件の確認              | ⏳ このサンドボックスからは www.mext.go.jp に接続できない（2026-10-24 再確認） |
| 実データの取り込み・件数/値の抜き取り検証               | ⏳ FOOD_DATA.md §4・§5                                                         |

## 3. オフライン同期の整合性（✅ 自動テスト済み）

- 端末2台＋サーバー（フェイク）での LWW・削除優先・未送信行の保護・レスポンス喪失時の再送で重複しない（`src/data/__tests__/sync.test.ts`, `phase4.test.ts`）
- 同期中の書き込みを取りこぼさない、ネットワーク障害後のバックオフ再試行（`syncService.test.ts`）
- サーバー側：論理削除の復活禁止・上限・1日1目標（`supabase/local-tests/20_*`, `40_*`）
- ⏳ 実Supabaseでの2台同時利用・長時間オフライン後の同期・大量データ（1年分）の初回同期時間

## 4. 通知の実機テスト項目（⏳ すべて未実施）

- [ ] iOS：初めてONにした時だけ許可ダイアログ。拒否 → 「設定を開く」で設定アプリへ
- [ ] Android 13+：POST_NOTIFICATIONS の許可ダイアログ。Android 12 以下は許可不要
- [ ] 指定時刻に毎日届く（5種類それぞれ）。時刻変更・OFFが即座に反映
- [ ] アプリを終了・端末再起動後も届く（Android は RECEIVE_BOOT_COMPLETED）
- [ ] フォアグラウンド中もバナー表示、音なし
- [ ] 通知タップで該当画面（体重入力・食事・ホーム）が開く（コールドスタート含む）
- [ ] 設定アプリで通知をOFF → アプリ復帰時に再予約しても届かない（エラーにならない）
- [ ] ログアウトで通知が止まる。別アカウントでログインしても前の設定が残らない
- [ ] タイムゾーン変更後も「毎日7:00（現地時刻）」で届く
- [ ] Android の通知チャンネル名「リマインダー」が表示される

## 5. アカウント削除

- ✅ アプリ：2段階確認、ストア解約の案内、削除後に端末データ消去（`app.test.tsx`）
- ✅ DB：auth.users 削除で全個人データと `subscriptions` が CASCADE 削除、`subscription_events` は匿名化（`10_*`, `50_billing.sql`）
- ✅ Edge Function：本人のJWTからのみユーザーを特定。秘密キー設定時は RevenueCat 顧客も削除（Deno 型チェックのみ・実行は ⏳）
- ⏳ 実環境：削除後に同じメールで再登録できる、Storage（未使用）に残骸がない

## 6. セキュリティと RLS

- ✅ 全テーブル RLS 有効・他ユーザー行の読み書き不可・anon は何も読めない（`10_*`）
- ✅ 課金状態はユーザーから書けない。書込関数は service_role のみ実行可（`50_billing.sql`）
- ✅ Webhook 認証（定数時間比較・fail closed）、冪等、順序保護、匿名IDの無視（`src/__tests__/server/`）
- ✅ アプリに埋め込むのは公開キーのみ。`sk_` キーは拒否（`billingConfig.test.ts`）。リポジトリに秘密情報なし（コミット前に grep で確認）
- ✅ Android の不要権限（SYSTEM_ALERT_WINDOW / ストレージ）をブロック（`app.json`）
- ⚠️ 公開前：Supabase の Security Advisor 実行、Auth のレート制限、パスワード強度設定、`subscription-sync` 呼び出し頻度の監視
- ⏳ 第三者によるペネトレーションテスト（任意）

## 7. iOS / Android ビルド

- ✅ `expo export --platform ios --platform android`（Hermes バンドル生成）
- ✅ `expo prebuild`（一時ディレクトリで生成のみ。Bundle ID `jp.bodylog.app`、Android 権限を確認後に破棄。リポジトリには ios/android を置かない）
- ⏳ ネイティブコンパイル：このサンドボックスには Xcode / Android SDK がないため未実施。EAS Build（development / preview）で確認が必要
- ⏳ EAS 設定（`eas.json`）・署名・ストア提出（Phase 8）

## 8. テストの網羅性（2026-10-24）

- Jest 24スイート・197件（TZ=Asia/Tokyo）。domain/data/features/server の148件は TZ=America/New_York でも合格
- カバレッジ（Jest全体）：文 83.8% / 分岐 72.6% / 関数 77.1% / 行 86.7%
- 低い箇所：`supabaseRemote.ts`・`lib/supabase.ts`（実Supabase接続部分。結合テストは実プロジェクトで）、マイページ（課金ストアの実画面遷移）
- DBテスト 5ファイル（RLS・同期ルール・食品取り込み・運動/設定・課金）
- ⏳ E2E（Maestro 等）による実機での主要フロー自動化
