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

| 種類                                                     | 手段                                                                                                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 記録データ（食事・体重・運動・お気に入り・テンプレート） | SQLite（真の保存先）→ リポジトリ → 購読フック。Phase 1 は一時的に Zustand のメモリストア（`features/records/localRecordsStore.ts`）                       |
| サーバー状態（食品検索結果・サブスク状態・プロフィール） | TanStack Query（アプリ復帰で再取得）                                                                                                                      |
| UIの一時状態                                             | React state / 必要時 Zustand                                                                                                                              |
| 認証セッション                                           | supabase-js（ストレージは expo-secure-store。2KB制限のため大きい値は AES 鍵を SecureStore、暗号文を SQLite/AsyncStorage に保存する方式を Phase 2 で実装） |

## 4. オフライン同期（Phase 5）

### 4.1 書き込み

1. 画面 → リポジトリ `save()` → SQLite に即時書き込み（`sync_state = 'pending'`）→ UI即時反映。
2. 同一トランザクションで `sync_operations`（アウトボックス, SQLiteのみ）に操作を追加: `{ id, table, record_id, op: upsert|delete, payload, attempts, next_attempt_at }`。
3. 同期エンジンがオンライン時にアウトボックスを古い順に送信。サーバーへは `upsert (on conflict id)` で送るため、**再送しても重複しない**（IDはクライアント生成UUID v4）。
4. 失敗時は指数バックオフ（1s→2s→4s…最大15分、ジッター付き）。4xx（検証エラー・上限超過）は再試行せず「同期エラー」として表示し、ユーザーに修正/削除を促す。

### 4.2 読み込み（pull）

- テーブルごとに `updated_at > last_pulled_at` を取得（RLSで自分の行のみ）。`deleted_at` が入った行は端末側でも削除扱い。
- 時計ずれ対策: `last_pulled_at` はサーバーから返った最大 `updated_at` を使う（端末時刻を使わない）。

### 4.3 競合解決ルール

- 単位はレコード（行）。**Last-Writer-Wins（サーバーの `updated_at` 基準）**。
- 端末に未送信の変更がある行は、pull で上書きしない（送信後に再取得）。
- 削除は勝つ: 片方で削除（`deleted_at`）された行は、他端末の更新があっても削除のまま。
- 親子（meal_entries / meal_items）は子行も個別に同期。親が削除されたら子も削除扱い。
- お気に入り・テンプレート上限超過（サーバー側トリガーで拒否）は「同期エラー」としてPremium案内を表示。

### 4.4 端末キャッシュ方針

- 食品マスタ全体は保存しない。最近使った食品・お気に入り・テンプレート内の食品・ユーザー登録食品のみSQLiteに保持。
- 検索はオンライン時に RPC `search_foods`。オフライン時はローカルキャッシュのみを検索し、その旨を表示。

## 5. 日付・タイムゾーン

- 記録は「端末のローカル日付（`*_on`）」「瞬間（`*_at`, timestamptz）」「IANAタイムゾーン」を保存。
- 集計はローカル日付で行う → 旅行やタイムゾーン変更で過去の日次集計が動かない。
- 日付キーの加減算はUTC演算で行いDSTの影響を受けない（`domain/date.ts`）。
- 「今日」はアプリ復帰時と0:00に更新（`lib/useToday.ts`）。

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

## 7. 認証（Phase 2）

- Supabase Auth（メール＋パスワード、メール確認必須、パスワード再設定はディープリンク `bodylog://`）。
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
