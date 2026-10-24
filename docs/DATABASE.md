# BODYLOG データベース設計

最終更新: 2026-10-24
マイグレーション: [`20261024000000_initial_schema.sql`](../supabase/migrations/20261024000000_initial_schema.sql), [`20261025000000_sync_rules.sql`](../supabase/migrations/20261025000000_sync_rules.sql)
テスト: [`supabase/local-tests/`](../supabase/local-tests/)（`scripts/db-test.sh`、CIで実行）

> ローカルPostgreSQL 16 + Supabase互換スタブ（auth.users / auth.uid() / anon・authenticated・service_role ロール）で適用・テスト済み。**実際のSupabaseプロジェクトへの適用は未実施**（Phase 2でプロジェクト作成後に `supabase db push`）。

## 1. 共通方針

| 項目         | 方針                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------- |
| 主キー       | UUID。端末で作る記録はクライアント生成UUID（オフライン同期の冪等性）                        |
| 所有者       | 全ユーザーテーブルに `user_id`（→ `auth.users` ON DELETE CASCADE）                          |
| 親子の整合   | 子テーブルは `(parent_id, user_id)` の複合FK → 他人の親に子を付けられない                   |
| 日時         | `*_at timestamptz` + ローカル日付 `*_on date` + `time_zone text`                            |
| 論理削除     | 同期対象テーブルは `deleted_at`（削除の同期用トゥームストーン）。アカウント削除時は物理削除 |
| 監査列       | `created_at`, `updated_at`（トリガーで自動更新）                                            |
| 栄養の不明値 | `NULL`（0にしない）                                                                         |
| 数値精度     | 体重 `numeric(4,1)`、栄養スナップショット `numeric(…,1)`、食品マスタ `numeric(6,2)`         |

## 2. テーブル

| テーブル                | 用途                                                                       | 主な制約                                                               |
| ----------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `profiles`              | ニックネーム・身長・生年月日・性別（任意）・活動量・TZ・規約同意           | `id = auth.users.id`。新規ユーザー作成時にトリガーで作成               |
| `user_preferences`      | 運動消費を残りkcalに反映するか 等                                          | トリガーで作成                                                         |
| `nutrition_goals`       | 目標の**履歴**（`effective_from` ごと）                                    | `unique(user_id, effective_from)`、kcal 500–10000                      |
| `body_measurements`     | 体重・体脂肪率                                                             | 20–300kg、1–75%                                                        |
| `food_master`           | 日本食品標準成分表（100g当たり）                                           | `unique(source_version, food_code)`、trigram GIN                       |
| `food_serving_units`    | 検証済みの個数・パック換算                                                 | 0 < g ≤ 5000                                                           |
| `custom_foods`          | ユーザー登録食品                                                           | 換算はラベルとgがセット                                                |
| `food_favorites`        | お気に入り（マスタ or ユーザー食品のどちらか1つ）                          | `num_nonnulls = 1`、重複不可（部分ユニーク）、**無料10件（トリガー）** |
| `meal_entries`          | 食事（日付・時刻・区分）                                                   | 区分は4種                                                              |
| `meal_items`            | 食事の食品（**栄養値スナップショット**）                                   | 0 < g ≤ 5000、複合FK                                                   |
| `meal_templates`        | 食事テンプレート                                                           | **無料1件（トリガー）**                                                |
| `meal_template_items`   | テンプレート内の食品と分量                                                 | 複合FK                                                                 |
| `exercise_entries`      | 運動                                                                       | 1–1440分、`kcal_is_estimated`                                          |
| `exercise_sets`         | 筋トレのセット（種目・重量・回数）                                         | 複合FK                                                                 |
| `subscriptions`         | 課金状態（RevenueCat Webhookのみ更新）                                     | ユーザーは読み取りのみ                                                 |
| `subscription_events`   | Webhook生イベント（`id` = RevenueCat event id で冪等）                     | ユーザーはアクセス不可                                                 |
| `notification_settings` | 通知の種類別ON/OFF・時刻（**現在アプリは未使用**：通知設定は端末ローカル） | PK(user_id, kind)                                                      |

同期待ちの管理は端末SQLiteの各行の `rev` / `synced_rev` で行う（当初案の `sync_operations` アウトボックスは不採用、ARCHITECTURE.md §4）。`goal_history` は `nutrition_goals` の履歴方式で代替。

## 3. 関数・トリガー

権限（`20261027000000_function_privileges.sql`）: Supabase は新しい関数の実行権限を anon / authenticated に既定で付与するため、`search_foods`（authenticated）以外の実行権限を取り消し。`is_premium` はトリガー内部と service_role のみ（アプリは RLS で自分の `subscriptions` 行を読む）。

課金（`20261026000000_billing.sql`、すべて `security definer`・`search_path=''`・service_role のみ実行可）:

- `apply_subscription_state(user, status, store, product, period_type, expires_at, will_renew, event_id, event_at)`：`event_at` が最後に適用したものより古ければ無視（順序保護）。未知のユーザー・未購入ユーザーの「期限切れ」は行を作らない。
- `record_subscription_event(id, user, type, event_at, payload)` → `new` / `retry` / `duplicate`、`finish_subscription_event(id)`。

