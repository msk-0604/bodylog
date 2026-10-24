// Fictional rows that mimic the layout of the 本表 (NOT real 成分表 values).
import { foodId, parseCellValue, parseMextRows, toSql } from '../mext';

const ROWS: unknown[][] = [
  ['日本食品標準成分表（テスト用ダミー）'],
  [],
  [
    '食品群',
    '食品番号',
    '索引番号',
    '食品名',
    '廃棄率',
    'エネルギー',
    'エネルギー',
    '水分',
    'たんぱく質',
    '脂質',
    '炭水化物',
  ],
  ['', '', '', '', '%', 'kJ', 'kcal', 'g', 'g', 'g', 'g'],
  ['', '成分識別子', '', '', 'REFUSE', 'ENERC', 'ENERC_KCAL', 'WATER', 'PROT-', 'FAT-', 'CHOCDF-'],
  ['01', '01001', '1', 'テスト穀物　めし', 0, 600, 150, 60, 2.5, '(0.3)', 35.1],
  ['01', '1002', '2', 'テスト穀物 かゆ', 0, 270, 65, 83, 1.1, 'Tr', '(15.6)'],
  [
    '12',
    '12004',
    '3',
    { richText: [{ text: 'テスト卵 ' }, { text: '全卵 生' }] },
    14,
    590,
    142,
    75,
    12.2,
    10.2,
    '-',
  ],
  ['※ 注記行'],
  ['12', '12005', '4', 'テスト卵 不明表記', 0, 0, '*', 0, 0, 0, 0],
];

describe('parseCellValue', () => {
  it('handles the table notation without guessing', () => {
    expect(parseCellValue(12.3)).toEqual({ value: 12.3, flag: null });
    expect(parseCellValue('-')).toEqual({ value: null, flag: 'missing' });
    expect(parseCellValue('Tr')).toEqual({ value: 0, flag: 'trace' });
    expect(parseCellValue('(Tr)')).toEqual({ value: 0, flag: 'trace' });
    expect(parseCellValue('(0)')).toEqual({ value: 0, flag: 'zero_estimated' });
    expect(parseCellValue('（１．２）')).toEqual({ value: 1.2, flag: 'estimated' });
    expect(parseCellValue(null)).toEqual({ value: null, flag: 'missing' });
    expect(() => parseCellValue('*')).toThrow();
  });
});

describe('parseMextRows', () => {
  const r = parseMextRows(ROWS, 'test-edition');
  it('locates columns by component identifiers and parses rows', () => {
    expect(r.foods.map((f) => f.food_code)).toEqual(['01001', '01002', '12004']);
    expect(r.foods[0]).toMatchObject({
      name: 'テスト穀物 めし',
      search_text: 'てすと穀物めし',
      category_name: '穀類',
      energy_kcal: 150,
      protein_g: 2.5,
      fat_g: 0.3,
      carbohydrate_g: 35.1,
      value_flags: { fat_g: 'estimated' },
      source_version: 'test-edition',
    });
    expect(r.foods[1]).toMatchObject({
      fat_g: 0,
      value_flags: { fat_g: 'trace', carbohydrate_g: 'estimated' },
    });
    expect(r.foods[2]).toMatchObject({
      name: 'テスト卵 全卵 生',
      carbohydrate_g: null,
      category_name: '卵類',
    });
  });
  it('skips (and reports) rows with unknown notation instead of guessing', () => {
    expect(r.skipped).toEqual([{ row: 10, reason: expect.stringContaining('12005') }]);
  });
  it('uses stable ids per food code', () => {
    expect(r.foods[0]!.id).toBe(foodId('01001'));
    expect(foodId('01001')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(foodId('01001')).not.toBe(foodId('01002'));
  });
  it('fails clearly when the identifier row is missing', () => {
    expect(() => parseMextRows([['食品番号', '食品名']], 'x')).toThrow(/ENERC_KCAL/);
  });
  it('generates idempotent SQL', () => {
    const sql = toSql(r.foods, 'test-edition');
    expect(sql).toContain('on conflict (id) do update');
    expect(sql).toContain("source_version <> 'test-edition'");
    expect(sql).toContain('\'{"fat_g":"estimated"}\'::jsonb');
  });
});
