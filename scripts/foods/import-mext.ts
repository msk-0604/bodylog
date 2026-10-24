#!/usr/bin/env node
/**
 * Imports the 日本食品標準成分表 Excel (本表) into food_master.
 *
 *   node scripts/foods/import-mext.ts --input <本表.xlsx> --version "<edition label>" \
 *     [--sheet <name>] [--out food_master.sql] [--report report.json] [--expect-count N]
 *
 * Then apply the SQL with the service role (never from the app), e.g.
 *   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f food_master.sql
 *
 * Full procedure, source and terms of use: docs/FOOD_DATA.md
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { parseMextRows, toSql } from './mext.ts';

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: 'string' },
      version: { type: 'string' },
      sheet: { type: 'string' },
      out: { type: 'string', default: 'food_master.sql' },
      report: { type: 'string', default: 'food_master_report.json' },
      /** published number of foods; the run fails if the parsed count differs */
      'expect-count': { type: 'string' },
    },
  });
  if (!values.input || !values.version) {
    console.error('Usage: --input <xlsx> --version "<edition>" [--sheet <name>] [--out file.sql]');
    process.exit(2);
  }

  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  // exceljs' Buffer typing predates Node's generic Buffer; the runtime value is a Buffer.
  const bytes = await readFile(values.input);
  // recorded in the report so the applied data can be traced to the exact downloaded file
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await wb.xlsx.load(bytes as never);
  const ws = values.sheet ? wb.getWorksheet(values.sheet) : wb.worksheets[0];
  if (!ws) throw new Error(`sheet not found: ${values.sheet ?? '(first)'}`);

  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    // exceljs row.values is 1-based (index 0 is empty)
    rows[n - 1] = (row.values as unknown[]).slice(1);
  });
  for (let i = 0; i < rows.length; i++) rows[i] ??= [];

  const result = parseMextRows(rows, values.version);
  await writeFile(values.out, toSql(result.foods, values.version));
  await writeFile(
    values.report,
    JSON.stringify(
      {
        sourceVersion: values.version,
        input: values.input,
        sha256,
        sheet: ws.name,
        foods: result.foods.length,
        flagCounts: result.flagCounts,
        skipped: result.skipped,
      },
      null,
      2,
    ),
  );
  console.log(
    `foods: ${result.foods.length}, skipped: ${result.skipped.length}, flags: ${JSON.stringify(result.flagCounts)}`,
  );
  console.log(`wrote ${values.out} and ${values.report}`);
  if (result.skipped.length > 0) {
    console.log('Review skipped rows in the report before applying the SQL.');
  }
  if (values['expect-count'] && Number(values['expect-count']) !== result.foods.length) {
    console.error(
      `expected ${values['expect-count']} foods but parsed ${result.foods.length}: do not apply this SQL`,
    );
    process.exit(3);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
