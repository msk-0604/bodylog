import { parseDateKey } from '@/domain/date';

import { createTestDb } from '../db/testing/nodeDb';
import type { SqlDb } from '../db/types';
import { addWeight } from '../repo/body';
import {
  addExercise,
  deleteExercise,
  getExercise,
  listExercises,
  recentSetNames,
  updateExercise,
  validateExercise,
  type ExerciseInput,
} from '../repo/exercise';
import { cacheMasterFoods, getFood } from '../repo/foods';
import { addMealItem } from '../repo/meals';
import {
  dayMarks,
  disableAllReminders,
  getPreferences,
  getReminders,
  savePreferences,
  saveReminder,
} from '../repo/settings';
import { countPending, syncOnce } from '../sync/syncEngine';
import { FakeRemote } from '../sync/testing/fakeRemote';

const U = '11111111-1111-4111-8111-111111111111';
let db: SqlDb & { close(): void };

beforeEach(async () => {
  db = await createTestDb();
});
afterEach(() => db.close());

const strength = (over: Partial<ExerciseInput> = {}): ExerciseInput => ({
  type: 'strength',
  name: '筋トレ',
  performedAt: new Date(2026, 9, 24, 19),
  durationMin: 45,
  kcal: 236,
  kcalIsEstimated: true,
  mets: 5,
  sets: [
    { exerciseName: 'ベンチプレス', weightKg: 60, reps: 10 },
    { exerciseName: 'ベンチプレス', weightKg: 62.5, reps: 8 },
    { exerciseName: 'スクワット', weightKg: 80, reps: 10 },
  ],
  ...over,
});

describe('exercise repository', () => {
  it('adds, lists with sets, edits and deletes', async () => {
    const id = await addExercise(db, U, strength());
    let ex = (await getExercise(db, U, id))!;
    expect(ex).toMatchObject({
      type: 'strength',
      durationMin: 45,
      kcal: 236,
      kcalIsEstimated: true,
      performedOn: '2026-10-24',
    });
    expect(ex.sets.map((s) => [s.exerciseName, s.setNumber, s.weightKg, s.reps])).toEqual([
      ['ベンチプレス', 1, 60, 10],
      ['ベンチプレス', 2, 62.5, 8],
      ['スクワット', 3, 80, 10],
    ]);

    await updateExercise(
      db,
      U,
      id,
      strength({
        durationMin: 50,
        sets: [{ exerciseName: 'デッドリフト', weightKg: 100, reps: 5 }],
      }),
    );
    ex = (await getExercise(db, U, id))!;
    expect(ex.durationMin).toBe(50);
    expect(ex.sets.map((s) => s.exerciseName)).toEqual(['デッドリフト']);
    // replaced sets are soft-deleted (tombstones for sync)
    expect(
      Number(
        (await db.get<{ n: number }>(
          'SELECT COUNT(*) AS n FROM exercise_sets WHERE deleted_at IS NOT NULL',
        ))!.n,
      ),
    ).toBe(3);
    expect(await recentSetNames(db, U)).toContain('デッドリフト');

    const walk = await addExercise(db, U, {
      type: 'walking',
      name: 'ウォーキング',
      performedAt: new Date(2026, 9, 23, 7),
      durationMin: 30,
      kcal: null,
      kcalIsEstimated: false,
      mets: null,
    });
    expect((await listExercises(db, U)).map((e) => e.id)).toEqual([id, walk]);
    expect(
      await listExercises(db, U, {
        from: parseDateKey('2026-10-23'),
        to: parseDateKey('2026-10-23'),
      }),
    ).toHaveLength(1);

    await deleteExercise(db, U, id);
    expect(await getExercise(db, U, id)).toBeNull();
    expect(await listExercises(db, 'other-user')).toEqual([]);
  });

  it('validates input', async () => {
    expect(validateExercise(strength({ durationMin: 0 }))).toMatch(/時間/);
    expect(validateExercise(strength({ name: ' ' }))).toMatch(/運動名/);
    expect(
      validateExercise(strength({ sets: [{ exerciseName: 'x', weightKg: -1, reps: 5 }] })),
    ).toMatch(/重量/);
    expect(
      validateExercise(strength({ sets: [{ exerciseName: 'x', weightKg: 10, reps: 0 }] })),
    ).toMatch(/回数/);
    await expect(addExercise(db, U, strength({ durationMin: 2000 }))).rejects.toThrow(RangeError);
  });
});

