/**
 * Parser for the 日本食品標準成分表 (MEXT) Excel "本表".
 *
 * Columns are located by the component identifier row (INFOODS tagnames) instead of fixed
 * positions, so small layout differences between editions don't silently shift values:
 *   ENERC_KCAL エネルギー(kcal) / PROT- たんぱく質 / FAT- 脂質 / CHOCDF- 炭水化物
 * See docs/FOOD_DATA.md for the value conventions.
 */
import { createHash } from 'node:crypto';

import { normalizeForSearch } from '../../src/domain/searchNormalize.ts';

export type ValueFlag = 'trace' | 'estimated' | 'missing' | 'zero_estimated';
export type ParsedValue = { value: number | null; flag: ValueFlag | null };

export const NUTRIENT_TAGS = {
  energy_kcal: 'ENERC_KCAL',
  protein_g: 'PROT-',
  fat_g: 'FAT-',
  carbohydrate_g: 'CHOCDF-',
} as const;
export type NutrientColumn = keyof typeof NUTRIENT_TAGS;

/** 食品群 (food groups) of the 八訂 tables. */
export const FOOD_GROUPS: Record<string, string> = {
  '01': '穀類',
  '02': 'いも及びでん粉類',
  '03': '砂糖及び甘味類',
  '04': '豆類',
  '05': '種実類',
  '06': '野菜類',
  '07': '果実類',
  '08': 'きのこ類',
  '09': '藻類',
  '10': '魚介類',
  '11': '肉類',
  '12': '卵類',
  '13': '乳類',
  '14': '油脂類',
  '15': '菓子類',
  '16': 'し好飲料類',
  '17': '調味料及び香辛料類',
  '18': '調理済み流通食品類',
};

/**
 * Cell conventions of the source table:
 *   number      → value
 *   "-"         → 未測定 (missing): null, never 0
 *   "Tr"        → 微量 (trace): 0 with flag
 *   "(Tr)"      → 微量と推定: 0 with flag
 *   "(0)"       → 推定値 0
 *   "(1.2)"     → 推定値 1.2
 *   ""/null     → missing
 * Anything else throws so that unexpected notation is reviewed instead of guessed.
 */
export function parseCellValue(raw: unknown): ParsedValue {
  if (raw === null || raw === undefined) return { value: null, flag: 'missing' };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) throw new Error(`invalid number: ${raw}`);
    return { value: raw, flag: null };
  }
  const t = String(raw).normalize('NFKC').replace(/\s/g, '');
  if (t === '' || t === '-' || t === '−' || t === '‐') return { value: null, flag: 'missing' };
  if (/^tr$/i.test(t) || /^\(tr\)$/i.test(t)) return { value: 0, flag: 'trace' };
  if (t === '(0)') return { value: 0, flag: 'zero_estimated' };
  let m = /^\((\d+(?:\.\d+)?)\)$/.exec(t);
  if (m) return { value: Number(m[1]), flag: 'estimated' };
  m = /^(\d+(?:\.\d+)?)$/.exec(t);
  if (m) return { value: Number(m[1]), flag: null };
  throw new Error(`unknown cell notation: "${String(raw)}"`);
}

export type FoodRow = {
  id: string;
  food_code: string;
  name: string;
  search_text: string;
  category_code: string;
  category_name: string;
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbohydrate_g: number | null;
  value_flags: Partial<Record<NutrientColumn, ValueFlag>>;
  source: string;
  source_version: string;
};

/** Stable id per 食品番号 so favorites/templates keep working across data updates. */
export function foodId(foodCode: string): string {
  const h = createHash('sha1').update(`bodylog:mext:${foodCode}`).digest('hex');
  // RFC 4122 layout (version 5 / variant 10xx)
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v !== null && 'richText' in v) {
    return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join('');
  }
  if (typeof v === 'object' && v !== null && 'result' in v)
    return cellText((v as { result: unknown }).result);
  return String(v);
}

function cellRaw(v: unknown): unknown {
  if (typeof v === 'object' && v !== null && 'richText' in v) return cellText(v);
  if (typeof v === 'object' && v !== null && 'result' in v)
    return (v as { result: unknown }).result;
  return v;
}

export type ParseResult = {
  foods: FoodRow[];
  skipped: { row: number; reason: string }[];
  flagCounts: Record<ValueFlag, number>;
};

/**
 * @param rows  worksheet rows as arrays of cell values (index 0 = column A)
 */
