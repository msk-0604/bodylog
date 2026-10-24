# BODYLOG アーキテクチャ

最終更新: 2026-10-24（Phase 0/1）

## 1. 全体構成

```
┌──────────────────────── Mobile (Expo SDK 58 / React Native 0.88) ────────────────────────┐
│  Expo Router (src/app)  ─ screens                                                         │
│      │                                                                                     │
│  features/*  ─ screen-level components & hooks                                            │
│      │                                                                                     │
│  domain/*    ─ pure TypeScript (計算・検証・権限判定)  ← 単体テストの中心                   │
│      │                                                                                     │
│  data/* (Phase 3〜5)                                                                       │
│    ├─ repositories  (UIはこれだけを見る)                                                    │
│    ├─ SQLite (expo-sqlite)  ← 記録の一次保存先（オフラインファースト）                      │
│    ├─ outbox / sync engine  → Supabase へ push / pull                                      │
│    └─ TanStack Query (サーバー状態: 食品検索・サブスク状態など)                              │
│  RevenueCat SDK (Phase 6)   ・ expo-notifications (ローカル通知)                           │
└───────────────────────────────────────────────────────────────────────────────────────────┘
                 │ HTTPS (supabase-js, anon key + user JWT)
┌────────────────────────────────────── Supabase ───────────────────────────────────────────┐
│ Auth (email/password) │ PostgreSQL + RLS │ RPC: search_foods │ Edge Functions:            │
│                                          │                   │  - revenuecat-webhook       │
│                                          │                   │  - delete-account           │
└───────────────────────────────────────────────────────────────────────────────────────────┘
                 ▲ Webhook (Authorization header)
            RevenueCat ── App Store / Google Play
```

AI API・LLM・解析サービスは使用しない。

## 2. ディレクトリ構成

```
src/
  data/                 SQLite（db/）・リポジトリ（repo/）・同期（sync/）・購読フック（hooks.ts）
  app/                  Expo Router のルート（画面のみ）
    _layout.tsx         Providers / Root Stack / ErrorBoundary
    (tabs)/             下部タブ: index(ホーム) meals records mypage
    weight-entry.tsx    体重入力モーダル
  components/
    ui/                 デザインシステム部品（AppText, Button, Card, ListRow, ProgressRing ...）
    icons/              SVGアイコン
  domain/               純粋関数（nutrition, weight, date, mealType, entitlements, exercise, searchNormalize）
  features/             画面単位の部品・フック（home, weight, goals, records ...）
  lib/                  横断ユーティリティ（haptics, queryClient, useToday）
  theme/                デザイントークン・ThemeProvider
supabase/
  migrations/           DBマイグレーション（Supabase CLI 形式）
  local-tests/          素のPostgreSQLで実行するRLS/制約テスト（CI）
scripts/db-test.sh      マイグレーション＋DBテスト実行
docs/                   設計書
```

ルール: `src/app` には画面以外を置かない。UIは `domain` の関数で計算し、画面内に計算ロジックを書かない。

## 3. 状態管理

| 種類                                                                             | 手段                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 記録データ（食事・体重・お気に入り・テンプレート・マイ食品・目標・プロフィール） | **SQLite（expo-sqlite）が一次保存先**。`src/data/repo/*` のリポジトリ経由で読み書きし、画面は TanStack Query（キー `['local', userId, ...]`）で購読。書き込みは `writeLocal()` が実行 → `['local']` を無効化 → 同期を予約 |
| サーバー状態（食品検索結果・サブスク状態）                                       | TanStack Query（アプリ復帰で再取得）                                                                                                                                                                                      |
| セッション                                                                       | Zustand（`features/auth/session.ts`）。supabase-js のセッションは expo-secure-store（Keychain/Keystore）に分割保存（`lib/secureStorage.ts`、1チャンク1800文字）                                                           |
| UIの一時状態                                                                     | React state / Zustand（食事タブの選択日付・区分など）                                                                                                                                                                     |

SQLite へのアクセスは単一接続をミューテックスで直列化し、トランザクション中に他の処理が割り込まない（`data/db/types.ts`）。スキーマは `PRAGMA user_version` でバージョン管理（`data/db/schema.ts`）。

## 4. オフライン同期（実装済み・`src/data/sync`）

### 4.1 書き込み（push）

