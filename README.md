# BODYLOG

「毎日の食事と体重を、最も簡単に記録できるアプリ」

日本国内向けの食事・体重・運動記録アプリ（iOS / Android）。AI機能は搭載しない。基本無料、Premium 月額350円（税込）。

> ステータス: **開発中（Phase 2・3 実装済み）**。認証・SQLite保存・同期・食品検索/食事記録が動作します（実Supabase・実機・成分表の実データは未検証）。進捗は [docs/TASKS.md](docs/TASKS.md)。

## ドキュメント

| ドキュメント                                   | 内容                                                |
| ---------------------------------------------- | --------------------------------------------------- |
| [docs/MVP_SPEC.md](docs/MVP_SPEC.md)           | MVP仕様（機能・無料/Premium・計算ルール・画面一覧） |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)   | 技術構成・ディレクトリ・データフロー・同期・課金    |
| [docs/DATABASE.md](docs/DATABASE.md)           | DB設計・RLS・インデックス・削除方針                 |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | カラー・タイポグラフィ・コンポーネント・a11y        |
| [docs/TASKS.md](docs/TASKS.md)                 | タスク一覧と進捗（常に最新）                        |

## 技術スタック（固定バージョン）

| 項目           | バージョン                                         |
| -------------- | -------------------------------------------------- |
| Expo SDK       | 58 (`expo@~58.0.19`)                               |
| React Native   | 0.88.0                                             |
| React          | 19.3.0                                             |
| TypeScript     | ~6.0.3（Expo SDK 58 の推奨に合わせる）             |
| Expo Router    | ~58.0.26                                           |
| Reanimated     | 4.7.1（+ react-native-worklets 0.13.0）            |
| TanStack Query | 5.104.5                                            |
| Zustand        | 5.0.16                                             |
| supabase-js    | 2.118.0（Phase 2 で接続）                          |
| RevenueCat     | 未導入（Phase 6, `react-native-purchases`）        |
| Jest / RNTL    | jest 30.5.2 / @testing-library/react-native 14.1.0 |

Expo モジュールは `npx expo install` で SDK 互換バージョンを解決しています（`node_modules/expo/bundledNativeModules.json`）。

## セットアップ

前提: Node.js 22 以上、npm。

```bash
npm ci
cp .env.example .env.local   # Supabase の URL / anon key（未設定なら開発用ローカルモード）
npm start                    # Expo 開発サーバー
```

食品マスタの取り込み：`npm run foods:import -- --input <本表.xlsx> --version "<版>"`（[docs/FOOD_DATA.md](docs/FOOD_DATA.md)）

ネイティブモジュール（expo-sqlite, expo-notifications, Reanimated 等）を使うため、実機/シミュレータでの確認は **Development Build** を推奨します。

```bash
npx eas-cli@latest build --profile development --platform ios   # EAS 設定は Phase 8 で追加予定
npx expo run:ios      # macOS + Xcode がある場合
npx expo run:android  # Android Studio がある場合
```

## 品質チェック

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # ESLint (eslint-config-expo)
npm run format:check  # Prettier
npm test              # Jest（単体・画面テスト）
npm run check         # 上記をまとめて実行

# DBマイグレーション + RLSテスト（PostgreSQL 16 が必要。指定DBサーバー上に bodylog_test を作り直します）
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run db:test   # Node 22 も必要
```

CI（GitHub Actions）で typecheck / lint / format / test / DBテストを実行します。

## 環境変数

[.env.example](.env.example) を参照。`EXPO_PUBLIC_*` はアプリに埋め込まれ利用者から見えるため、公開して良い値（Supabase anon key、RevenueCat 公開SDKキー）のみ設定します。**service_role キーなどの秘密情報はアプリ・リポジトリに含めないでください。**

## ライセンス

商用プロプライエタリ。無断転載・再配布を禁じます（オープンソースライセンスは付与していません）。