export function parseMextRows(
  rows: readonly (readonly unknown[])[],
  sourceVersion: string,
): ParseResult {
  const find = (pred: (cells: string[]) => boolean) =>
    rows.findIndex((r) => pred(r.map((c) => cellText(c).normalize('NFKC').replace(/\s/g, ''))));

  const tagRow = find((cells) => cells.includes(NUTRIENT_TAGS.energy_kcal));
  if (tagRow < 0) {
    throw new Error(
      '成分識別子の行（ENERC_KCAL を含む行）が見つかりません。本表のシートを指定してください。',
    );
  }
  const tags = rows[tagRow]!.map((c) => cellText(c).normalize('NFKC').replace(/\s/g, ''));
  const col: Record<NutrientColumn, number> = {
    energy_kcal: tags.indexOf(NUTRIENT_TAGS.energy_kcal),
    protein_g: tags.indexOf(NUTRIENT_TAGS.protein_g),
    fat_g: tags.indexOf(NUTRIENT_TAGS.fat_g),
    carbohydrate_g: tags.indexOf(NUTRIENT_TAGS.carbohydrate_g),
  };
  for (const [k, i] of Object.entries(col)) {
    if (i < 0)
      throw new Error(`成分識別子 ${NUTRIENT_TAGS[k as NutrientColumn]} の列が見つかりません`);
  }

  const headerRow = find((cells) => cells.includes('食品番号') && cells.includes('食品名'));
  if (headerRow < 0) throw new Error('「食品番号」「食品名」の見出し行が見つかりません');
  const headers = rows[headerRow]!.map((c) => cellText(c).normalize('NFKC').replace(/\s/g, ''));
  const codeCol = headers.indexOf('食品番号');
  const nameCol = headers.indexOf('食品名');

  const foods: FoodRow[] = [];
  const skipped: ParseResult['skipped'] = [];
  const flagCounts: Record<ValueFlag, number> = {
    trace: 0,
    estimated: 0,
    missing: 0,
    zero_estimated: 0,
  };
  const seen = new Set<string>();

  for (let i = Math.max(tagRow, headerRow) + 1; i < rows.length; i++) {
    const r = rows[i]!;
    const codeText = cellText(r[codeCol]).normalize('NFKC').trim();
    if (!/^\d{4,5}$/.test(codeText)) continue; // notes, blank lines, sub headers
    const foodCode = codeText.padStart(5, '0');
    const name = cellText(r[nameCol]).replace(/\s+/g, ' ').trim();
    if (!name) {
      skipped.push({ row: i + 1, reason: '食品名が空' });
      continue;
    }
    if (seen.has(foodCode)) {
      skipped.push({ row: i + 1, reason: `食品番号の重複 ${foodCode}` });
      continue;
    }
    try {
      const values = {} as Record<NutrientColumn, number | null>;
      const flags: FoodRow['value_flags'] = {};
      for (const k of Object.keys(col) as NutrientColumn[]) {
        const p = parseCellValue(cellRaw(r[col[k]]));
        values[k] = p.value;
        if (p.flag) {
          flags[k] = p.flag;
          flagCounts[p.flag]++;
        }
      }
      const group = foodCode.slice(0, 2);
      seen.add(foodCode);
      foods.push({
        id: foodId(foodCode),
        food_code: foodCode,
        name,
        search_text: normalizeForSearch(name),
        category_code: group,
        category_name: FOOD_GROUPS[group] ?? 'その他',
        ...values,
        value_flags: flags,
        source: 'mext',
        source_version: sourceVersion,
      });
    } catch (e) {
      skipped.push({ row: i + 1, reason: `${foodCode}: ${(e as Error).message}` });
    }
  }
  return { foods, skipped, flagCounts };
}

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;
const sqlNum = (n: number | null) => (n === null ? 'null' : String(n));

/** Idempotent SQL: upsert by stable id, then deactivate foods missing from this edition. */
export function toSql(foods: readonly FoodRow[], sourceVersion: string, batch = 500): string {
  const out: string[] = ['begin;'];
  for (let i = 0; i < foods.length; i += batch) {
    const values = foods
      .slice(i, i + batch)
      .map(
        (f) =>
          `(${[
            sqlStr(f.id),
            sqlStr(f.food_code),
            sqlStr(f.name),
            sqlStr(f.search_text),
            sqlStr(f.category_code),
            sqlStr(f.category_name),
            sqlNum(f.energy_kcal),
            sqlNum(f.protein_g),
            sqlNum(f.fat_g),
            sqlNum(f.carbohydrate_g),
            `${sqlStr(JSON.stringify(f.value_flags))}::jsonb`,
            sqlStr(f.source),
            sqlStr(f.source_version),
            'true',
          ].join(', ')})`,
      );
    out.push(
      `insert into public.food_master (id, food_code, name, search_text, category_code, category_name,
  energy_kcal, protein_g, fat_g, carbohydrate_g, value_flags, source, source_version, is_active)
values
  ${values.join(',\n  ')}
on conflict (id) do update set
  food_code = excluded.food_code, name = excluded.name, search_text = excluded.search_text,
  category_code = excluded.category_code, category_name = excluded.category_name,
  energy_kcal = excluded.energy_kcal, protein_g = excluded.protein_g, fat_g = excluded.fat_g,
  carbohydrate_g = excluded.carbohydrate_g, value_flags = excluded.value_flags,
  source = excluded.source, source_version = excluded.source_version, is_active = true;`,
    );
  }
  out.push(
    `update public.food_master set is_active = false
  where source = 'mext' and source_version <> ${sqlStr(sourceVersion)} and is_active;`,
  );
  out.push('commit;');
  return out.join('\n\n') + '\n';
}
