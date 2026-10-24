# Phase 7：リリース前確認チェックリスト

最終更新: 2026-10-24（Phase 7）。あなたが行う作業の手順は docs/USER_ACTIONS.md。凡例: ✅ 確認済み（このリポジトリ内のテストで）/ ⏳ 未実施（外部設定・実機が必要）/ ⚠️ 要対応

## 1. Supabase 本番接続に必要な設定

| 項目                                                                                                                      | 状態                                         | 手順                   |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------- |
| 本番プロジェクト（東京）作成・DBパスワード保管                                                                            | ⏳                                           | SUPABASE_SETUP.md §1   |
| マイグレーション 4本の適用（`supabase db push --dry-run` → `db push`）                                                    | ⏳（ローカルPostgreSQLでは ✅）              | §2                     |
| Auth：メール確認ON、Redirect URLs、パスワード規則（`supabase/config.toml` → `config push`）、日本語テンプレート、独自SMTP | ⏳（設定ファイルは ✅ 作成済み）             | §3                     |
| Edge Functions 3本のデプロイ（webhook は `--no-verify-jwt`）                                                              | ⏳（Deno 型チェックは ✅）                   | §4                     |
| シークレット：`REVENUECAT_WEBHOOK_AUTH` / `REVENUECAT_SECRET_API_KEY`                                                     | ⏳                                           | §4、BILLING.md §5      |
| アプリ環境変数：Supabase URL / anon key、RevenueCat 公開キー（EAS環境変数）                                               | ⏳（検査コマンド `npm run env:check` は ✅） | §6、USER_ACTIONS.md §7 |
| バックアップ（PITR）・監視（ログ/アラート）                                                                               | ⏳                                           | DATABASE.md §7         |

## 2. 公式食品データ

| 項目                                                                                                              | 状態                                                                           |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 取り込みスクリプト（列検出・Tr/推定値/未測定・冪等SQL）                                                           | ✅ ダミーExcelでCLI〜DB適用まで                                                |
| 文部科学省サイトからの取得・利用条件の確認                                                                        | ⏳ このサンドボックスからは www.mext.go.jp に接続できない（2026-10-24 再確認） |
| 取り込み方法：GitHub Actions「Food data dry run」（MEXTからのみ取得・SHA-256記録・件数照合・使い捨てDBに2回適用） | ✅ 手順を架空データでローカル再現。GitHub上の実行は ⏳                         |
| 実データの取り込み・件数/値の抜き取り検証                                                                         | ⏳ FOOD_DATA.md §4・§5                                                         |

## 3. オフライン同期の整合性（✅ 自動テスト済み）

- 端末2台＋サーバー（フェイク）での LWW・削除優先・未送信行の保護・レスポンス喪失時の再送で重複しない（`src/data/__tests__/sync.test.ts`, `phase4.test.ts`）
- 同期中の書き込みを取りこぼさない、ネットワーク障害後のバックオフ再試行（`syncService.test.ts`）
- サーバー側：論理削除の復活禁止・上限・1日1目標（`supabase/local-tests/20_*`, `40_*`）
- ✅ 1年分（約5,400行）の端末内読み込み：1日の食事 3〜4ms、月のカレンダー 1ms、体重全件 2〜3ms、全件送信はフェイクサーバーに50リクエスト（約1.1秒）で再送しても重複なし（`performance.test.ts`、node:sqlite）
- ✅ アカウント切替：A（Premium）→ ログアウト → B はオフラインでも無料、Aの課金キャッシュ・通知設定は消去、ストアSDKは B に再紐付け（`accountSwitch.test.ts`）
- ⏳ 実Supabaseでの2台同時利用・長時間オフライン後の同期・実機（expo-sqlite）での速度

## 4. 通知の実機テスト項目（⏳ すべて未実施）

### 4.1 体重の記録リマインダー（サーバープッシュ）

自動テスト済み（✅）：判定（未記録なら対象・記録済みなら対象外・削除で再び対象）、同日1回、時刻変更、OFF、タイムゾーン変更、夏時間、送信枠3時間、再送（最大3回）、無効トークン、複数端末、アカウント切替、通信エラー、バッジの設定・解除、記録済みなら表示中の通知を非表示、通知タップで体重入力画面、権限拒否時の案内（`70_weigh_in_reminders.sql`、`src/__tests__/server/weighInReminders.test.ts`、`src/__tests__/weighInReminder.test.tsx`、`src/features/__tests__/weighInPush.test.ts`、`accountSwitch.test.ts`）。

実機で確認すること（⏳）：

- [ ] iOS / Android：アプリを**完全に終了**した状態で、設定時刻に未記録なら1回だけ届く
- [ ] 記録済みの日は届かない（記録 → 同期済みを確認してから時刻を待つ）
- [ ] iOS：アイコンに「1」。体重を記録するとアプリ内で 0 に戻る。通知センターの体重リマインダーも消える
- [ ] Android：ランチャーごとのバッジ表示（Pixel は点、Galaxy は数字など。非対応ランチャーでは何も出ない）
- [ ] 通知タップで体重入力画面（アプリ終了中・バックグラウンド・表示中のそれぞれ）
- [ ] アプリ表示中に届いた場合：オフラインで記録済みなら表示されない
- [ ] 機内モードで記録 → 設定時刻に通知が届く（**既知の制約**：同期前のため。アプリを閉じている場合は表示される）→ オンラインに戻すと次回から正しい
- [ ] 2台（同じアカウント）：両方に届く／片方で記録して同期後は両方とも届かない／片方で設定を変えるともう片方にも反映
- [ ] ログアウトした端末には届かない。別アカウントでログインすると、その人の設定で届く
- [ ] 通知を許可しない場合：ホームに「今日の体重がまだ記録されていません」、通知設定に警告と「端末の設定を開く」
- [ ] 時差のある地域へ移動 → アプリを開くとタイムゾーンが更新され、現地の設定時刻に届く
- [ ] iOS の集中モード・Android の省電力／Doze での遅延（サーバー側の「送信済み」と端末表示は別物として記録）

