# BODYLOG タスク一覧

最終更新: 2026-10-24（Phase 7・体重リマインダー）
凡例: [x] 完了 / [~] 一部完了 / [ ] 未着手 / 🔐 ユーザーの承認・操作が必要

## 次に再開するとき

1. `npm ci && npm run check`（typecheck / lint / test）が通ることを確認
2. 本ファイルの「次の作業」から着手
3. 仕様は docs/MVP_SPEC.md、構成は docs/ARCHITECTURE.md、DBは docs/DATABASE.md、食品データは docs/FOOD_DATA.md、Supabase は docs/SUPABASE_SETUP.md、課金は docs/BILLING.md、リリース前確認は docs/QA_CHECKLIST.md、**あなたが行う作業は docs/USER_ACTIONS.md**

## 次の作業（優先順）

1. 🔐 docs/USER_ACTIONS.md §1〜§2：GitHub 設定、Supabase ステージング作成 → `db push` → `config push` → Edge Functions
2. 🔐 USER_ACTIONS.md §3：GitHub Actions「Food data dry run」で成分表を検証 → ステージングに適用
3. 🔐 USER_ACTIONS.md §4〜§6：App Store Connect / Google Play / RevenueCat の設定
4. 🔐 USER_ACTIONS.md §7〜§8：EAS で development / preview ビルド → 実機テスト（QA_CHECKLIST §4、BILLING §6）→ 結果を共有
5. 🔐 USER_ACTIONS.md §7-2：体重リマインダーのプッシュ通知（APNs・FCM・pg_cron）→ 実機で QA_CHECKLIST §4.1
6. 実機テストの結果を受けた修正、CSVエクスポート・詳細栄養分析（Premium）、Phase 8（ストア資料・アイコン）

## ユーザー判断待ち 🔐

- [ ] GitHubリポジトリの **Private 化**（方針決定済み。Settings > General > Danger Zone > Change visibility。操作はオーナーが実施）
- [ ] GitHubのデフォルトブランチを `main` に変更（現在は作業ブランチ。Settings > General > Default branch）、`main` のブランチ保護（PR必須・CI必須）
- [ ] bundleIdentifier / applicationId（暫定 `jp.bodylog.app`）：ストア登録前に App Store Connect / Play Console で利用可否を確認して確定
- [ ] Supabase プロジェクト作成（東京リージョン）とプラン
- [ ] 食品成分表の利用条件・出典表記の確認（docs/FOOD_DATA.md §2）
- [ ] 目標カロリー推定式・活動係数・調整幅の確認（docs/MVP_SPEC.md §8、栄養の専門家レビュー推奨）
- [ ] 利用規約・プライバシーポリシー本文（現在アプリ内は「作成中」表示）
- [ ] Apple Developer Program / Google Play Console / RevenueCat アカウント、有料アプリ契約・税務・口座
- [ ] 商品ID（例 `jp.bodylog.premium.monthly`）・価格（350円）・初回無料期間の有無
- [ ] RevenueCat の Restore Behavior（推奨：Keep with original App User ID。docs/BILLING.md §3）
- [ ] お問い合わせ窓口

## Phase 0 — 設計・環境確認 ✅

- [x] リポジトリ確認・クローン、Expo SDK 58 / RN 0.88 / React 19.3 / TS 6.0 の互換性確認
- [x] 設計書（MVP_SPEC / ARCHITECTURE / DATABASE / DESIGN_SYSTEM / TASKS / README）、.env.example

## Phase 1 — モバイル基盤 ✅

- [x] Expo Router、デザイントークン、ライト/ダーク、共通コンポーネント、エラー/空/読み込み状態
- [x] ホーム・食事・記録・マイページ
- [x] ESLint / Prettier / Jest / GitHub Actions CI（`main` で成功を確認）

## Phase 2 — 認証・DB