1. 画面 → リポジトリ → SQLite に即時書き込み → UI即時反映（通信を待たない）。
2. 同期対象テーブルの各行は `rev`（ローカル変更ごとに+1）と `synced_rev`（サーバー反映済みのrev）を持つ。`rev > synced_rev` が未送信。専用のアウトボックステーブル（当初案の `sync_operations`）の代わりにこの方式を採用し、同じ行の連続編集を1回の送信にまとめる。
3. 同期エンジンは未送信行を親→子の順（profiles, user_preferences, nutrition_goals, custom_foods, meal_templates, meal_template_items, meal_entries, meal_items, food_favorites, body_measurements, exercise_entries, exercise_sets）に `upsert (on conflict id)` で送信。1ユーザー1行のテーブル（`profiles`, `user_preferences`）は `mode: 'update'` で所有者列（`id` / `user_id`）をキーに `update` する（行はサインアップ時にサーバーが作成）。SQLiteの 0/1 は送信時に boolean へ変換する（`booleans` 設定）。IDはクライアント生成のUUIDなので**再送しても重複しない**（レスポンス喪失時の再送もテスト済み）。送信中に編集された行は `synced_rev` を進めない。
4. 通信・サーバー障害は指数バックオフ（2秒〜最大15分、ジッター付き）で再試行。サーバーが拒否した行（無料枠超過・制約違反）は1行ずつ切り分けて `sync_error` を記録し、他の行は同期を続ける。拒否された行は編集されるまで再送しない。
5. 同期のきっかけ：ローカル書き込み後（1.5秒デバウンス）・アプリ復帰時・ネットワーク復帰時（NetInfo）・ホームのプルリフレッシュ・マイページ「データ同期」。
6. 同期中に新しい書き込みがあった場合は、実行中の同期の終了後にもう一度同期する（取りこぼし防止。`syncService.test.ts`）。

### 4.2 読み込み（pull）

- テーブルごとに `updated_at >= cursor` を取得（RLSで自分の行のみ、1000件ページング）。cursor はサーバーが返した最大 `updated_at`（端末時刻を使わない）。
- 削除された行（`deleted_at` あり）はローカルでも論理削除状態で保持（トゥームストーン）。
- pull 後、お気に入り・テンプレート・最近の記録が参照する食品マスタのうち端末に無いものを取得してキャッシュ（新しい端末でもオフラインで使えるように）。
- 新しい端末で初めてログインした時は、初回同期が終わるまで待ってから画面を表示（オフラインなら再試行画面）。

### 4.3 競合解決ルール

- 単位はレコード（行）。**Last-Writer-Wins（サーバーの `updated_at` 基準）**。
- 端末に未送信の変更がある行は、pull で上書きしない（送信後に再取得）。
- 削除は勝つ: 片方で削除（`deleted_at`）された行は、他端末の更新があっても削除のまま（サーバーのトリガー `prevent_undelete` で保証）。
- 親子（meal_entries / meal_items）は子行も個別に同期。親が削除されたら子も削除扱い。
- お気に入り・テンプレート上限超過（サーバー側トリガーで拒否）は行に `sync_error = premium_required` を記録し、マイページの「データ同期」に件数を表示。
- 目標（nutrition_goals）は1日1行（`user_id, effective_from` で upsert）。2台で同じ日に変更した場合も後勝ちで1行に収束。
- ログアウト・アカウント切替時は端末のデータを消去（別アカウントのデータを混在させない）。未送信の記録がある場合はログアウト前に警告。

### 4.4 端末キャッシュ方針

- 食品マスタ全体は保存しない。最近使った食品・お気に入り・テンプレート内の食品・ユーザー登録食品のみSQLiteに保持。
- 検索はオンライン時に RPC `search_foods`。オフライン時はローカルキャッシュのみを検索し、その旨を表示。

### 4.5 端末ローカルの設定（同期しない）

- 通知設定（`notification_settings`：種類・ON/OFF・時刻）は**端末ごと**に保存し、同期しない。通知は持ち歩く端末の性質（OSの許可・時刻の好み）に依存するため。サーバーの `notification_settings` テーブルは現在未使用（将来の端末間共有用に残す）。
- ログアウト・アカウント削除・アカウント切替で他のユーザーデータと同様に消去し、予約済みの通知も取り消す。

## 5. 日付・タイムゾーン

- 記録は「端末のローカル日付（`*_on`）」「瞬間（`*_at`, timestamptz）」「IANAタイムゾーン」を保存。
- 集計はローカル日付で行う → 旅行やタイムゾーン変更で過去の日次集計が動かない。
- 日付キーの加減算はUTC演算で行いDSTの影響を受けない（`domain/date.ts`）。
- 「今日」はアプリ復帰時と0:00に更新（`lib/useToday.ts`）。

## 5.1 ローカル通知（実装済み・`src/features/notifications/scheduler.ts`）

- `expo-notifications` のローカル通知のみ（プッシュトークン・サーバー送信なし）。Androidはチャンネル `reminders`。
- 5種類（朝の体重測定・朝食・昼食・夕食・1日の振り返り）を `DAILY` トリガーで予約。識別子 `reminder-<kind>`。変更のたびに自分の識別子だけを取り消して再予約（直列化して重複予約を防止）。
- 許可は**ユーザーが通知をONにした時だけ**要求。拒否済みなら再要求せず、端末の設定を開く案内を表示。
- 再予約のタイミング：サインイン完了時（アプリ起動時）・アプリ復帰時（OS設定で許可が変わった場合に対応）・設定変更時。`DAILY` は端末のローカル時刻で発火するため、タイムゾーン変更後も「毎日7:00」のまま。
- 通知タップで該当画面（体重入力・食事・ホーム）を開く（オンボーディング完了後のみ）。

## 6. 課金（Phase 6）

