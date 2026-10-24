# あなた（プロジェクトオーナー）が行う作業

最終更新: 2026-10-24（Phase 7）

ここに書いた作業は、アカウント・支払い・秘密情報・公開の判断が関わるため、開発側（Claude）では行いません。
上から順に進めると、実機でのテストまでたどり着けます。

## はじめに：守ってほしいこと

- **秘密情報はチャット・GitHub・スクリーンショットに貼らないでください。** 秘密情報とは、パスワード、`service_role` キー、`sk_` で始まる RevenueCat 秘密キー、Webhook の合言葉、データベース接続文字列のことです。保存はパスワードマネージャにしてください。
- アプリに入れてよいのは、次の**公開キー**だけです。
  - Supabase の URL
  - anon（または publishable）キー
  - RevenueCat の `appl_` / `goog_` キー
- 設定値を入れたら、リポジトリのフォルダで `npm run env:check` を実行してください。間違って秘密キーを入れていないかを確認できます（値そのものは表示しません）。
- **ストアへの申請・公開は、あなたが決めるまで行いません。** 以下の手順にも「審査に提出」は含めていません。
- 画面の名前やメニューの位置は、各サービスの更新で変わることがあります。見つからない場合は、各サービスのヘルプで同じ名前を検索してください。

---

## 0. 用意するもの（費用がかかるものを含みます）

| もの                                | 用途                                                    | 費用                                                               |
| ----------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| Mac、または EAS Build（クラウド）   | iOS のビルド。EAS を使えば Mac がなくてもビルドできます | EAS は無料枠あり                                                   |
| iPhone と Android 端末（各1台以上） | 実機テスト                                              | —                                                                  |
| Apple Developer Program             | iOS の実機配布・App Store・課金                         | 年会費あり。金額は Apple 公式で確認                                |
| Google Play Console                 | Android の配布・課金                                    | 登録料あり（初回のみ）。金額は Google 公式で確認                   |
| Supabase アカウント                 | サーバー（データベース・認証）                          | 無料プランから開始可。本番は有料プランを推奨（バックアップのため） |
| RevenueCat アカウント               | 課金の管理                                              | 無料枠あり。料金は公式で確認                                       |
| Expo アカウント                     | EAS Build                                               | 無料枠あり                                                         |
| パスワードマネージャ                | 秘密情報の保管                                          | —                                                                  |

---

## 1. GitHub（約10分）

1. リポジトリ `msk-0604/bodylog` を開き、**Settings** → **General** → 一番下の **Danger Zone** → **Change visibility** で **Private** にします（方針決定済み）。
2. **Settings** → **General** → **Default branch** を `main` にします。
3. **Settings** → **Branches** → **Add branch protection rule**（または Rulesets）で `main` に次を設定します。
   - Require a pull request before merging
   - Require status checks: `Typecheck / Lint / Test`、`Migrations & RLS tests`

---

## 2. Supabase（ステージング → 本番）（約60分）

まず**ステージング用**のプロジェクトで全部を試し、問題がなければ本番用でも同じ手順を繰り返します。

### 2-1. プロジェクトを作る

1. https://supabase.com/dashboard → **New project**
2. Region は **Northeast Asia (Tokyo)** を選びます。
3. Database Password は自動生成し、**パスワードマネージャに保存**します。
4. 作成後、**Project Settings** → **General** の **Reference ID**（project-ref）をメモします。これは秘密情報ではありません。

### 2-2. データベースを作る（パソコンのターミナルで実行）

事前にパソコンへ Node.js 22 以上をインストールし、このリポジトリを `git clone` しておきます。

```bash
cd bodylog
npm ci
npx supabase@2.119.0 login                         # ブラウザが開くのでログイン
npx supabase@2.119.0 link --project-ref <project-ref>   # DBパスワードを聞かれたら入力
npx supabase@2.119.0 db push --dry-run             # 適用予定の4ファイルが表示されることを確認
npx supabase@2.119.0 db push                       # 実際に適用
npx supabase@2.119.0 config push                   # 認証設定を反映（差分を確認してから y）
```

確認すること：

- ダッシュボード → **Table Editor**：すべてのテーブルに盾アイコン（RLS有効）が付いている。
- **Advisors** → **Security Advisor**：エラーがない。警告があれば、その内容を開発側に伝えてください。

### 2-3. メール設定

1. **Authentication** → **Email Templates** で、確認メールとパスワード再設定メールを日本語にします。
   - 文面は開発側で用意できます。依頼してください。
   - リンク部分 `{{ .ConfirmationURL }}` は消さないでください。