### 4.2 食事・振り返り（ローカル通知）

- [ ] 初めてONにした時だけ許可ダイアログ。拒否 → 「設定を開く」で設定アプリへ
- [ ] Android 13+：POST_NOTIFICATIONS の許可ダイアログ
- [ ] 指定時刻に毎日届く（4種類それぞれ）。時刻変更・OFFが即座に反映
- [ ] 端末再起動後も届く（Android は RECEIVE_BOOT_COMPLETED）
- [ ] 以前のバージョンの「朝の体重測定」ローカル通知が残らない（体重リマインダーとの二重通知なし）
- [ ] 通知タップで該当画面が開く（コールドスタート含む）
- [ ] ログアウトで通知が止まる
- [ ] Android の通知チャンネル「リマインダー」「体重の記録リマインダー」が表示される

## 5. アカウント削除

- ✅ アプリ：2段階確認、ストア解約の案内、削除後に端末データ消去（`app.test.tsx`）
- ✅ DB：auth.users 削除で全個人データと `subscriptions` が CASCADE 削除、`subscription_events` は匿名化（`10_*`, `50_billing.sql`）
- ✅ Edge Function：本人のJWTからのみユーザーを特定。秘密キー設定時は RevenueCat 顧客も削除（Deno 型チェックのみ・実行は ⏳）
- ⏳ 実環境：削除後に同じメールで再登録できる、Storage（未使用）に残骸がない

## 6. セキュリティと RLS

- ✅ 全テーブル RLS 有効・他ユーザー行の読み書き不可・anon は何も読めない（`10_*`）
- ✅ **Phase 7 で修正**：Supabase の既定権限で anon / authenticated が内部関数（`is_premium`・トリガー関数）や検索RPCを実行できる状態だった → `20261027000000_function_privileges.sql` で最小化。カタログ監査テスト（`60_security_audit.sql`）は修正前に失敗・修正後に合格することを確認
- ✅ アプリに service_role / secret キーが設定された場合は「未設定」として扱い起動しない（`configCheck.test.ts`）
- ✅ 課金状態はユーザーから書けない。書込関数は service_role のみ実行可（`50_billing.sql`）
- ✅ Webhook 認証（定数時間比較・fail closed）、冪等、順序保護、匿名IDの無視（`src/__tests__/server/`）
- ✅ アプリに埋め込むのは公開キーのみ。`sk_` キーは拒否（`billingConfig.test.ts`）。リポジトリに秘密情報なし（コミット前に grep で確認）
- ✅ Android の不要権限（SYSTEM_ALERT_WINDOW / ストレージ）をブロック（`app.json`）
- ⚠️ 依存関係の脆弱性（`npm audit --omit=dev`）：high 5件。すべて Expo CLI（ビルド時のツール）経由の `node-forge` ≤1.4.0 と `zod` <4.6.6 で、アプリ本体（端末で動くコード）には含まれない。修正版の node-forge は未公開、zod は Expo CLI の更新待ち。Expo SDK のパッチ更新時に再確認
- ⚠️ 公開前：Supabase の Security Advisor 実行、Auth のレート制限、`subscription-sync` 呼び出し頻度の監視（パスワード規則は config.toml に記載済み）
- ⏳ 第三者によるペネトレーションテスト（任意）

## 7. iOS / Android ビルド

- ✅ `expo export --platform ios --platform android`（Hermes バンドル生成）
- ✅ `expo prebuild`（一時ディレクトリで生成のみ。Bundle ID `jp.bodylog.app`、Android 権限を確認後に破棄。リポジトリには ios/android を置かない）
- ⏳ ネイティブコンパイル：このサンドボックスには Xcode / Android SDK がないため未実施。EAS Build（development / preview）で確認が必要
- ✅ `eas.json`（development / preview / production、バージョン番号はEAS側で自動採番）、`expo-dev-client` 導入、`expo config` 解決を確認
- ⏳ EAS プロジェクト作成（`eas init`）・環境変数登録・署名・実機インストール（USER_ACTIONS.md §7）
- ⏳ ストア提出（Phase 8・明示的な許可があるまで行わない）

## 7.1 エラー処理・アクセシビリティ

- ✅ 想定外のエラー時は技術的な詳細を出さない復旧画面（`errorBoundary.test.tsx`）
- ✅ 主要12画面で、すべてのボタン・入力・スイッチに読み上げ用の名前がある（`accessibility.test.tsx`。画面ごとに検査した部品数をログ出力）
- ⏳ 実機：VoiceOver / TalkBack での操作、文字サイズ最大時のレイアウト、ダークモードのコントラスト

## 8. テストの網羅性（2026-10-24・Phase 7）

- Jest 29スイート・207件（TZ=Asia/Tokyo）。domain/data/features/server/lib の158件は TZ=America/New_York でも合格
- カバレッジ（Jest全体）：文 84.1% / 分岐 73.0% / 関数 77.5% / 行 87.2%
- 低い箇所：`supabaseRemote.ts`・`lib/supabase.ts`（実Supabase接続部分。結合テストは実プロジェクトで）、マイページ（課金ストアの実画面遷移）
- DBテスト 6ファイル（RLS・同期ルール・食品取り込み・運動/設定・課金・セキュリティ監査）
- ⏳ E2E（Maestro 等）による実機での主要フロー自動化
