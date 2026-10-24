import { parseDateKey } from '@/domain/date';

import { createTestDb } from '../db/testing/nodeDb';
import type { SqlDb } from '../db/types';
import { addWeight, deleteWeight, listWeights, updateWeight } from '../repo/body';
import {
  addFavorite,
  countFavorites,
  isFavorite,
  listFavorites,
  moveFavorite,
  removeFavorite,
} from '../repo/favorites';
import {
  cacheMasterFoods,
  createCustomFood,
  getFood,
  missingReferencedMasterFoodIds,
  recentFoods,
  searchLocalFoods,
  type FoodRecord,
  type MasterFoodRow,
} from '../repo/foods';
import {
  addMealItem,
  copyMeals,
  datesWithMeals,
  deleteMealItem,
  getMealItem,
  listMealItems,
  updateMealItem,
} from '../repo/meals';
import { getGoalForDate, getProfile, saveGoal, saveProfile } from '../repo/profile';
import {
  applyTemplate,
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  removeTemplateItem,
  renameTemplate,
  setTemplateItemGrams,
} from '../repo/templates';

// Fictional test foods (NOT real 成分表 values).
const MASTER: MasterFoodRow[] = [
  {
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
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    food_code: 'T0002',
    name: 'テスト卵 全卵 生',
    category_code: '12',
    category_name: '卵類',
    energy_kcal: 140,
    protein_g: 12,
    fat_g: null,
    carbohydrate_g: 0.4,
    value_flags: { fat_g: 'missing' },
    source_version: 'test-v1',
  },
];

const U = 'user-a';
const OTHER = 'user-b';
const D1 = parseDateKey('2026-10-23');
const D2 = parseDateKey('2026-10-24');

let db: SqlDb & { close(): void };
let rice: FoodRecord;
let egg: FoodRecord;

beforeEach(async () => {
  db = await createTestDb();
  await cacheMasterFoods(db, MASTER);
  rice = (await getFood(db, U, { source: 'master', id: MASTER[0]!.id }))!;
  egg = (await getFood(db, U, { source: 'master', id: MASTER[1]!.id }))!;
});
afterEach(() => db.close());

