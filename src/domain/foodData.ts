/**
 * Food data source information shown in the app (マイページ > データ出典).
 * Keep in sync with docs/FOOD_DATA.md. The exact edition is taken from the imported data
 * (food_master.source_version); confirm the attribution wording against MEXT's terms of use
 * before release.
 */
export const FOOD_DATA_SOURCE_NAME = '文部科学省「日本食品標準成分表」';

export const FOOD_DATA_ATTRIBUTION: string[] = [
  `食品の栄養成分値は、${FOOD_DATA_SOURCE_NAME}のデータを加工して作成しています。`,
  '値は可食部100gあたりの成分値をもとに、入力した重量で計算しています。表示している値は目安であり、実際の食品の成分値とは異なる場合があります。',
  '「Tr」（微量）は0として計算し、成分表で未測定（-）の値は不明として合計に含めません。',
  'ユーザーが登録した食品（マイ食品）の値は、登録したユーザーが入力したものです。',
];

/** Display label for a value flag from the source table. */
export const VALUE_FLAG_LABELS = {
  trace: '微量（Tr）',
  estimated: '推定値',
  missing: '未測定',
  zero_estimated: '推定値（0）',
} as const;