describe('preferences & reminders', () => {
  it('stores preferences (default off)', async () => {
    expect(await getPreferences(db, U)).toEqual({
      includeExerciseInBudget: false,
      weekStartsOn: 1,
    });
    await savePreferences(db, U, { includeExerciseInBudget: true });
    expect((await getPreferences(db, U)).includeExerciseInBudget).toBe(true);
    await savePreferences(db, U, { weekStartsOn: 0 });
    expect(await getPreferences(db, U)).toEqual({ includeExerciseInBudget: true, weekStartsOn: 0 });
  });

  it('stores reminder settings per device and validates time', async () => {
    expect((await getReminders(db)).every((r) => !r.enabled)).toBe(true);
    await saveReminder(db, { kind: 'lunch', enabled: true, hour: 12, minute: 15 });
    expect((await getReminders(db)).find((r) => r.kind === 'lunch')).toEqual({
      kind: 'lunch',
      enabled: true,
      hour: 12,
      minute: 15,
    });
    await expect(
      saveReminder(db, { kind: 'lunch', enabled: true, hour: 25, minute: 0 }),
    ).rejects.toThrow();
    await disableAllReminders(db);
    expect((await getReminders(db)).some((r) => r.enabled)).toBe(false);
  });
});

describe('calendar marks', () => {
  it('marks days with meals, weight and exercise', async () => {
    await cacheMasterFoods(db, [
      {
        id: 'f1',
        food_code: 'T1',
        name: 'テスト',
        category_code: null,
        category_name: null,
        energy_kcal: 100,
        protein_g: 1,
        fat_g: 1,
        carbohydrate_g: 1,
        value_flags: {},
        source_version: 't',
      },
    ]);
    const food = (await getFood(db, U, { source: 'master', id: 'f1' }))!;
    await addMealItem(db, U, {
      date: parseDateKey('2026-10-02'),
      mealType: 'lunch',
      food,
      grams: 100,
    });
    await addWeight(db, U, { weightKg: 60, bodyFatPct: null, measuredAt: new Date(2026, 9, 2, 7) });
    await addExercise(db, U, strength({ performedAt: new Date(2026, 9, 5, 7) }));
    const marks = await dayMarks(db, U, parseDateKey('2026-10-01'), parseDateKey('2026-10-31'));
    expect(marks.get(parseDateKey('2026-10-02'))).toEqual({
      meals: true,
      weight: true,
      exercise: false,
    });
    expect(marks.get(parseDateKey('2026-10-05'))).toEqual({
      meals: false,
      weight: false,
      exercise: true,
    });
    expect(marks.has(parseDateKey('2026-10-03'))).toBe(false);
  });
});

describe('sync of Phase 4/5 tables', () => {
  it('syncs exercise entries/sets and preferences (booleans as true/false) between devices', async () => {
    const remote = new FakeRemote();
    const b = await createTestDb();
    try {
      const id = await addExercise(db, U, strength());
      await savePreferences(db, U, { includeExerciseInBudget: true });
      const r = await syncOnce(db, remote, U);
      expect(r.rejected).toBe(0);
      expect(remote.table('exercise_entries').get(id)!.kcal_is_estimated).toBe(true);
      expect([...remote.table('user_preferences').values()][0]!.include_exercise_in_budget).toBe(
        true,
      );
      expect(remote.table('exercise_sets').size).toBe(3);
      expect(await countPending(db, U)).toEqual({ pending: 0, errors: 0 });

      await syncOnce(b, remote, U);
      const onB = (await getExercise(b, U, id))!;
      expect(onB.kcalIsEstimated).toBe(true);
      expect(onB.sets).toHaveLength(3);
      expect((await getPreferences(b, U)).includeExerciseInBudget).toBe(true);

      // edit on B, delete sets → A sees the new sets only
      await updateExercise(
        b,
        U,
        id,
        strength({ sets: [{ exerciseName: 'ラットプル', weightKg: 40, reps: 12 }] }),
      );
      await syncOnce(b, remote, U);
      await syncOnce(db, remote, U);
      expect((await getExercise(db, U, id))!.sets.map((s) => s.exerciseName)).toEqual([
        'ラットプル',
      ]);

      // delete wins over a concurrent edit
      await deleteExercise(db, U, id);
      await syncOnce(db, remote, U);
      await updateExercise(b, U, id, strength({ durationMin: 99 }));
      await syncOnce(b, remote, U);
      expect(await getExercise(b, U, id)).toBeNull();
    } finally {
      b.close();
    }
  });

  it('keeps offline exercise records and retries until online', async () => {
    const remote = new FakeRemote();
    await addExercise(db, U, strength());
    remote.failNext = 3;
    await expect(syncOnce(db, remote, U)).rejects.toThrow();
    expect((await countPending(db, U)).pending).toBe(4);
    expect(await listExercises(db, U)).toHaveLength(1);
    remote.failNext = 0;
    await syncOnce(db, remote, U);
    expect((await countPending(db, U)).pending).toBe(0);
    expect(remote.table('exercise_entries').size).toBe(1);
  });
});