- [x] Supabase クライアント（PKCE、セッションは SecureStore に分割保存、フォアグラウンド時のみトークン更新）
- [x] メール新規登録（規約同意必須）・確認メール再送・ログイン・ログアウト
- [x] メール認証・パスワード再設定のディープリンク処理（`bodylog://auth/callback`）、新パスワード設定画面
- [x] 認証状態による画面ゲート（Stack.Protected）＋保護ルート直アクセス時のリダイレクト
- [x] 新端末ログイン時の初回同期（失敗時は再試行画面）、アカウント切替時の端末データ消去
- [x] オンボーディング（身長・体重・目標体重・体脂肪率・生年月日・性別・活動量 → 推定目標kcal・PFC・規約同意）
- [x] プロフィール編集・目標設定（履歴保持・注意喚起）
- [x] 体重の永続保存（SQLite）・編集・削除・同期
- [x] アカウント削除画面 + Edge Function `delete-account`（ストア解約の案内、2段階確認）
- [x] マイグレーション2（論理削除の復活禁止、upsert時の無料枠判定修正）
- [x] RLS検証（ローカルPostgreSQL + Supabaseスタブ、CIで実行）
- [x] ローカルモード（Supabase未設定の開発ビルド）、リリースビルドは未設定なら起動しない
- [ ] 🔐 実Supabaseでの動作確認（SUPABASE_SETUP.md §7）
- [ ] 🔐 Edge Function のデプロイ（Deno環境での実行は未検証）
- [ ] 通知設定（Phase 5 に移動）

## Phase 3 — 食品・食事管理

- [~] 成分表の公式データ確認：ネットワーク制限で公式サイトにアクセスできず未確認（手順・確認項目を FOOD_DATA.md に記載）
- [x] 取り込みスクリプト（成分識別子で列検出、Tr/推定値/未測定の扱い、安定ID、冪等SQL、レポート出力）
- [~] 実データでの取り込み：未実施（ダミーExcelでCLI〜DB適用まで検証済み）
- [x] 食品検索（端末のマイ食品・キャッシュ＋サーバーRPC、表記ゆれ正規化、オフライン時の案内）
- [x] 分量入力（g・クイック選択・1食単位）とカロリー・PFCの即時計算（不明値は「不明」）
- [x] 朝食・昼食・夕食・間食の記録（栄養値スナップショット、二重送信防止）
- [x] 食事の編集（分量・区分・日付）・削除（確認あり）
- [x] お気に入り（無料10件・サーバー側でも強制・並び替え関数あり）
- [ ] お気に入りの並び替えUI（リポジトリ関数 `moveFavorite` は実装済み）
- [x] マイ食品（100gあたり／1食あたり入力、編集・削除）
- [x] 食事テンプレート（食事から作成、名前・分量・食品の追加削除、確認後一括登録、無料1件、失効後ルール）
- [ ] テンプレート内の分量の自由入力（現在は×0.5/1.5/2）
- [x] 前日の食事コピー、過去の日の食事を今日にコピー
- [x] ホーム画面への反映（摂取・残り・PFC・体重・今日の食事）
- [x] SQLiteによるローカル保存（再起動後も保持）
- [x] Supabaseとの同期（push/pull、LWW、削除優先、拒否行の切り分け、バックオフ、同期状態表示）
- [ ] 個数・パック換算データ（検証済みソースが必要）

## Phase 4 — 体重・運動管理 ✅（実機確認を除く）

- [x] 体重記録の完全実装（新規・編集・削除、過去日時の記録（未来は不可）、メモ、体脂肪率、二重送信防止）
- [x] 体脂肪率の記録とグラフ（体重/体脂肪率の切替）
- [x] 7日グラフ（無料）／30日・90日・全期間グラフ（Premium。無料ではロック表示＋Premium案内）
- [x] 7日移動平均（記録のある日のみ）、直近7日・30日平均、目標体重の線
- [x] 目標体重と達成率（開始→現在→目標、達成率・目標まで）
- [x] 期間の統計（Premium：開始・最新・変化・最小・最大・平均・記録日数）
- [x] 運動記録（ウォーキング・ランニング・自転車・筋トレ・水泳・その他、名称・日時・時間・強度・メモ、編集・削除）
- [x] 筋トレの種目・重量（小数可）・回数・セット管理（前のセットを複製、最近の種目候補）
- [x] 運動消費カロリー計算（METs × 体重 × 時間 × 1.05 の推定／手入力）、「推定」表示
- [x] 運動消費を残りカロリーに加える設定（既定OFF、安静時分を除いた正味で加算、ホームに内訳表示）
- [x] カレンダー（月表示・記録のある日の印・週の始まり設定・日別詳細）
- [x] 食事・体重・運動の履歴編集（カレンダーの日別詳細／記録タブの履歴から編集・追加）
- [x] サーバー同期（`exercise_entries` / `exercise_sets` / `user_preferences`、boolean変換）
- [ ] 運動目標（分/週）の設定・達成表示（未実装）
- [ ] 🔐 METs値の原典確認

## Phase 5 — 通知・同期 ✅（実機確認を除く）

