import {
  canAddFavorite,
  canCreateTemplate,
  canExportCsv,
  favoritesOverLimit,
  FREE_LIMITS,
  isGraphRangeAvailable,
  usableTemplateIds,
} from '../entitlements';
import { estimateExerciseKcal } from '../exercise';
import { isMealType, MEAL_TYPE_LABELS, suggestMealType } from '../mealType';
import { escapeLike, katakanaToHiragana, normalizeForSearch } from '../searchNormalize';

describe('entitlements', () => {
  it('favorites limit: free 10, premium unlimited', () => {
    expect(FREE_LIMITS.favorites).toBe(10);
    expect(canAddFavorite('free', 9)).toBe(true);
    expect(canAddFavorite('free', 10)).toBe(false);
    expect(canAddFavorite('premium', 1000)).toBe(true);
    expect(favoritesOverLimit('free', 13)).toBe(3);
    expect(favoritesOverLimit('premium', 13)).toBe(0);
  });
  it('templates limit: free 1', () => {
    expect(canCreateTemplate('free', 0)).toBe(true);
    expect(canCreateTemplate('free', 1)).toBe(false);
    expect(canCreateTemplate('premium', 50)).toBe(true);
  });
  it('graph ranges and CSV', () => {
    expect(isGraphRangeAvailable('free', '7d')).toBe(true);
    expect(isGraphRangeAvailable('free', '30d')).toBe(false);
    expect(isGraphRangeAvailable('premium', 'all')).toBe(true);
    expect(canExportCsv('free')).toBe(false);
    expect(canExportCsv('premium')).toBe(true);
  });
  it('after lapse, only the oldest template stays usable (none deleted)', () => {
    const t = [
      { id: 'b', createdAt: new Date('2026-02-01') },
      { id: 'a', createdAt: new Date('2026-01-01') },
      { id: 'c', createdAt: new Date('2026-03-01') },
    ];
    expect([...usableTemplateIds('free', t)]).toEqual(['a']);
    expect(usableTemplateIds('premium', t).size).toBe(3);
  });
});

describe('mealType', () => {
  const at = (h: number, min = 0) => new Date(2026, 9, 24, h, min);
  it('suggests by local time', () => {
    expect(suggestMealType(at(4))).toBe('breakfast');
    expect(suggestMealType(at(10, 59))).toBe('breakfast');
    expect(suggestMealType(at(11))).toBe('lunch');
    expect(suggestMealType(at(16))).toBe('snack');
    expect(suggestMealType(at(18))).toBe('dinner');
    expect(suggestMealType(at(23))).toBe('snack');
    expect(suggestMealType(at(2))).toBe('snack');
  });
  it('labels and guard', () => {
    expect(MEAL_TYPE_LABELS.breakfast).toBe('朝食');
    expect(isMealType('lunch')).toBe(true);
    expect(isMealType('brunch')).toBe(false);
  });
});

describe('search normalization', () => {
  it('katakana → hiragana', () => {
    expect(katakanaToHiragana('トマト')).toBe('とまと');
    expect(katakanaToHiragana('ヴ')).toBe('ゔ');
  });
  it('matches hiragana/katakana and full/half width variants', () => {
    const target = normalizeForSearch('＜鶏肉＞ にわとり ［若どり・主品目］ むね 皮つき 生');
    expect(target).toContain(normalizeForSearch('ムネ'));
    expect(normalizeForSearch('ﾄﾏﾄ')).toBe('とまと');
    expect(normalizeForSearch('ＴＯＦＵ')).toBe('tofu');
    expect(normalizeForSearch('ご　は　ん')).toBe('ごはん');
    expect(normalizeForSearch('ｶﾞｯﾃﾝ')).toBe('がってん');
  });
  it('escapes LIKE wildcards', () => {
    expect(escapeLike('100%_a\\b')).toBe('100\\%\\_a\\\\b');
  });
});

describe('exercise kcal estimate', () => {
  it('METs × kg × h × 1.05', () => {
    // walking 3.5 METs, 60kg, 30min → 3.5*60*0.5*1.05 = 110.25
    expect(estimateExerciseKcal({ mets: 3.5, weightKg: 60, durationMin: 30 })).toBe(110);
  });
  it('net METs avoids double counting resting expenditure', () => {
    expect(estimateExerciseKcal({ mets: 3.5, weightKg: 60, durationMin: 30, net: true })).toBe(79);
  });
  it('invalid input yields 0', () => {
    expect(estimateExerciseKcal({ mets: 3.5, weightKg: 0, durationMin: 30 })).toBe(0);
  });
});