| 名前                                       | 内容                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `set_updated_at()`                         | 全テーブルの `updated_at` 更新                                                                                             |
| `handle_new_user()`                        | `auth.users` 作成時に `profiles` / `user_preferences` 作成                                                                 |
| `is_premium(uid)`                          | `subscriptions` が有効（期限内かつ expired/refunded/paused 以外）か。SECURITY DEFINER                                      |
| `enforce_free_plan_limit(n)`               | お気に入り・テンプレートの無料上限。挿入時と論理削除の取り消し時に判定。同一ユーザーの同時挿入はアドバイザリロックで直列化 |
| `search_foods(q, category, limit, offset)` | 正規化済み文字列の部分一致検索（LIKEワイルドカードはエスケープ）。前方一致優先 → 短い順。最大100件                         |

## 4. RLS / 権限

- 全テーブルで RLS 有効。`anon` は全テーブルの権限を剥奪。
- ユーザー記録テーブル: `user_id = auth.uid()` の行のみ SELECT/INSERT/UPDATE/DELETE。
- `profiles` / `user_preferences`: 自分の行の SELECT/UPDATE のみ（作成はトリガー、削除はアカウント削除のCASCADE）。
- `food_master` / `food_serving_units`: authenticated は SELECT のみ（書き込み権限を剥奪）。取り込みは service_role。
- `subscriptions`: 自分の行の SELECT のみ（書き込み権限を剥奪）。
- `subscription_events`: authenticated の全権限を剥奪（service_role のみ）。
- ポリシーは `(select auth.uid())` 形式で行ごとの関数再評価を避ける。

## 5. インデックス

- 日次表示: `(user_id, measured_at desc)`, `(user_id, eaten_on)`, `(user_id, performed_on)`（いずれも `deleted_at is null` の部分インデックス）
- 同期 pull: 各テーブル `(user_id, updated_at)`
- 最近使った食品: `meal_items (user_id, created_at desc)`
- 食品検索: `food_master.search_text` / `custom_foods.search_text` の trigram GIN

## 6. テスト済み項目（`supabase/local-tests/*.sql`）

- 新規ユーザーで profiles / preferences が作成される
- 他ユーザーの記録を参照・更新・削除できない／他ユーザー名義で作成できない
- 他ユーザーの食事に食品を追加できない（複合FK）
- 一般ユーザーは食品マスタ・課金状態を書き換えられない、Webhookイベントを読めない
- anon は食品マスタも読めない
- 無料プラン上限（お気に入り10・テンプレート1）、論理削除で枠が空く
- Premium で上限解除、失効で再び制限・既存テンプレートは削除されない
- 0kg・0g・不正な食事区分などの CHECK 制約
- 同一IDの再送（upsert）で重複しない
- 検索: 部分一致、`%` `_` がリテラル扱い、空文字は0件、不明値は NULL のまま
- アカウント削除で全個人データが削除され、食品マスタは残る
- 論理削除済みの行が古い端末からの upsert で復活しない（20_sync_rules）
- 無料上限ちょうどの状態で既存お気に入りを upsert しても拒否されない／11件目は upsert でも拒否（20_sync_rules）
- 目標は1日1行に収束（20_sync_rules）
- 食品取り込みSQLの2回適用で重複しない・検索・NULL保持（30_food_import）
- 課金：書込関数は service_role のみ（authenticated/anon は実行不可）、ユーザーは `subscriptions` を書けない・他人の行を読めない・イベントを読めない、購入→解約（期限まで有効）→猶予→期限切れ→再購入→返金の遷移、古いイベントで巻き戻らない、期限なし付与（infinity）、イベントの冪等記録（new/retry/duplicate）、アカウント削除で `subscriptions` 削除・イベント匿名化（50_billing）
- セキュリティ監査（60_security_audit）：public の全テーブルで RLS 有効、ビューなし、security definer 関数は search_path 固定、anon はテーブル・関数とも権限なし、authenticated が実行できる関数は `search_foods` のみ、サーバー所有テーブルは書き込み不可、今後追加される関数も anon に既定で実行権限を与えない
- 運動・セットの upsert（再送で重複しない）、`user_preferences` の更新、運動時間・重量・回数の CHECK 制約、論理削除した運動が復活しない、他ユーザーの運動・設定を読み書きできない（40_exercise_preferences）

### 端末SQLite（`src/data/db/schema.ts`）

- マイグレーション V2（Phase 4/5）：`exercise_entries` / `exercise_sets` / `user_preferences`（同期対象）、`notification_settings`（端末ローカル・同期しない、PK `kind`）。
- 既存端末は起動時に V1 → V2 を自動適用（`schema.test` / `phase4.test` で検証）。

## 7. バックアップ・復旧

- Supabase の日次バックアップ（プランにより保持期間が異なる。Pro プラン以上でPITR可。費用は TASKS.md のコスト確認項目で判断）。
- 食品マスタは取り込みスクリプトから再生成可能。
- 復旧手順書は Phase 7 で作成。

## 8. データ削除

- アカウント削除: `auth.users` 削除 → 全ユーザーテーブルが CASCADE で物理削除。
- `subscription_events` は会計・不正対策のため `user_id` を NULL にして保持（ペイロード内の `app_user_id` の扱いはプライバシーポリシーで明示し、保持期間を決める: 未決事項）。
