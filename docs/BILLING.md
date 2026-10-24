# BODYLOG Premium 課金（RevenueCat）

最終更新: 2026-10-24（Phase 6）。**実ストアでの購入テストは未実施**（下記 §6 の項目は外部設定後に実施）。

## 1. 方針

- 商品：BODYLOG Premium 自動更新サブスクリプション 1種類（月額350円・税込を想定）。
- **価格・請求周期・初回特典はストアの商品情報を正**とする。アプリは RevenueCat Offering から取得した `priceString` / `subscriptionPeriod` を表示し、取得できない・期間が不明な商品では購入ボタンを無効にする（`isValidPremiumPackage`）。350円をハードコードして購入処理を行わない。
- **権限の正はサーバー**（`public.subscriptions` / `public.is_premium()`）。アプリはストアSDKの「購入成功」だけで機能を解放せず、サーバーが確認するまで「確認中」とする。
- サーバー側の無料枠（お気に入り10件・テンプレート1件）はDBトリガーで強制（クライアント改ざん対策）。

## 2. 構成

```
アプリ ──購入/復元──▶ App Store / Google Play
  │                         │
  │ react-native-purchases  ▼
  │ (appUserID = Supabase uid)  RevenueCat ──Webhook──▶ Edge Function revenuecat-webhook
  │                                  ▲                     │ Authorization 検証・冪等・順序保護
  │                                  │ REST API (秘密キー) │
  └──subscription-sync (JWT)─────────┘                     ▼
                                              public.subscriptions（service role のみ書込）
  ◀──────────── select（RLS: 自分の行のみ）──────────────────┘
```

| 場所                           | ファイル                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| ストアSDKの抽象化              | `src/features/premium/billing/`（`revenueCat.ts` / `mock.ts`（ローカルモード・テスト）/ `unavailable.ts`）   |
| プラン判定・キャッシュ・再検証 | `src/features/premium/entitlement.ts`（`usePremium` / `usePlan` / `verifyWithServer` / `revalidatePremium`） |
| 購入・復元・管理画面           | `src/features/premium/actions.ts`                                                                            |
| 購入画面                       | `src/app/premium.tsx`（`/premium`）                                                                          |
| 文言・エラー分類・表示         | `src/domain/billing.ts`                                                                                      |
| サーバーの判定ロジック         | `supabase/functions/_shared/revenuecat.ts`（Jestでテスト）                                                   |
| Edge Functions                 | `supabase/functions/revenuecat-webhook`, `subscription-sync`, `delete-account`                               |
| DB                             | `supabase/migrations/20261026000000_billing.sql`（`apply_subscription_state` ほか）                          |

## 3. アプリの挙動

| 状況                             | 挙動                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 購入成功                         | `subscription-sync` でサーバーに再確認（0 / 1.5 / 3 / 5 秒）。サーバーがPremiumを返したら「Premiumへようこそ」。確認できなければ「購入を確認しています」（Webhook反映後に自動で切り替わる） |
| キャンセル                       | 何も表示しない（ユーザーの操作のため）                                                                                                                                                      |
| 承認待ち（保護者の承認など）     | 「購入の承認を待っています」                                                                                                                                                                |
| オフライン                       | 購入を開始しない。「通信できませんでした。料金は請求されていません」                                                                                                                        |
| 購入済み・別アカウントで購入済み | 「すでに購入済みのようです」→ 復元の案内                                                                                                                                                    |
| 購入制限（スクリーンタイム等）   | 「この端末では購入できません」                                                                                                                                                              |
| 商品を取得できない               | 購入ボタン無効＋再試行                                                                                                                                                                      |
| 復元                             | ストアで復元 → サーバー再確認。端末に無くてもサーバーが知っていればPremium（他OSで購入など）                                                                                                |
| 解約                             | 自動更新オフ → 期間終了まで Premium、終了で無料に戻る（Webhook `EXPIRATION`／再確認）                                                                                                       |
| 請求の問題（猶予期間）           | 猶予期間の終了まで Premium。マイページに支払い確認の案内                                                                                                                                    |
| 返金                             | 直ちに無料（`refunded`）                                                                                                                                                                    |
| オフライン時の表示               | 最後にサーバーで確認した状態を **同じユーザーに限り** `expires_at` まで使用                                                                                                                 |
| 再検証                           | 起動時・アプリ復帰時（10分に1回まで）・ストアSDKの更新通知時                                                                                                                                |
| アカウント切替・ログアウト       | RevenueCat を `logOut` / `logIn(uid)`。プランのキャッシュはユーザーごとに保存し、ログアウト時に削除。購入直前にSDKの appUserID がログイン中ユーザーと一致することを確認                     |
| サブスクリプション管理           | SDK の managementURL、無ければストアの定期購入ページ                                                                                                                                        |

