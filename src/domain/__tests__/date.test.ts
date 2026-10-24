import {
  addDays,
  diffDays,
  formatDateKeyJa,
  formatDateKeyJaLong,
  isDateKey,
  lastNDays,
  parseDateKey,
  toDateKey,
} from '../date';

describe('date keys', () => {
  it('validates real calendar dates', () => {
    expect(isDateKey('2026-10-24')).toBe(true);
    expect(isDateKey('2028-02-29')).toBe(true);
    expect(isDateKey('2026-02-29')).toBe(false);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('2026-1-1')).toBe(false);
    expect(() => parseDateKey('nope')).toThrow(RangeError);
  });

  it('uses local calendar date', () => {
    expect(toDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(toDateKey(new Date(2026, 0, 6, 0, 0))).toBe('2026-01-06');
  });

  it('adds days across month/year boundaries', () => {
    const k = parseDateKey('2026-12-31');
    expect(addDays(k, 1)).toBe('2027-01-01');
    expect(addDays(parseDateKey('2026-03-01'), -1)).toBe('2026-02-28');
    expect(addDays(parseDateKey('2028-03-01'), -1)).toBe('2028-02-29');
  });

  it('diffDays is DST-safe (uses UTC arithmetic)', () => {
    expect(diffDays(parseDateKey('2026-03-07'), parseDateKey('2026-03-09'))).toBe(2);
    expect(diffDays(parseDateKey('2026-11-02'), parseDateKey('2026-10-31'))).toBe(-2);
  });

  it('lastNDays returns oldest first, inclusive', () => {
    expect(lastNDays(parseDateKey('2026-10-24'), 3)).toEqual([
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
    ]);
  });

  it('formats in Japanese', () => {
    expect(formatDateKeyJa(parseDateKey('2026-10-24'))).toBe('10月24日(土)');
    expect(formatDateKeyJaLong(parseDateKey('2026-10-25'))).toBe('2026年10月25日(日)');
  });
});
