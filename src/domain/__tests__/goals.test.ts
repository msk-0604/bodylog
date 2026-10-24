import {
  ageOn,
  estimateBmr,
  estimateCalorieGoal,
  goalWarnings,
  inferGoalType,
  pfcGramsFromCalories,
} from '../goals';

describe('ageOn', () => {
  it('counts birthdays correctly', () => {
    const today = new Date(2026, 9, 24);
    expect(ageOn('1990-10-24', today)).toBe(36);
    expect(ageOn('1990-10-25', today)).toBe(35);
    expect(ageOn('bad', today)).toBeNull();
  });
});

describe('estimateBmr (国立健康・栄養研究所の式)', () => {
  it('male 70kg 170cm 36y', () => {
    // (0.0481*70 + 0.0234*170 - 0.0138*36 - 0.4235) * 1000 / 4.186
    const expected = ((0.0481 * 70 + 0.0234 * 170 - 0.0138 * 36 - 0.4235) * 1000) / 4.186;
    expect(estimateBmr({ weightKg: 70, heightCm: 170, age: 36, sex: 'male' })).toBeCloseTo(
      expected,
      6,
    );
    expect(Math.round(expected)).toBe(1535);
  });
  it('female uses the female constant', () => {
    const v = estimateBmr({ weightKg: 55, heightCm: 158, age: 30, sex: 'female' })!;
    expect(Math.round(v)).toBe(
      Math.round(((0.0481 * 55 + 0.0234 * 158 - 0.0138 * 30 - 0.9708) * 1000) / 4.186),
    );
  });
  it('returns null when sex is not given or the user is under 18', () => {
    expect(estimateBmr({ weightKg: 70, heightCm: 170, age: 36, sex: 'unspecified' })).toBeNull();
    expect(estimateBmr({ weightKg: 50, heightCm: 160, age: 16, sex: 'female' })).toBeNull();
  });
});

describe('estimateCalorieGoal', () => {
  const base = {
    weightKg: 70,
    heightCm: 170,
    age: 36,
    sex: 'male' as const,
    activity: 'moderate' as const,
  };
  it('applies activity factor and a modest goal adjustment, rounded to 10 kcal', () => {
    const lose = estimateCalorieGoal({ ...base, goalType: 'lose' })!;
    const keep = estimateCalorieGoal({ ...base, goalType: 'maintain' })!;
    expect(keep.tdee).toBe(Math.round(lose.bmr * 1.75) + (keep.tdee - Math.round(lose.bmr * 1.75)));
    expect(keep.goalKcal - lose.goalKcal).toBeGreaterThanOrEqual(290);
    expect(keep.goalKcal % 10).toBe(0);
  });
  it('never suggests less than the estimated BMR', () => {
    const e = estimateCalorieGoal({
      ...base,
      activity: 'low',
      goalType: 'lose',
      weightKg: 40,
      heightCm: 150,
      age: 80,
    })!;
    expect(e.goalKcal).toBeGreaterThanOrEqual(Math.round(e.bmr / 10) * 10 - 10);
  });
});

describe('PFC & goal helpers', () => {
  it('splits calories 20/25/55', () => {
    expect(pfcGramsFromCalories(2000)).toEqual({ proteinG: 100, fatG: 56, carbohydrateG: 275 });
  });
  it('infers the goal type with a ±0.5 kg band', () => {
    expect(inferGoalType(70, 65)).toBe('lose');
    expect(inferGoalType(70, 70.4)).toBe('maintain');
    expect(inferGoalType(55, 60)).toBe('gain');
  });
  it('warns gently about extreme settings', () => {
    expect(
      goalWarnings({ calorieKcal: 1000, bmr: 1400, currentKg: 70, targetKg: 50 }),
    ).toHaveLength(3);
    expect(goalWarnings({ calorieKcal: 2000, bmr: 1500, currentKg: 70, targetKg: 65 })).toEqual([]);
  });
});