- [x] ローカル通知（朝の体重測定・朝食・昼食・夕食・1日の振り返り、毎日の予約）
- [x] 通知時間の変更（5分単位）・個別ON/OFF（設定は端末ごと、SQLiteに保存）
- [x] 許可は設定ON時のみ要求、拒否時は端末設定への案内、アプリ復帰時・起動時に再予約、ログアウトで停止
- [x] 通知タップで該当画面を開く
- [x] SQLiteへの永続保存（V2マイグレーション、既存端末は自動移行）
- [x] オフライン記録・オンライン復帰時（NetInfo）とアプリ復帰時の自動同期
- [x] 同期失敗時の再試行（指数バックオフ）、同期中に追加された記録の取りこぼし防止（今回修正）
- [x] 二重登録防止（クライアントUUID・冪等upsert・保存ボタン連打対策）
- [x] 複数端末間の競合処理（行単位の後勝ち・削除優先・未送信行はpullで上書きしない）
- [ ] 🔐 実機での通知表示・タップ遷移・Androidの通知チャンネル確認
- [ ] 🔐 実Supabaseでの2台同時利用の確認

## Phase 6 — 課金 ✅（実ストアでの購入は未検証）

- [x] RevenueCat SDK 導入（`react-native-purchases` 10.12.2、iOS/Android。Expo Go 不可・Development Build が必要）
- [x] 課金の抽象化（RevenueCat／ローカルモード用モック／キー未設定時は「準備中」）。公開キーのみ使用し `sk_` キーは拒否
- [x] Premium購入画面 `/premium`：機能一覧、ストアの価格・請求周期・初回特典、購入・復元、自動更新・解約方法・返金、利用規約・プライバシーポリシーへの導線
- [x] 価格・期間はストアの商品情報を表示し、期間不明・取得失敗時は購入ボタン無効（350円をハードコードしない）
- [x] 購入処理（オフライン時は開始しない、キャンセルは無表示、承認待ち・購入済み・制限・失敗の案内、二重実行防止）
- [x] 購入復元（端末に無くてもサーバーが知っていればPremium）
- [x] サブスクリプション状態の取得（サーバーの `subscriptions`）とマイページ表示（次回更新日・自動更新オフ・支払い確認）
- [x] 解約・期限切れ・返金・請求の問題の権限更新（Webhook／再確認、`is_premium`）
- [x] 無料版とPremium版の機能制限（グラフ期間・期間の統計・お気に入り・テンプレート、サーバー側の上限）。Premium機能の入口は購入画面へ
- [x] 課金状態のキャッシュ（ユーザーごと・期限まで）と再検証（起動・復帰・SDK更新通知・購入/復元後）
- [x] アカウント切替時の権限混同防止（uidで configure・logIn/logOut、購入前の appUserID 確認、キャッシュのユーザー照合と削除）
- [x] ストアのサブスクリプション管理画面への導線
- [x] Webhook（Authorization 定数時間比較・fail closed、冪等、順序保護、REST再取得、TRANSFER、匿名ID無視）＋ `subscription-sync`
- [x] アカウント削除時に RevenueCat 顧客も削除（秘密キー設定時）
- [ ] 🔐 実ストア（Sandbox / ライセンステスター）での購入・更新・解約・返金テスト（docs/BILLING.md §6）
- [ ] 🔐 Webhook の実環境での受信確認
- [ ] CSVエクスポート・詳細栄養分析（Premium機能。現在「準備中」で購入画面でも宣伝しない）

## 体重の記録リマインダー（サーバープッシュ）— 実装・自動テスト済み／実機・外部設定待ち

- [x] 通知時刻（5分刻み）・ON/OFF、Supabase（`user_preferences`）に保存して端末間で同期、端末のタイムゾーンを保存・更新
- [x] サーバーでユーザーのタイムゾーンの設定時刻に当日（現地日付）の体重記録を確認、記録済みなら送らない、未記録のみ Expo Push で送信（Edge Function `weigh-in-reminders`、pg_cron 5分ごと）
- [x] 1日1回（冪等性キー：ユーザー×種類×現地日付）、送信失敗は最大3回まで再送、停止した処理の再取得、夏時間、送信枠3時間
- [x] プッシュトークンをユーザー×端末で管理、DeviceNotRegistered（ticket / receipt）で無効化、送信履歴と配送結果（ticket・receipt）を保存（端末表示とは区別）
- [x] 通知タップで体重入力画面、体重の入力・編集・削除でバッジ・未入力状態を再計算、記録済みなら通知センターの体重リマインダーを消去
- [x] アプリ表示中は端末内の記録（未同期を含む）を確認して誤通知を表示しない
- [x] ログアウトでトークン登録解除・バッジ消去、アカウント切替でトークン付け替え、アカウント削除で全削除
- [x] 通知が許可されていない場合の案内、ホームでの未記録表示（通知なしでも確認可能）、無料で利用可能
- [x] 旧ローカル「朝の体重測定」通知を廃止・取り消し（二重通知防止）、iOS のバッジ許可、Android チャンネル `weigh-in`
- [ ] 🔐 APNs キー（EAS）、Firebase / FCM V1、`google-services.json`（EAS ファイル環境変数）、`eas init`
- [ ] 🔐 Supabase：マイグレーション適用、関数デプロイ、`REMINDER_CRON_SECRET`、pg_cron / pg_net、Vault、`supabase/manual/schedule_weigh_in_reminders.sql`
- [ ] 🔐 実機テスト（QA_CHECKLIST §4.1：アプリ終了中の受信、バッジ表示、Android ランチャー差、オフライン記録時の既知の制約、2台・アカウント切替）
- [ ] 既知の制約：オフラインで記録した体重が同期されるまでの間、アプリを閉じていると通知が届く可能性（仕様書 §11.1）