const dirtyCount = async (table: string) =>
  Number(
    (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE rev > synced_rev`))?.n,
  );

describe('foods', () => {
  it('searches cached master foods with kana/width normalization', async () => {
    expect((await searchLocalFoods(db, U, 'めし')).map((f) => f.id)).toEqual([rice.id]);
    expect((await searchLocalFoods(db, U, 'ﾃｽﾄ')).length).toBe(2);
    expect(await searchLocalFoods(db, U, '%')).toEqual([]);
    expect(await searchLocalFoods(db, U, '   ')).toEqual([]);
  });

  it('keeps unknown nutrient values as null with flags', () => {
    expect(egg.per100g.fatG).toBeNull();
    expect(egg.valueFlags.fatG).toBe('missing');
  });

  it('creates custom foods visible only to the owner', async () => {
    const f = await createCustomFood(db, U, {
      name: 'コンビニおにぎり',
      per100g: { energyKcal: 170, proteinG: 3, fatG: 1, carbohydrateG: 38 },
      serving: { label: '1個', grams: 110 },
    });
    expect(f.serving).toEqual({ label: '1個', grams: 110 });
    expect((await searchLocalFoods(db, U, 'おにぎり')).length).toBe(1);
    expect((await searchLocalFoods(db, OTHER, 'おにぎり')).length).toBe(0);
    expect(await dirtyCount('custom_foods')).toBe(1);
  });
});

describe('meals', () => {
  it('adds an item with a nutrient snapshot and reuses the entry', async () => {
    await addMealItem(db, U, { date: D2, mealType: 'breakfast', food: rice, grams: 150 });
    await addMealItem(db, U, { date: D2, mealType: 'breakfast', food: egg, grams: 50 });
    const items = await listMealItems(db, U, D2);
    expect(items).toHaveLength(2);
    expect(items[0]!.nutrients).toEqual({
      energyKcal: 225,
      proteinG: 3,
      fatG: 0.8,
      carbohydrateG: 52.5,
    });
    expect(items[1]!.nutrients.fatG).toBeNull();
    expect(new Set(items.map((i) => i.entryId)).size).toBe(1);
    expect(await listMealItems(db, OTHER, D2)).toEqual([]);
  });

  it('snapshot does not change when the food master changes', async () => {
    const id = await addMealItem(db, U, { date: D2, mealType: 'lunch', food: rice, grams: 100 });
    await cacheMasterFoods(db, [{ ...MASTER[0]!, energy_kcal: 999, source_version: 'test-v2' }]);
    expect((await getMealItem(db, U, id))!.nutrients.energyKcal).toBe(150);
    // grams change with a different data version scales the original snapshot
    await updateMealItem(db, U, id, { grams: 200 });
    expect((await getMealItem(db, U, id))!.nutrients.energyKcal).toBe(300);
  });

  it('recalculates on grams change and moves between meal types/dates', async () => {
    const id = await addMealItem(db, U, {
      date: D2,
      mealType: 'breakfast',
      food: rice,
      grams: 100,
    });
    await updateMealItem(db, U, id, { grams: 250 });
    let item = (await getMealItem(db, U, id))!;
    expect(item.grams).toBe(250);
    expect(item.nutrients.energyKcal).toBe(375);

    await updateMealItem(db, U, id, { mealType: 'dinner', date: D1 });
    item = (await getMealItem(db, U, id))!;
    expect(item.mealType).toBe('dinner');
    expect(item.date).toBe(D1);
    // the emptied breakfast entry is soft-deleted
    const live = await db.all<{ meal_type: string }>(
      'SELECT meal_type FROM meal_entries WHERE deleted_at IS NULL',
    );
    expect(live.map((e) => e.meal_type)).toEqual(['dinner']);
  });

  it('rejects invalid grams', async () => {
    await expect(
      addMealItem(db, U, { date: D2, mealType: 'lunch', food: rice, grams: 0 }),
    ).rejects.toThrow(RangeError);
  });

  it('deletes softly and cleans up empty entries', async () => {
    const id = await addMealItem(db, U, { date: D2, mealType: 'snack', food: egg, grams: 60 });
    await deleteMealItem(db, U, id);
    expect(await listMealItems(db, U, D2)).toEqual([]);
    const tomb = await db.get<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM meal_items WHERE id = ?',
      [id],
    );
    expect(tomb!.deleted_at).not.toBeNull();
    // other users cannot delete
    const id2 = await addMealItem(db, U, { date: D2, mealType: 'snack', food: egg, grams: 60 });
    await deleteMealItem(db, OTHER, id2);
    expect(await listMealItems(db, U, D2)).toHaveLength(1);
  });

  it('copies the previous day (whole day or one meal type)', async () => {
    await addMealItem(db, U, { date: D1, mealType: 'breakfast', food: rice, grams: 150 });
    await addMealItem(db, U, { date: D1, mealType: 'dinner', food: egg, grams: 100 });
    expect(await copyMeals(db, U, { from: D1, to: D2 })).toBe(2);
    expect(
      await copyMeals(db, U, { from: D1, to: D2, mealType: 'dinner', toMealType: 'lunch' }),
    ).toBe(1);
    const items = await listMealItems(db, U, D2);
    expect(items.map((i) => i.mealType).sort()).toEqual(['breakfast', 'dinner', 'lunch']);
    expect(items.find((i) => i.mealType === 'breakfast')!.nutrients.energyKcal).toBe(225);
    expect(await datesWithMeals(db, U, D1, D2)).toEqual([D1, D2]);
  });

  it('lists recent foods newest first, distinct', async () => {
    await addMealItem(db, U, { date: D1, mealType: 'breakfast', food: rice, grams: 150 });
    await new Promise((r) => setTimeout(r, 5));
    await addMealItem(db, U, { date: D2, mealType: 'breakfast', food: egg, grams: 50 });
    await new Promise((r) => setTimeout(r, 5));
    await addMealItem(db, U, { date: D2, mealType: 'lunch', food: egg, grams: 50 });
    expect((await recentFoods(db, U)).map((f) => f.name)).toEqual([egg.name, rice.name]);
  });
});

describe('favorites', () => {
  it('enforces the free limit of 10 and allows premium', async () => {
    for (let i = 0; i < 10; i++) {
      const f = await createCustomFood(db, U, {
        name: `food${i}`,
        per100g: { energyKcal: 100, proteinG: 1, fatG: 1, carbohydrateG: 1 },
        serving: null,
      });
      expect(await addFavorite(db, U, { source: 'custom', id: f.id }, 'free')).toEqual({
        ok: true,
      });
    }
    expect(await addFavorite(db, U, { source: 'master', id: rice.id }, 'free')).toEqual({
      ok: false,
      reason: 'limit',
    });
    expect(await addFavorite(db, U, { source: 'master', id: rice.id }, 'premium')).toEqual({
      ok: true,
    });
    expect(await countFavorites(db, U)).toBe(11);
  });

  it('toggles and reorders', async () => {
    await addFavorite(db, U, { source: 'master', id: rice.id }, 'free');
    await addFavorite(db, U, { source: 'master', id: rice.id }, 'free'); // idempotent
    await addFavorite(db, U, { source: 'master', id: egg.id }, 'free');
    expect(await countFavorites(db, U)).toBe(2);
    const [first, second] = await listFavorites(db, U);
    await moveFavorite(db, U, second!.id, -1);
    expect((await listFavorites(db, U)).map((f) => f.id)).toEqual([second!.id, first!.id]);
    await removeFavorite(db, U, { source: 'master', id: rice.id });
    expect(await isFavorite(db, U, { source: 'master', id: rice.id })).toBe(false);
    expect(await countFavorites(db, U)).toBe(1);
  });
});

describe('templates', () => {
  it('creates (free: 1), edits, applies and deletes', async () => {
    const r = await createTemplate(db, U, 'free', {
      name: 'いつもの朝食',
      defaultMealType: 'breakfast',
      items: [
        { food: rice, grams: 150 },
        { food: egg, grams: 100 },
      ],
    });
    expect(r.ok).toBe(true);
    const id = (r as { id: string }).id;
    expect(
      await createTemplate(db, U, 'free', { name: '2', defaultMealType: null, items: [] }),
    ).toEqual({
      ok: false,
      reason: 'limit',
    });

    let t = (await getTemplate(db, U, id))!;
    expect(t.items).toHaveLength(2);
    expect(t.energyKcal).toBe(365);

    await renameTemplate(db, U, id, '朝のセット');
    await setTemplateItemGrams(db, U, t.items[0]!.id, 200);
    await removeTemplateItem(db, U, t.items[1]!.id);
    t = (await getTemplate(db, U, id))!;
    expect(t.name).toBe('朝のセット');
    expect(t.items.map((i) => i.grams)).toEqual([200]);

    expect(await applyTemplate(db, U, id, D2, 'breakfast')).toEqual({ added: 1, skipped: [] });
    expect((await listMealItems(db, U, D2))[0]!.nutrients.energyKcal).toBe(300);

    await deleteTemplate(db, U, id);
    expect(await listTemplates(db, U)).toEqual([]);
  });

  it('reports referenced foods missing from cache', async () => {
    await createTemplate(db, U, 'free', {
      name: 'x',
      defaultMealType: null,
      items: [{ food: rice, grams: 100 }],
    });
    await db.run('DELETE FROM food_cache WHERE id = ?', [rice.id]);
    expect(await missingReferencedMasterFoodIds(db, U)).toEqual([rice.id]);
    const t = (await listTemplates(db, U))[0]!;
    expect(t.items[0]!.food).toBeNull();
  });
});

describe('weights, profile, goals', () => {
  it('persists weights with local date and validates', async () => {
    const id = await addWeight(db, U, {
      weightKg: 65.44,
      bodyFatPct: null,
      measuredAt: new Date(2026, 9, 24, 7),
    });
    let list = await listWeights(db, U);
    expect(list[0]).toMatchObject({ id, weightKg: 65.4, measuredOn: '2026-10-24' });
    await updateWeight(db, U, id, {
      weightKg: 65.0,
      bodyFatPct: 20,
      measuredAt: new Date(2026, 9, 24, 8),
    });
    list = await listWeights(db, U);
    expect(list[0]).toMatchObject({ weightKg: 65, bodyFatPct: 20 });
    await expect(
      addWeight(db, U, { weightKg: 5, bodyFatPct: null, measuredAt: new Date() }),
    ).rejects.toThrow();
    await deleteWeight(db, U, id);
    expect(await listWeights(db, U)).toEqual([]);
  });

  it('saves profile and goal history', async () => {
    await saveProfile(db, U, { nickname: 'たろう', height_cm: 170 });
    await saveProfile(db, U, { sex: 'male' });
    expect(await getProfile(db, U)).toMatchObject({
      nickname: 'たろう',
      heightCm: 170,
      sex: 'male',
    });

    const base = {
      goalType: 'lose' as const,
      proteinG: 100,
      fatG: 50,
      carbohydrateG: 250,
      startWeightKg: 70,
      targetWeightKg: 65,
      calorieSource: 'manual' as const,
    };
    await saveGoal(db, U, D1, { ...base, calorieKcal: 2000 });
    await saveGoal(db, U, D2, { ...base, calorieKcal: 1800 });
    await saveGoal(db, U, D2, { ...base, calorieKcal: 1850 }); // same day → update
    expect((await getGoalForDate(db, U, D1))!.calorieKcal).toBe(2000);
    expect((await getGoalForDate(db, U, D2))!.calorieKcal).toBe(1850);
    expect(await getGoalForDate(db, U, parseDateKey('2026-01-01'))).toBeNull();
    expect(
      Number((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM nutrition_goals'))!.n),
    ).toBe(2);
  });
});