匿名の RevenueCat ユーザーは作らない（SDKは常に Supabase uid で configure）。RevenueCat の **Restore Behavior** は「Transfer to new App User ID」ではなく、**「Keep with original App User ID」** を推奨（別アカウントへの権限移動を防ぐ）。運用方針に合わせて決定してください（🔐）。

## 4. サーバーの挙動

- Webhook：`Authorization` ヘッダーをダッシュボードで設定した値と**定数時間比較**。シークレット未設定・32文字未満なら常に 401（fail closed）。
  - RevenueCat の Webhook はペイロード署名（HMAC）ではなく、この Authorization ヘッダーで認証する方式（2026-10 時点の理解。公開前に公式ドキュメントで再確認）。
- イベントは `subscription_events.id = event.id` で一度だけ記録。処理途中で失敗した場合は 5xx を返し、RevenueCat の再送で再処理（`retry`）。
- `REVENUECAT_SECRET_API_KEY` がある場合：イベント内容ではなく **REST API で購読者を再取得**して保存（順序の入れ替わり・TRANSFER に強い）。無い場合はイベントから状態を導出し、`event_timestamp` が古いものは適用しない。
- `TEST` イベントは無視（200）。匿名ID（`$RCAnonymousID:`）や存在しないユーザーは無視。
- 状態：`active` / `cancelled`（期限まで有効）/ `billing_issue`（猶予期間まで有効）/ `expired` / `refunded` / `paused`。期限なしの付与は `expires_at = 'infinity'`。

## 5. 必要な外部設定（🔐 ユーザー操作）

1. **App Store Connect**：有料アプリ契約・銀行口座・税務情報、サブスクリプショングループ、商品（例 `jp.bodylog.premium.monthly`、1か月、価格 350円）、審査用スクリーンショット、In-App Purchase Key（RevenueCat 連携用）。
2. **Google Play Console**：アプリ登録、定期購入商品（同ID推奨・基本プラン 1か月 350円）、サービスアカウント（RevenueCat 連携用）、ライセンステスター。
3. **RevenueCat**：Project、iOS/Android アプリ、Entitlement `premium`、商品を紐づけた Offering（current、Monthly パッケージ）。
4. **鍵の設定**：
   - アプリ（公開可）：`EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_…` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_…`（`.env.local` / EAS環境変数）。`sk_` で始まる秘密キーを入れるとアプリは課金を無効にする。
   - サーバー（秘密）：`REVENUECAT_SECRET_API_KEY`、`REVENUECAT_WEBHOOK_AUTH`（`supabase secrets set`）。
5. **Webhook**：RevenueCat > Integrations > Webhooks に `https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook`、Authorization ヘッダーに `Bearer <REVENUECAT_WEBHOOK_AUTH>`。
6. **Development Build**（`react-native-purchases` はネイティブモジュールのため Expo Go 不可）：`npx eas-cli@latest build --profile development`。
7. 利用規約・プライバシーポリシーの確定版URL（購入画面からリンク。App Store は EULA へのリンクも必要）。

## 6. 購入テスト（未実施・外部設定後）

- [ ] iOS Sandbox / StoreKit テスト：購入 → Premium 反映（サーバーの `subscriptions` に行）
- [ ] 購入シートでキャンセル → 何も起きない
- [ ] 機内モードで購入 → 通信エラーの案内、課金されない
- [ ] 復元（アプリ再インストール後、別端末）
- [ ] 自動更新（Sandbox の短縮期間）→ `RENEWAL` で期限延長
- [ ] 解約 → 期限までPremium → 期限後に無料（`EXPIRATION`）
- [ ] 請求の問題（Sandbox で支払い失敗）→ 猶予期間の表示
- [ ] 返金（App Store Connect / Play Console）→ 無料に戻る
- [ ] Android：ライセンステスターで購入・承認待ち（保留中の支払い）
- [ ] アカウントA で購入 → ログアウト → アカウントB でログイン：B は無料のまま
- [ ] Webhook：誤った Authorization で 401、同じイベントの再送で二重処理されない
- [ ] サブスクリプションの管理リンクがストアの管理画面を開く