## Phase 7 — 品質保証（実機・実サービス未検証）

- [x] 単体テスト（栄養・丸め・体重・日付・区分・上限・権限・METs・正規化・目標推定・入力検証・セッション保存・課金・設定値検査）
- [x] リポジトリ／同期エンジンのテスト（実SQLite＝node:sqlite、サーバー挙動を再現したフェイク）
- [x] 画面結合テスト（オンボーディング→検索→記録→編集、再起動後の保持、体重、運動、カレンダー、通知、課金、アカウント削除、認証フロー）
- [x] DBテスト（RLS・制約・上限・カスケード削除・同期ルール・食品取り込み・運動/設定・課金・セキュリティ監査）
- [x] Supabase：`supabase/config.toml`（認証設定・Edge Functions の JWT 設定）、関数の実行権限の最小化（マイグレーション4）、カタログ監査テスト
- [x] 公開設定の検査（`npm run env:check`、アプリ側でも service_role / secret キーを拒否）
- [x] 食品データ：GitHub Actions のドライラン（MEXTのみ・SHA-256・件数照合・使い捨てDB）、レポートに SHA-256
- [x] EAS：`eas.json`、`expo-dev-client`
- [x] 総合QA（自動）：アカウント切替、1年分データの性能、アクセシビリティ監査、エラー画面
- [x] あなたが行う作業の手順書（docs/USER_ACTIONS.md）
- [ ] 🔐 実Supabase（ステージング）への適用と SUPABASE_SETUP §7 の確認
- [ ] 🔐 成分表の実データ取り込み
- [ ] 🔐 iOS / Android 実機テスト（認証・同期・オフライン・通知・課金・アカウント削除）
- [ ] E2E（Maestro 等）の自動化、実機での VoiceOver / TalkBack 確認
- [ ] 依存関係の脆弱性（Expo CLI 経由の node-forge / zod）：修正版の公開待ち

## Phase 8 — ストア公開準備

- [ ] アイコン・スプラッシュ（仮素材）、EAS設定、ストア資料、規約・ポリシー公開、申告、審査

## 検証ログ

