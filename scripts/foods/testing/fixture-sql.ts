// Prints food_master SQL generated from fictional rows (NOT real 成分表 values) for DB tests.
import { parseMextRows, toSql } from '../mext.ts';

const rows: unknown[][] = [
  ['食品群', '食品番号', '索引番号', '食品名'],
  ['', '成分識別子', '', '', 'ENERC_KCAL', 'PROT-', 'FAT-', 'CHOCDF-'],
  ['01', '01901', '1', 'フィクスチャ穀物 めし', 150, 2.5, '(0.3)', 35.1],
  ['12', '12901', '2', 'フィクスチャ卵 まるごと', 142, 12.2, 'Tr', '-'],
];
const { foods } = parseMextRows(rows, process.argv[2] ?? 'fixture-v1');
process.stdout.write(toSql(foods, process.argv[2] ?? 'fixture-v1'));
