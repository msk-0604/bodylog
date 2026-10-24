import { parseDateKey } from '@/domain/date';

import { createTestDb } from '../db/testing/nodeDb';
import type { SqlDb } from '../db/types';
import { addWeight, listWeights } from '../repo/body';
import { addFavorite, listFavorites } from '../repo/favorites';
import { cacheMasterFoods, createCustomFood, getFood, type MasterFoodRow } from '../repo/foods';
import { addMealItem, deleteMealItem, listMealItems, updateMealItem } from '../repo/meals';
import { getGoalForDate, getProfile, saveGoal, saveProfile } from '../repo/profile';
import { createTemplate, listTemplates } from '../repo/templates';
import { RemoteError } from '../sync/remote';
import { countPending, syncOnce } from '../sync/syncEngine';
import { FakeRemote } from '../sync/testing/fakeRemote';

const U = '11111111-1111-4111-8111-111111111111';
const D = parseDateKey('2026-10-24');

// Fictional test food (NOT a real 成分表 value)
const RICE: MasterFoodRow = {
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

let remote: FakeRemote;
let a: SqlDb & { close(): void }; // device A
let b: SqlDb & { close(): void }; // device B

beforeEach(async () => {
  remote = new FakeRemote();
  remote.foods.set(RICE.id, RICE);
  a = await createTestDb();
  b = await createTestDb();
  await cacheMasterFoods(a, [RICE]);
});
afterEach(() => {
  a.close();
  b.close();
});

const rice = async (db: SqlDb) => (await getFood(db, U, { source: 'master', id: RICE.id }))!;

describe('sync engine', () => {
  it('pushes local changes and clears the pending count', async () => {
    await addMealItem(a, U, { date: D, mealType: 'breakfast', food: await rice(a), grams: 150 });
    await addWeight(a, U, { weightKg: 65.4, bodyFatPct: null, measuredAt: new Date() });
    expect((await countPending(a, U)).pending).toBe(3);

    const r = await syncOnce(a, remote, U);
    expect(r.pushed).toBe(3);
    expect((await countPending(a, U)).pending).toBe(0);
    const item = [...remote.table('meal_items').values()][0]!;
    expect(item).toMatchObject({ user_id: U, grams: 150, energy_kcal: 225 });
    expect(item).not.toHaveProperty('rev');
    expect(item).not.toHaveProperty('synced_rev');
  });

  it('keeps data locally and retries after a network error', async () => {
    await addWeight(a, U, { weightKg: 70, bodyFatPct: null, measuredAt: new Date() });
    remote.failNext = 1;
    await expect(syncOnce(a, remote, U)).rejects.toBeInstanceOf(RemoteError);
    expect((await countPending(a, U)).pending).toBe(1);
    expect(await listWeights(a, U)).toHaveLength(1);
    await syncOnce(a, remote, U);
    expect((await countPending(a, U)).pending).toBe(0);
  });

  it('does not duplicate when a response is lost and the push is retried', async () => {
    await addWeight(a, U, { weightKg: 70, bodyFatPct: null, measuredAt: new Date() });
    remote.loseNextResponse = true;
    await expect(syncOnce(a, remote, U)).rejects.toBeInstanceOf(RemoteError);
    await syncOnce(a, remote, U);
    expect(remote.table('body_measurements').size).toBe(1);
  });

  it('syncs between two devices (last writer wins)', async () => {
    const id = await addMealItem(a, U, {
      date: D,
      mealType: 'lunch',
      food: await rice(a),
      grams: 100,
    });
    await syncOnce(a, remote, U);

    await syncOnce(b, remote, U); // new device: pulls data and caches referenced foods
    let onB = await listMealItems(b, U, D);
    expect(onB).toHaveLength(1);
    expect(onB[0]!.nutrients.energyKcal).toBe(150);
    expect(await getFood(b, U, { source: 'master', id: RICE.id })).not.toBeNull();

    await updateMealItem(b, U, id, { grams: 200 });
    await syncOnce(b, remote, U);
    await syncOnce(a, remote, U);
    expect((await listMealItems(a, U, D))[0]!.grams).toBe(200);
    onB = await listMealItems(b, U, D);
    expect(onB[0]!.grams).toBe(200);
  });

  it('does not overwrite unpushed local edits when pulling', async () => {
    const id = await addMealItem(a, U, {
      date: D,
      mealType: 'lunch',
      food: await rice(a),
      grams: 100,
    });
    await syncOnce(a, remote, U);
    await syncOnce(b, remote, U);
    await updateMealItem(b, U, id, { grams: 300 });
    await syncOnce(b, remote, U);
    // A edits locally before pulling B's change
    await updateMealItem(a, U, id, { grams: 120 });
    remote.failNext = 0;
    // pull-only would skip the row; full sync pushes A's later edit → A wins (last writer)
    await syncOnce(a, remote, U);
    expect((await listMealItems(a, U, D))[0]!.grams).toBe(120);
    await syncOnce(b, remote, U);
    expect((await listMealItems(b, U, D))[0]!.grams).toBe(120);
  });

  it('delete wins over a concurrent edit', async () => {
    const id = await addMealItem(a, U, {
      date: D,
      mealType: 'dinner',
      food: await rice(a),
      grams: 100,
    });
    await syncOnce(a, remote, U);
    await syncOnce(b, remote, U);
    await deleteMealItem(a, U, id);
    await syncOnce(a, remote, U);
    await updateMealItem(b, U, id, { grams: 250 }); // concurrent edit on B
    await syncOnce(b, remote, U);
    expect(await listMealItems(b, U, D)).toEqual([]);
    expect(remote.table('meal_items').get(id)!.deleted_at).toBeTruthy();
  });

  it('marks rows the server rejects (free-plan limit) and syncs the rest', async () => {
    for (let i = 0; i < 11; i++) {
      const f = await createCustomFood(a, U, {
        name: `f${i}`,
        per100g: { energyKcal: 1, proteinG: 1, fatG: 1, carbohydrateG: 1 },
        serving: null,
      });
      // device believed it was premium (e.g. stale state) — server is the authority
      await addFavorite(a, U, { source: 'custom', id: f.id }, 'premium');
    }
    const r = await syncOnce(a, remote, U);
    expect(r.rejected).toBe(1);
    expect(remote.table('food_favorites').size).toBe(10);
    const favs = await listFavorites(a, U);
    expect(favs.filter((f) => f.syncError === 'premium_required')).toHaveLength(1);
    expect(await countPending(a, U)).toEqual({ pending: 0, errors: 1 });
  });

  it('syncs profile, goals and templates', async () => {
    await saveProfile(a, U, {
      nickname: 'A',
      height_cm: 170,
      onboarding_completed_at: new Date().toISOString(),
    });
    await saveGoal(a, U, D, {
      goalType: 'lose',
      calorieKcal: 1800,
      proteinG: 90,
      fatG: 50,
      carbohydrateG: 250,
      startWeightKg: 70,
      targetWeightKg: 65,
      calorieSource: 'estimate',
    });
    await createTemplate(a, U, 'free', {
      name: 'いつもの',
      defaultMealType: 'breakfast',
      items: [{ food: await rice(a), grams: 150 }],
    });
    await syncOnce(a, remote, U);
    await syncOnce(b, remote, U);
    expect(await getProfile(b, U)).toMatchObject({ nickname: 'A', heightCm: 170 });
    expect((await getProfile(b, U))!.onboardingCompletedAt).not.toBeNull();
    expect((await getGoalForDate(b, U, D))!.calorieKcal).toBe(1800);
    const t = await listTemplates(b, U);
    expect(t[0]!.items[0]!.food?.name).toBe(RICE.name);

    // both devices set "today's" goal with different ids → one goal row per day
    await saveGoal(b, U, D, { ...(await getGoalForDate(b, U, D))!, calorieKcal: 1900 });
    await syncOnce(b, remote, U);
    await syncOnce(a, remote, U);
    expect((await getGoalForDate(a, U, D))!.calorieKcal).toBe(1900);
    expect(remote.table('nutrition_goals').size).toBe(1);
  });
});
