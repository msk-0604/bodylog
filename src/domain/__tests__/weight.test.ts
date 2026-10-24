import { parseDateKey, type DateKey } from '../date';
import {
  averageOverDays,
  changeFromPrevious,
  dailyWeights,
  goalProgress,
  isValidBodyFatPct,
  isValidWeightKg,
  latestMeasurement,
  movingAverage,
  parseDecimalInput,
  type WeightMeasurement,
} from '../weight';

let seq = 0;
function m(on: string, hour: number, kg: number): WeightMeasurement {
  const [y, mo, d] = on.split('-').map(Number) as [number, number, number];
  return {
    id: String(++seq),
    weightKg: kg,
    bodyFatPct: null,
    measuredAt: new Date(y, mo - 1, d, hour),
    measuredOn: parseDateKey(on),
  };
}

describe('validation', () => {
  it('weight range', () => {
    expect(isValidWeightKg(65.4)).toBe(true);
    expect(isValidWeightKg(19.9)).toBe(false);
    expect(isValidWeightKg(300.1)).toBe(false);
    expect(isValidWeightKg(Number.NaN)).toBe(false);
  });
  it('body fat range', () => {
    expect(isValidBodyFatPct(20)).toBe(true);
    expect(isValidBodyFatPct(0)).toBe(false);
  });
  it('parses decimal input incl. full-width', () => {
    expect(parseDecimalInput('65.4')).toBe(65.4);
    expect(parseDecimalInput('６５．４')).toBe(65.4);
    expect(parseDecimalInput(' 70 ')).toBe(70);
    expect(parseDecimalInput('65.45')).toBe(65.5);
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput('abc')).toBeNull();
    expect(parseDecimalInput('-5')).toBeNull();
  });
});

describe('latest / change', () => {
  const data = [m('2026-10-20', 7, 66.0), m('2026-10-22', 7, 65.6), m('2026-10-22', 21, 66.2)];
  it('latest is by measured time, not array order', () => {
    expect(latestMeasurement([...data].reverse())?.weightKg).toBe(66.2);
  });
  it('change from previous measurement', () => {
    expect(changeFromPrevious(data)).toBe(0.6);
  });
  it('null with fewer than 2 records', () => {
    expect(changeFromPrevious([data[0]!])).toBeNull();
    expect(latestMeasurement([])).toBeNull();
  });
});

describe('daily aggregation', () => {
  const data = [
    m('2026-10-20', 21, 66.4),
    m('2026-10-20', 7, 66.0),
    m('2026-10-22', 7, 65.6),
    m('2026-10-24', 7, 65.0),
  ];
  const daily = dailyWeights(data);

  it('uses the earliest measurement per day and skips missing days', () => {
    expect([...daily.entries()]).toEqual([
      ['2026-10-20', 66.0],
      ['2026-10-22', 65.6],
      ['2026-10-24', 65.0],
    ]);
    expect(daily.has('2026-10-21' as DateKey)).toBe(false);
  });

  it('averages only days with records', () => {
    expect(averageOverDays(daily, parseDateKey('2026-10-24'), 7)).toBe(65.5);
    expect(averageOverDays(daily, parseDateKey('2026-10-24'), 1)).toBe(65.0);
    expect(averageOverDays(daily, parseDateKey('2026-11-30'), 7)).toBeNull();
  });

  it('moving average per recorded day', () => {
    expect(movingAverage(daily, 3)).toEqual([
      { date: '2026-10-20', value: 66.0 },
      { date: '2026-10-22', value: 65.8 },
      { date: '2026-10-24', value: 65.3 },
    ]);
  });
});

describe('goalProgress', () => {
  it('weight loss', () => {
    expect(goalProgress(70, 67.5, 65)).toBe(0.5);
    expect(goalProgress(70, 72, 65)).toBe(0);
    expect(goalProgress(70, 64, 65)).toBe(1);
  });
  it('weight gain', () => {
    expect(goalProgress(55, 57, 60)).toBeCloseTo(0.4);
  });
  it('maintenance', () => {
    expect(goalProgress(60, 60.4, 60)).toBe(1);
    expect(goalProgress(60, 61, 60)).toBe(0);
  });
});