2. 本番では **Authentication** → **SMTP Settings** で独自のメール送信サービスを設定します。Supabase 標準の送信は件数制限があるためです。
   - 送信元ドメイン（例 `no-reply@あなたのドメイン`）が必要です。

### 2-4. サーバー関数（Edge Functions）

```bash
npx supabase@2.119.0 functions deploy delete-account
npx supabase@2.119.0 functions deploy subscription-sync
npx supabase@2.119.0 functions deploy revenuecat-webhook --no-verify-jwt
npx supabase@2.119.0 functions deploy weigh-in-reminders --no-verify-jwt
```

秘密情報の登録は §6（RevenueCat）と §7-2（体重リマインダー）で行います。

### 2-5. アプリ用の公開値をメモ

**Project Settings** → **API**（または API Keys）で、次の2つをメモします。

- Project URL（`https://<project-ref>.supabase.co`）
- **anon** キー（または **publishable** キー）

**`service_role` / `secret` キーはアプリに使いません。**

---

## 3. 食品データ（日本食品標準成分表）（約30分）

1. 文部科学省「日本食品標準成分表」のページを開き、次を確認します。
   - 最新版の **本表（Excel）** があること
   - **利用条件・出典表記・正誤表**（docs/FOOD_DATA.md §2 の項目）
2. 本表 Excel のリンクを右クリックし、「リンクのアドレスをコピー」します（`https://www.mext.go.jp/` で始まるもの）。
3. GitHub のリポジトリ → **Actions** → **Food data dry run** → **Run workflow** を押し、次を入力します。
   - `url`：コピーしたアドレス
   - `version`：版の名前（例 `八訂増補2023`）
   - `expect_count`：公表されている食品数（わかれば）
4. 実行が緑色で終わったら、ページ下部の **Artifacts** から `food-master-…` をダウンロードします。
5. 中の `food_master_report.json` を開き、次を確認します。
   - `foods`（件数）が公表数と一致する
   - `skipped` が空、または内容に納得できる
   - 結果を開発側に共有すると、目視照合のサンプルを用意します。
6. **ステージング**に適用します。接続文字列は **Project Settings** → **Database** → **Connection string**（psql 用）で確認でき、これは秘密情報です。

   ```bash
   psql "<ステージングの接続文字列>" -v ON_ERROR_STOP=1 -f food_master.sql
   ```

7. アプリで検索・計算を確認してから、**本番への適用を判断**してください。手順6と同じ方法で、接続先を本番に変えて実行します。

※ 開発側の作業環境は、ネットワーク設定で `www.mext.go.jp` への接続が許可されていません。開発側で直接取り込みたい場合は、Claude の環境設定（クラウド環境の **Network access**）で `www.mext.go.jp` を許可してください。上の GitHub Actions を使う方法なら、その設定は不要です。

---

## 4. Apple（App Store Connect）（数日かかる場合あり）

1. **Apple Developer Program** に登録します。法人登録は D-U-N-S 番号が必要で、審査に日数がかかります。
2. **Bundle ID を決めます。** 現在は暫定で `jp.bodylog.app` です。変える場合は開発側に伝えてください。
3. App Store Connect → **アプリ** → **＋** → 新規アプリを作成します。プラットフォームは iOS、名前は BODYLOG、言語は日本語、Bundle ID は手順2で決めたものです。
4. **ビジネス**（契約/税務/口座）で **有料アプリ契約** に同意し、税務情報と銀行口座を登録します。**これがないとサブスクリプションをテストできません。**
5. アプリ → **サブスクリプション** → グループ（例 `BODYLOG Premium`）を作成し、その中に商品を作ります。
   - 商品ID：決定してください（推奨 `jp.bodylog.premium.monthly`）。**後から変更できません。**
   - 期間：1か月
   - 価格：350円
   - 初回無料期間：つけるかどうかを決めてください（アプリはストアの設定をそのまま表示します）
   - 表示名・説明（日本語）、審査用のスクリーンショットも必要です。
6. **ユーザとアクセス** → **統合** → **アプリ内課金**で **In-App Purchase キー**を作成し、`.p8` ファイルをダウンロードします。
   - これは**秘密情報**です。RevenueCat にだけアップロードし、GitHub には置きません。
7. **ユーザとアクセス** → **Sandbox** → **テスター**を作成します。実在しないメールアドレスでも作成できます。

## 5. Google Play Console（数日かかる場合あり）

