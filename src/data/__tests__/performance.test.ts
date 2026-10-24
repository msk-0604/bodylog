/**
 * One year of heavy use on one device (≈ 5,000 records) stays fast for the screens' queries.
 * Thresholds are generous (CI machines vary); typical times are printed for the QA log.
 * node:sqlite here; on-device expo-sqlite timings must still be checked on real hardware.
 */
import { addDays, parseDateKey, type DateKey } from '@/domain/date';

import { createTestDb } from '../db/testing/nodeDb';
import type { SqlDb, SqlValue } from '../db/types';
import { addWeight, listWeights } from '../repo/body';
import { addExercise, listExercises } from '../repo/exercise';
import { cacheMasterFoods, getFood, type MasterFoodRow } from '../repo/foods';
import { addMealItems, listMealItems } from '../repo/meals';
import { dayMarks } from '../repo/settings';
import { countPending, syncOnce } from '../sync/syncEngine';
import { FakeRemote } from '../sync/testing/fakeRemote';

const U = '11111111-1111-4111-8111-111111111111';
const END = parseDateKey('2026-10-24');
const DAYS = 365;

// Fictional test food (NOT a real 成分表 value)
const FOOD: MasterFoodRow = {
  id: '00000000-0000-4000-8000-000000000001',
  food_code: 'T0001',
  name: 'テスト穀物 めし',
  category_code: '01',
  category_name: '穀類',
  energy_kcal: 150,
  protein_g: 2,
  fat_g: 0.5,
  carbohydrate_g: 35,
  value_flags: {},
  source_version: 'test-v1',
};

let db: SqlDb & { close(): void };
const timings: Record<string, number> = {};

async function time<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t = performance.now();
  const r = await fn();
  timings[name] = Math.round(performance.now() - t);
  return r;
}

beforeAll(async () => {
  db = await createTestDb();
  await cacheMasterFoods(db, [FOOD]);
  const food = (await getFood(db, U, { source: 'master', id: FOOD.id }))!;
  await time('seed', async () => {
    for (let i = 0; i < DAYS; i++) {
      const date = addDays(END, -i) as DateKey;
      const [y, m, d] = date.split('-').map(Number) as [number, number, number];
      // 4 meals × 3 items, 1 weight, an exercise every other day
      await addMealItems(
        db,
        U,
        (['breakfast', 'lunch', 'dinner', 'snack'] as const).flatMap((mealType) =>
          [100, 150, 200].map((grams) => ({ date, mealType, food, grams })),
        ),
      );
      await addWeight(db, U, {
        weightKg: 70 - i * 0.01,
        bodyFatPct: 20,
        measuredAt: new Date(y, m - 1, d, 7),
      });
      if (i % 2 === 0) {
        await addExercise(db, U, {
          type: 'walking',
          name: 'ウォーキング',
          performedAt: new Date(y, m - 1, d, 18),
          durationMin: 30,
          kcal: 120,
          kcalIsEstimated: true,
          mets: 3,
          note: '',
          sets: [],
        });
      }
    }
  });
}, 120_000);

afterAll(() => {
  db.close();
  console.log(`1-year dataset timings (ms): ${JSON.stringify(timings)}`);
});

it('reads a day, a month of calendar marks and the full weight history quickly', async () => {
  const items = await time('listMealItems(day)', () => listMealItems(db, U, END));
  expect(items).toHaveLength(12);
  const from = addDays(END, -30);
  const marks = await time('dayMarks(month)', () => dayMarks(db, U, from, END));
  expect(marks.size).toBe(31);
  const weights = await time('listWeights(all)', () => listWeights(db, U));
  expect(weights).toHaveLength(DAYS);
  const ex = await time('listExercises(week)', () =>
    listExercises(db, U, { from: addDays(END, -6), to: END }),
  );
  expect(ex.length).toBe(4);
  const pending = await time('countPending', () => countPending(db, U));
  expect(pending.pending).toBeGreaterThan(5_000);

  for (const k of [
    'listMealItems(day)',
    'dayMarks(month)',
    'listWeights(all)',
    'listExercises(week)',
    'countPending',
  ]) {
    expect(timings[k]).toBeLessThan(500);
  }
});

it('uses indexes for the per-day queries', async () => {
  const plan = async (sql: string, params: SqlValue[]) =>
    (await db.all<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`, params))
      .map((r) => r.detail)
      .join(' | ');
  expect(
    await plan('SELECT * FROM meal_entries WHERE user_id = ? AND eaten_on = ?', [U, END]),
  ).toMatch(/USING INDEX meal_entries_user_day/);
  expect(await plan('SELECT * FROM meal_items WHERE meal_entry_id = ?', ['x'])).toMatch(
    /USING INDEX meal_items_entry/,
  );
  expect(
    await plan(
      'SELECT * FROM exercise_entries WHERE user_id = ? AND performed_on BETWEEN ? AND ?',
      [U, END, END],
    ),
  ).toMatch(/USING INDEX exercise_entries_user_day/);
});

it('pushes a year of offline records in batches and is idempotent', async () => {
  const remote = new FakeRemote();
  remote.foods.set(FOOD.id, FOOD);
  await time('syncOnce(push all)', () => syncOnce(db, remote, U));
  expect((await countPending(db, U)).pending).toBe(0);
  expect(remote.table('meal_items').size).toBe(DAYS * 12);
  const calls = remote.calls;
  expect(calls).toBeLessThan(200); // batched, not one request per row
  await syncOnce(db, remote, U); // nothing left to send
  expect(remote.table('meal_items').size).toBe(DAYS * 12);
  timings['remoteCalls'] = calls;
}, 60_000);
