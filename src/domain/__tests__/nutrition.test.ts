import {
  calorieBalance,
  formatGrams,
  formatKcal,
  isValidGrams,
  roundTo,
  scaleNutrients,
  sumNutrients,
  toStoredNutrients,
  type Nutrients,
} from '../nutrition';

const rice: Nutrients = { energyKcal: 156, proteinG: 2.5, fatG: 0.3, carbohydrateG: 37.1 };

describe('roundTo', () => {
  it('rounds half away from zero', () => {
    expect(roundTo(1.25, 1)).toBe(1.3);
    expect(roundTo(-1.25, 1)).toBe(-1.3);
    expect(roundTo(2.5, 0)).toBe(3);
  });
  it('handles binary float artifacts', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(0.1 + 0.2, 1)).toBe(0.3);
  });
  it('never returns -0', () => {
    expect(Object.is(roundTo(-0.01, 1), 0)).toBe(true);
  });
});

describe('scaleNutrients', () => {
  it('computes per100g × grams ÷ 100', () => {
    expect(scaleNutrients(rice, 150)).toEqual({
      energyKcal: 234,
      proteinG: 3.75,
      fatG: 0.45,
      carbohydrateG: 55.65,
    });
  });
  it('keeps unknown values as null (never 0)', () => {
    const r = scaleNutrients({ ...rice, fatG: null }, 200);
    expect(r.fatG).toBeNull();
    expect(r.energyKcal).toBe(312);
  });
  it('rejects invalid amounts', () => {
    expect(() => scaleNutrients(rice, 0)).toThrow(RangeError);
    expect(() => scaleNutrients(rice, -10)).toThrow(RangeError);
    expect(() => scaleNutrients(rice, Number.NaN)).toThrow(RangeError);
    expect(() => scaleNutrients(rice, 5001)).toThrow(RangeError);
  });
  it('isValidGrams', () => {
    expect(isValidGrams(0.5)).toBe(true);
    expect(isValidGrams(5000)).toBe(true);
    expect(isValidGrams(Infinity)).toBe(false);
  });
});

describe('toStoredNutrients', () => {
  it('rounds to 1 decimal and keeps null', () => {
    expect(
      toStoredNutrients({ energyKcal: 234.05, proteinG: 3.75, fatG: null, carbohydrateG: 55.65 }),
    ).toEqual({
      energyKcal: 234.1,
      proteinG: 3.8,
      fatG: null,
      carbohydrateG: 55.7,
    });
  });
});

describe('sumNutrients', () => {
  it('sums known values and flags unknown contributions', () => {
    const t = sumNutrients([rice, { energyKcal: 100, proteinG: null, fatG: 1, carbohydrateG: 2 }]);
    expect(t.energyKcal).toBe(256);
    expect(t.proteinG).toBe(2.5);
    expect(t.incomplete).toEqual({
      energyKcal: false,
      proteinG: true,
      fatG: false,
      carbohydrateG: false,
    });
  });
  it('returns zeros for no items', () => {
    expect(sumNutrients([]).energyKcal).toBe(0);
  });
});

describe('calorieBalance', () => {
  it('under goal', () => {
    expect(calorieBalance(1650, 2000)).toEqual({
      intake: 1650,
      goal: 2000,
      remaining: 350,
      over: 0,
      ratio: 0.825,
    });
  });
  it('over goal', () => {
    const b = calorieBalance(2300, 2000);
    expect(b.remaining).toBe(0);
    expect(b.over).toBe(300);
    expect(b.ratio).toBeCloseTo(1.15);
  });
  it('zero goal does not divide by zero', () => {
    expect(calorieBalance(100, 0).ratio).toBe(0);
  });
});

describe('formatting', () => {
  it('formats kcal with grouping and no decimals', () => {
    expect(formatKcal(1650.4)).toBe('1,650');
    expect(formatKcal(1650.5)).toBe('1,651');
  });
  it('formats grams with 1 decimal', () => {
    expect(formatGrams(3.75)).toBe('3.8');
    expect(formatGrams(12)).toBe('12.0');
  });
});