1. Google Play Console に登録し、本人確認を済ませます。
2. **アプリを作成**します。名前は BODYLOG、言語は日本語、アプリは「アプリ」、料金は「無料」（アプリ内課金あり）です。
3. 課金商品は、**一度アプリをアップロード**しないと作成できない場合があります。§7 の preview / production ビルドを**内部テスト**トラックにアップロードしてから進めてください。
4. **収益化** → **定期購入** → 商品を作ります。
   - 商品IDは iOS と同じものを推奨します。
   - 基本プランは自動更新・1か月・350円です。
5. RevenueCat 連携用の**サービスアカウント**を作成し、JSONキーを取得します。
   - 手順は RevenueCat 公式の「Google Play service credentials」に従ってください。
   - JSONキーは**秘密情報**です。
6. **設定** → **ライセンス テスト**に、テストに使う Google アカウントを登録します。

## 6. RevenueCat（約40分）

1. https://app.revenuecat.com でプロジェクト **BODYLOG** を作成します。
2. **Apps** に iOS アプリ（Bundle ID と §4-6 の `.p8` キー）と Android アプリ（パッケージ名と §5-5 の JSON キー）を追加します。
3. **Products** に §4・§5 の商品を登録します。
4. **Entitlements** で `premium` を作成し、両方の商品を紐づけます。**この名前は必ず `premium` にしてください**（アプリとサーバーがこの名前を使います）。
5. **Offerings** で `default`（Current）を作成し、**Monthly** パッケージに両OSの商品を入れます。
6. **Project settings** → **Restore behavior**：別アカウントへの権限移動を防ぐため、**Keep with original App User ID** を推奨します。最終判断はあなたが行ってください。
7. **API keys** で次を確認します。
   - iOS 用の公開キー `appl_…`、Android 用の公開キー `goog_…` → §7 でアプリに設定します。
   - **Secret API key**（`sk_…`）を作成 → **秘密情報**。下の手順8で Supabase に登録します。
8. 秘密情報を Supabase に登録します（ターミナルで実行。値はパスワードマネージャからコピー）。

   ```bash
   # 合言葉は自分で作る：ターミナルで次を実行すると、ランダムな64文字が表示されます
   openssl rand -hex 32
   npx supabase@2.119.0 secrets set REVENUECAT_WEBHOOK_AUTH='<上で作った64文字>'
   npx supabase@2.119.0 secrets set REVENUECAT_SECRET_API_KEY='<sk_ で始まる秘密キー>'
   ```

9. **Integrations** → **Webhooks** → **Add** で次を設定します。
   - URL：`https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook`
   - Authorization header：`Bearer <手順8の64文字>`
   - **Send test event** を押し、成功（200）になることを確認します。

## 7. Expo / EAS Build（実機に入れるまで）（約60分）