- RevenueCat（`react-native-purchases`）。Entitlement `premium`、月額商品1つ。
- アプリ: Offerings からストア価格を取得して表示（価格をハードコードしない）。購入・復元・管理リンク。
- RevenueCat の `appUserID` = Supabase の `auth.uid()`（ログイン時に `logIn`）。アカウント切替時は `logOut`。
- サーバー: Edge Function `revenuecat-webhook`
  - `Authorization` ヘッダーを RevenueCat ダッシュボードで設定した秘密値と定数時間比較（実装時に公式仕様を再確認）。
  - `subscription_events.id = event.id` で重複を無視（冪等）。
  - イベント種別（INITIAL_PURCHASE, RENEWAL, CANCELLATION, UNCANCELLATION, BILLING_ISSUE, EXPIRATION, PRODUCT_CHANGE, …）に応じて `subscriptions` を更新。順序逆転に備え `event_at` が古いイベントで状態を巻き戻さない。必要に応じて RevenueCat REST API で最新状態を再取得。
- 権限の正: `public.is_premium(uid)`（DB関数）。アプリは `subscriptions` を読んで表示し、SDKの即時状態は補助のみ。
- オフライン時: 最後に確認した状態と `expires_at` をキャッシュし、期限内のみPremium表示。
- **Phase 6 の接続点**（Phase 4/5 時点）：
  - `src/features/premium/usePlan.ts`：プラン判定（`subscriptions` を参照）。RevenueCat SDK の即時状態を補助として加える場所。
  - `src/features/premium/premiumInfo.ts` の `showPremiumInfo(feature)`：Premium機能に触れた時の案内（現在はダイアログ）。Paywall（`/premium`）への遷移に置き換える唯一の入口。
  - 呼び出し元：体重グラフの30日/90日/全期間、期間の統計、お気に入り・テンプレートの上限。
  - 必要な設定（🔐 ユーザー操作）：App Store Connect / Play Console の月額商品、RevenueCat プロジェクト・Entitlement `premium`、公開SDKキー `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`（公開可）、Webhook の認証用秘密値（Supabase の Edge Function シークレットに登録。リポジトリには置かない）。

## 7. 認証（実装済み）

- Supabase Auth（メール＋パスワード、メール確認必須、PKCEフロー）。確認・パスワード再設定メールのリンクは `bodylog://auth/callback` に戻り、`exchangeCodeForSession` でセッション化（`app/auth/callback.tsx`）。別端末で開いた場合は「確認済み・ログインしてください」と案内。
- 画面遷移は `Stack.Protected` で状態ごとに出し分け：未ログイン→(auth)、初回同期中→待機画面、未オンボーディング→onboarding、パスワード再設定中→reset-password、それ以外→タブ。保護ルートに直接来た場合は `+not-found` が状態に応じてリダイレクト。
- Supabase 未設定の開発ビルドは「ローカルモード」（アカウントなし・同期なし）。リリースビルドは未設定だと起動しない。
- 規約・プライバシーポリシーのバージョンと同意日時を `profiles` に保存。
- アカウント削除: Edge Function `delete-account`（service_role はサーバー側のみ）で `auth.admin.deleteUser` → DBは CASCADE で全削除。削除前にストア解約の案内。

## 8. セキュリティ

- クライアントに埋め込むのは Supabase URL / anon key / RevenueCat 公開キーのみ。service_role・Webhook秘密値は Supabase のシークレットに保存。
- 全ユーザーテーブルで RLS。食品マスタは読み取り専用、課金テーブルはユーザー書き込み不可（権限剥奪 + RLS の二重）。
- エラーメッセージ・ログに個人データ（体重・食事内容・メール）を出さない。エラー監視導入時はPIIスクラブ設定を必須にする。
- 依存関係の脆弱性: `npm audit` を定期確認（CIへの組み込みは Phase 7）。

## 9. ビルド・配布（Phase 8）

- EAS Build（development / preview / production プロファイル）、EAS Submit、TestFlight・Google Play 内部テスト。
- `app.json`: bundleIdentifier / package は `jp.bodylog.app`（**ストア登録前に最終確認が必要**。登録後は変更不可）。

## 10. 開発環境メモ

- クラウド開発環境では docs.expo.dev へのアクセスがネットワークポリシーで遮断される場合がある。その場合は `node_modules` 内の型定義（例: `node_modules/expo-router/build/**/*.d.ts`）を一次情報として確認する。
- Expo SDK 58 / expo-router 58 の主な変更点（本プロジェクトで確認済み）:
  - JSタブは `import { Tabs } from 'expo-router/js-tabs'`（`expo-router` からの `Tabs` は非推奨）。
  - React Navigation は expo-router に同梱（`ThemeProvider`, `DarkTheme` 等は `expo-router` から import）。
  - TypeScript 6 は `types` の既定が空のため、tsconfig で `"types": ["jest"]` を指定。
  - @testing-library/react-native v14 は `render` / `fireEvent` が非同期（`await` 必須）。
  - Reanimated 4 の Jest 実行には `"resolver": "react-native-reanimated/jest/resolver"` が必要。
