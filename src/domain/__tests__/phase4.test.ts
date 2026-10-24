import {
  addMonths,
  formatMonthJa,
  monthGrid,
  monthOf,
  monthRange,
  WEEKDAY_LABELS,
} from '../calendar';
import { parseDateKey, type DateKey } from '../date';
import {
  EXERCISE_TYPES,
  metsFor,
  netExerciseKcal,
  restingKcal,
  volumeByExercise,
} from '../exerciseTypes';
import { defaultReminders, formatTime, isValidTime, stepTime } from '../reminders';
import type { WeightMeasurement } from '../weight';
import {
  dailySeries,
  goalStatus,
  movingAverageSeries,
  periodStats,
  rangeDays,
} from '../weightAnalysis';

let seq = 0;
const m = (on: string, hour: number, kg: number, fat: number | null = null): WeightMeasurement => {
  const [y, mo, d] = on.split('-').map(Number) as [number, number, number];
  return {
    id: String(++seq),
    weightKg: kg,
    bodyFatPct: fat,
    measuredAt: new Date(y, mo - 1, d, hour),
    measuredOn: parseDateKey(on),
  };
};
const K = (s: string) => s as DateKey;

describe('weight analysis', () => {
  const data = [
    m('2026-10-01', 7, 70.0, 25),
    m('2026-10-01', 21, 70.8, null),
    m('2026-10-03', 7, 69.6, null),
    m('2026-10-10', 7, 69.0, 24.2),
  ];

  it('daily series per metric skips missing days and missing values', () => {
    expect([...dailySeries(data, 'weight')]).toEqual([
      ['2026-10-01', 70.0],
      ['2026-10-03', 69.6],
      ['2026-10-10', 69.0],
    ]);
    expect([...dailySeries(data, 'bodyFat')]).toEqual([
      ['2026-10-01', 25],
      ['2026-10-10', 24.2],
    ]);
  });

  it('range days, including "all" from the first record', () => {
    const end = parseDateKey('2026-10-24');
    expect(rangeDays('7d', end, null)).toBe(7);
    expect(rangeDays('90d', end, null)).toBe(90);
    expect(rangeDays('all', end, parseDateKey('2026-10-01'))).toBe(24);
    expect(rangeDays('all', end, parseDateKey('2026-10-22'))).toBe(7);
    expect(rangeDays('all', end, null)).toBe(7);
  });

  it('moving average uses only recorded days in the trailing window', () => {
    expect(movingAverageSeries(dailySeries(data, 'weight'), 7)).toEqual([
      { date: '2026-10-01', value: 70.0 },
      { date: '2026-10-03', value: 69.8 },
      { date: '2026-10-10', value: 69.0 },
    ]);
  });

  it('period stats', () => {
    const s = periodStats(dailySeries(data, 'weight'), K('2026-10-01'), K('2026-10-10'));
    expect(s).toEqual({
      days: 10,
      recordedDays: 3,
      first: 70,
      last: 69,
      change: -1,
      min: 69,
      max: 70,
      average: 69.5,
    });
    expect(periodStats(new Map(), K('2026-10-01'), K('2026-10-07')).average).toBeNull();
  });

  it('goal status for loss, gain and missing data', () => {
    expect(
      goalStatus({ startKg: 70, targetKg: 65, currentKg: 67.5, firstRecordedKg: null }),
    ).toMatchObject({
      progress: 0.5,
      remainingKg: 2.5,
      reached: false,
    });
    expect(
      goalStatus({ startKg: null, targetKg: 65, currentKg: 64.8, firstRecordedKg: 70 }),
    ).toMatchObject({
      startKg: 70,
      progress: 1,
      remainingKg: 0,
      reached: true,
    });
    expect(
      goalStatus({ startKg: 55, targetKg: 60, currentKg: 56, firstRecordedKg: null })!.progress,
    ).toBeCloseTo(0.2);
    expect(
      goalStatus({ startKg: 70, targetKg: null, currentKg: 69, firstRecordedKg: null }),
    ).toBeNull();
  });
});

describe('exercise', () => {
  it('has METs for every type except other', () => {
    for (const t of EXERCISE_TYPES) {
      if (t === 'other') expect(metsFor(t, 'moderate')).toBeNull();
      else expect(metsFor(t, 'moderate')).toBeGreaterThan(1);
    }
  });

  it('net kcal excludes resting expenditure (no double counting with activity level)', () => {
    // walking 3.0 METs, 60 kg, 60 min → gross 189, net (3-1)*60*1*1.05 = 126
    expect(netExerciseKcal({ kcal: 189, mets: 3, durationMin: 60, weightKg: 60 })).toBe(126);
    // manual kcal: subtract 1 MET for the duration
    expect(restingKcal(60, 60)).toBeCloseTo(63);
    expect(netExerciseKcal({ kcal: 200, mets: null, durationMin: 60, weightKg: 60 })).toBe(137);
    expect(netExerciseKcal({ kcal: 30, mets: null, durationMin: 60, weightKg: 60 })).toBe(0);
    expect(netExerciseKcal({ kcal: 200, mets: null, durationMin: 60, weightKg: null })).toBe(200);
    expect(netExerciseKcal({ kcal: null, mets: null, durationMin: 30, weightKg: 60 })).toBe(0);
  });

  it('volume by exercise', () => {
    expect(
      volumeByExercise([
        { exerciseName: 'ベンチプレス', weightKg: 60, reps: 10 },
        { exerciseName: 'ベンチプレス', weightKg: 60, reps: 8 },
        { exerciseName: 'スクワット', weightKg: null, reps: 20 },
        { exerciseName: ' ', weightKg: 10, reps: 10 },
      ]),
    ).toEqual([
      { name: 'ベンチプレス', sets: 2, volumeKg: 1080 },
      { name: 'スクワット', sets: 1, volumeKg: 0 },
    ]);
  });
});

describe('calendar', () => {
  it('builds a Monday-first month grid', () => {
    const grid = monthGrid({ year: 2026, month: 10 }, 1); // Oct 1 2026 is a Thursday
    expect(grid[0]).toEqual([
      null,
      null,
      null,
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(grid.flat().filter(Boolean)).toHaveLength(31);
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(monthGrid({ year: 2026, month: 10 }, 0)[0]![4]).toBe('2026-10-01');
    expect(WEEKDAY_LABELS(1)[0]).toBe('月');
  });
  it('month helpers', () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(monthRange({ year: 2028, month: 2 })).toEqual({
      first: '2028-02-01',
      last: '2028-02-29',
    });
    expect(monthOf(parseDateKey('2026-10-24'))).toEqual({ year: 2026, month: 10 });
    expect(formatMonthJa({ year: 2026, month: 10 })).toBe('2026年10月');
  });
});

describe('reminders', () => {
  it('defaults are off with sensible times', () => {
    const d = defaultReminders();
    expect(d).toHaveLength(5);
    expect(d.every((r) => !r.enabled)).toBe(true);
    expect(d.find((r) => r.kind === 'weigh_in')).toMatchObject({ hour: 7, minute: 0 });
  });
  it('time stepping wraps around midnight', () => {
    expect(stepTime(23, 50, 15)).toEqual({ hour: 0, minute: 5 });
    expect(stepTime(0, 5, -15)).toEqual({ hour: 23, minute: 50 });
    expect(isValidTime(24, 0)).toBe(false);
    expect(formatTime(7, 5)).toBe('7:05');
  });
});