1. https://expo.dev でアカウントを作ります。
2. ターミナルで次を実行します。

   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init        # app.json に projectId が追加される
   ```

   変更された `app.json` は、開発側にコミットを依頼するか、ご自身でコミットしてください。projectId は秘密情報ではありません。

3. 公開値を EAS に登録します。`development` / `preview` / `production` の環境ごとに実行してください。

   ```bash
   npx eas-cli@latest env:create --environment development --name EXPO_PUBLIC_SUPABASE_URL --value "https://<project-ref>.supabase.co" --visibility plaintext
   npx eas-cli@latest env:create --environment development --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon key>" --visibility plaintext
   npx eas-cli@latest env:create --environment development --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value "appl_..." --visibility plaintext
   npx eas-cli@latest env:create --environment development --name EXPO_PUBLIC_REVENUECAT_ANDROID_KEY --value "goog_..." --visibility plaintext
   ```

   これらはアプリに埋め込まれる**公開値**です。**秘密キーはここに入れないでください。**

4. 手元でも確認します。`.env.local` に同じ4つを書き、`npm run env:check` を実行して「OK」になることを確かめます。`.env.local` は GitHub に送られません。
5. iPhone を登録し、開発用ビルドを作ります。

   ```bash
   npx eas-cli@latest device:create          # 表示されるQRコードをiPhoneで開き、プロファイルをインストール
   npx eas-cli@latest build --profile development --platform ios
   npx eas-cli@latest build --profile development --platform android
   ```

6. ビルド完了後、表示されるリンクまたは QR コードから各端末にインストールします。
   - 開発用ビルドは、パソコンで `npx expo start` を実行して接続して使います。
   - 課金や通知を本番に近い形で試すには、`--profile preview` のビルドを使います。

## 7-2. 体重リマインダーのプッシュ通知（約60分）

体重を記録していない日だけ、設定時刻にサーバーから通知を送るための設定です。§2・§7 が終わってから行います。

**iOS（Apple Push Notification service）**

1. ターミナルで `npx eas-cli@latest credentials` を実行し、**iOS** → 使うビルドプロファイル（まず `development`）→ **Push Notifications** を選びます。
2. 「Apple アカウントでログインして作成」を選ぶと、APNs キーが自動で作成されて Expo に登録されます。
   - このキーは**秘密情報**です。手元に `.p8` をダウンロードした場合も GitHub には置かないでください（`.gitignore` 済み）。

**Android（Firebase Cloud Messaging）**

1. https://console.firebase.google.com でプロジェクトを作成します（Google アナリティクスは不要）。
2. **Android アプリを追加** → パッケージ名に `jp.bodylog.app`（§4-2 で変更した場合はその値）を入力 → `google-services.json` をダウンロードします。
3. このファイルを EAS に「ファイル型」の環境変数として登録します。**GitHub には置きません**（`.gitignore` 済み）。

   ```bash
   npx eas-cli@latest env:create --environment development --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret
   ```

   `preview` / `production` でも同じように登録します。コマンドが通らない場合は、expo.dev のプロジェクト → **Environment variables** で「File」として登録してください。

4. Firebase → **プロジェクトの設定** → **サービス アカウント** → **新しい秘密鍵を生成**（JSON）します。
5. `npx eas-cli@latest credentials` → **Android** → **Google Service Account** → **FCM V1** に、手順4の JSON をアップロードします。
   - これは**秘密情報**です。アップロード後は手元から削除してかまいません。

**Supabase（5分ごとの自動実行）**

1. 合言葉を作って登録します（値はパスワードマネージャに保存）。

   ```bash
   openssl rand -hex 32        # 表示された64文字をコピー
   npx supabase@2.119.0 secrets set REMINDER_CRON_SECRET='<上の64文字>'
   ```

2. ダッシュボード → **Database** → **Extensions** で `pg_cron` と `pg_net` を有効にします。
3. **SQL Editor** で次を実行します（`<...>` は置き換え。合言葉は手順1と同じ値）。

   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<手順1の64文字>', 'reminder_cron_secret');
   ```

4. リポジトリの `supabase/manual/schedule_weigh_in_reminders.sql` の中身を SQL Editor に貼り付けて実行します（1回だけ）。
5. 数分後、SQL Editor で `select * from cron.job_run_details order by start_time desc limit 5;` を実行し、`succeeded` になっていることを確認します。
   - 失敗している場合は、その行の `return_message` を開発側に共有してください。合言葉そのものは共有しないでください。

**動作確認（実機）**

1. アプリで **マイページ** → **通知設定** → **体重の記録リマインダー** を ON にし、通知を許可します。
2. 今日の体重記録を削除し、時刻を「今から5〜10分後」に設定します。
3. アプリを閉じて待ち、通知が1回だけ届くことを確認します。iPhone はアイコンに「1」が付きます。
4. 通知をタップすると体重入力画面が開くこと、記録するとアイコンの「1」が消えることを確認します。
5. 翌日以降、体重を先に記録した日は通知が届かないことを確認します。

## 8. 実機テスト（結果を開発側に共有してください）

- 通知：docs/QA_CHECKLIST.md §4 の項目（体重リマインダーを含む）
- 課金：docs/BILLING.md §6 の12項目（iOS は Sandbox テスター、Android はライセンステスター）
- Supabase：docs/SUPABASE_SETUP.md §7 の項目
- 結果は「項目・端末（機種/OS）・OK/NG・NGなら画面の様子」を箇条書きで送ってください。スクリーンショットに個人情報や秘密情報が写っていないか確認してから送ってください。

## 9. 公開前に決めること・用意するもの

- 利用規約・プライバシーポリシーの確定版（文案は開発側で作成可）と、公開URL（Webページ）
  - App Store では、購入画面から利用規約（EULA）とプライバシーポリシーへのリンクが必要です。
- お問い合わせ窓口（メールアドレスまたはフォーム）
- 目標カロリーの推定式、METs値の確認（栄養・運動の専門家レビューを推奨）
- アプリアイコン・スクリーンショット・ストア説明文（Phase 8）
- **ストアへの申請・公開のタイミング**（あなたの明示的な許可があるまで行いません）