| 日付       | 内容                                                                                                          | 結果                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 2026-10-24 | GitHub Actions CI（`main` = e36ff5a）                                                                         | 成功                                                     |
| 2026-10-24 | `tsc --noEmit` / ESLint / Prettier                                                                            | 合格                                                     |
| 2026-10-24 | Jest 13スイート109件（TZ=Asia/Tokyo）、domain/data 78件は TZ=America/New_York でも                            | 合格                                                     |
| 2026-10-24 | DBテスト（PostgreSQL 16 + Supabaseスタブ：10_rls / 20_sync_rules / 30_food_import）                           | 合格                                                     |
| 2026-10-24 | `expo export`（iOS / Android Hermes バンドル）                                                                | 成功                                                     |
| 2026-10-24 | Web開発サーバー（expo-sqlite WASM）でオンボーディング→マイ食品登録→記録→再読み込み後も保持、ライト/ダーク表示 | 確認済（入力欄の単位見切れ・モーダル見出し折返しを修正） |
| 2026-10-24 | 取り込みCLI（ダミーxlsx → SQL → PostgreSQL）                                                                  | 成功                                                     |
| 2026-10-24 | Phase 4/5：`tsc --noEmit` / ESLint / Prettier                                                                 | 合格                                                     |
| 2026-10-24 | Phase 4/5：Jest 18スイート144件（TZ=Asia/Tokyo）、domain/data 99件は TZ=America/New_York でも                 | 合格                                                     |
| 2026-10-24 | Phase 4/5：DBテスト（10_rls / 20_sync_rules / 30_food_import / 40_exercise_preferences）                      | 合格                                                     |
| 2026-10-24 | Phase 4/5：`expo export`（iOS / Android Hermes バンドル）、`expo config` で expo-notifications プラグイン解決 | 成功                                                     |
| 2026-10-24 | Phase 6：`tsc` / ESLint / Prettier                                                                            | 合格                                                     |
| 2026-10-24 | Phase 6：Jest 24スイート197件（TZ=Asia/Tokyo）、domain/data/features/server 148件は TZ=America/New_York でも  | 合格                                                     |
| 2026-10-24 | Phase 6：カバレッジ 文83.8% / 分岐72.6% / 関数77.1% / 行86.7%                                                 | 計測                                                     |
| 2026-10-24 | Phase 6：DBテスト 10 / 20 / 30 / 40 / 50_billing                                                              | 合格                                                     |
| 2026-10-24 | Phase 6：Edge Functions 3本の `deno check`（Deno 2.5.6）                                                      | 合格（実行は未検証）                                     |
| 2026-10-24 | Phase 6：`expo export`（iOS / Android）、`expo prebuild`（一時ディレクトリ・生成のみ）                        | 成功（ネイティブコンパイルは未実施）                     |
| 2026-10-24 | Phase 6：Web開発サーバーで購入画面（ライト/ダーク）→ モック購入 → マイページがPremium表示                     | 確認済（モックストア）                                   |
| 2026-10-24 | Phase 7：`tsc` / ESLint / Prettier                                                                            | 合格                                                     |
| 2026-10-24 | Phase 7：Jest 29スイート207件（TZ=Asia/Tokyo）、158件は TZ=America/New_York でも                              | 合格                                                     |
| 2026-10-24 | Phase 7：カバレッジ 文84.1% / 分岐73.0% / 関数77.5% / 行87.2%                                                 | 計測                                                     |
| 2026-10-24 | Phase 7：DBテスト 10 / 20 / 30 / 40 / 50 / 60_security_audit（マイグレーション4本）                           | 合格（60 は修正前に失敗を確認）                          |
| 2026-10-24 | Phase 7：Edge Functions 3本の `deno check`、`expo export`（iOS/Android）、`expo config`                       | 成功                                                     |
| 2026-10-24 | Phase 7：`npm audit --omit=dev`                                                                               | high 5件（Expo CLI 経由・アプリ本体外・修正版なし）      |
| 2026-10-24 | 体重リマインダー：`tsc` / ESLint / Prettier                                                                   | 合格                                                     |
| 2026-10-24 | 体重リマインダー：Jest 32スイート238件（TZ=Asia/Tokyo）、182件は TZ=America/New_York でも                     | 合格                                                     |
| 2026-10-24 | 体重リマインダー：カバレッジ 文85.3% / 分岐74.4% / 関数78.7% / 行88.2%                                        | 計測                                                     |
| 2026-10-24 | 体重リマインダー：DBテスト 10〜70（70_weigh_in_reminders 追加、マイグレーション5本）                          | 合格                                                     |
| 2026-10-24 | 体重リマインダー：Edge Functions 4本の `deno check`、`expo export`（iOS/Android）、`expo config`              | 成功                                                     |
| —          | 体重リマインダーの実機受信・バッジ表示・pg_cron 実行                                                          | **未検証**                                               |
| —          | 実ストアでの購入・更新・解約・返金、Webhook受信                                                               | **未検証**                                               |
| —          | ローカル通知の実機表示（iOS / Android）                                                                       | **未検証**（Jestではモックで検証）                       |
| —          | 実Supabase（Auth・同期・Edge Function）                                                                       | **未検証**                                               |
| —          | 文部科学省の実Excelの取り込み                                                                                 | **未実施**                                               |
| —          | iOS / Android 実機・シミュレータ                                                                              | **未検証**                                               |

## 既知の制約・注意

- 端末の Web 版は開発確認用のみ（製品対象外）。Web では SVG の一部属性について React の開発警告が出る。
- `nutrition_goals` を2台で同じ日に変更した場合は後勝ち（1日1行）。
- ログアウトすると端末の記録は消去される（サーバーには保存済み）。未同期がある場合は警告を表示。
- 通知設定は端末ごと（同期しない）。ログアウトで消去されるため、再ログイン後は再設定が必要。
- Web版では通知は利用不可（設定画面に案内を表示）。
- 体重グラフは代表値（その日の最初の測定）で描画。1日に複数回測った場合の2回目以降は履歴にのみ表示。
