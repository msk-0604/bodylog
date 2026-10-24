import { ageOn, type ActivityLevel, type Sex } from '@/domain/goals';
import {
  BODY_FAT_MAX_PCT,
  BODY_FAT_MIN_PCT,
  isValidBodyFatPct,
  isValidWeightKg,
  parseDecimalInput,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
} from '@/domain/weight';

export type BodyDraft = {
  nickname: string;
  heightText: string;
  weightText: string;
  targetText: string;
  bodyFatText: string;
  birthText: string;
  sex: Sex;
  activity: ActivityLevel;
};

export const emptyBodyDraft: BodyDraft = {
  nickname: '',
  heightText: '',
  weightText: '',
  targetText: '',
  bodyFatText: '',
  birthText: '',
  sex: 'unspecified',
  activity: 'moderate',
};

/** Accepts 1990-04-15 / 1990/4/15 / 19900415 (full-width too). */
export function parseBirthDate(text: string): string | null {
  const t = text.normalize('NFKC').trim();
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(t);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
    return null;
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const age = ageOn(iso);
  if (age === null || age < 13 || age > 120) return null;
  return iso;
}

export type ParsedBody = {
  nickname: string | null;
  heightCm: number;
  weightKg: number | null;
  targetKg: number | null;
  bodyFatPct: number | null;
  birthDate: string | null;
  sex: Sex;
  activity: ActivityLevel;
};

/** `requireWeights`: onboarding needs current & target weight; the profile screen doesn't. */
export function parseBodyDraft(
  d: BodyDraft,
  requireWeights: boolean,
): { value: ParsedBody | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const height = parseDecimalInput(d.heightText);
  if (height === null || height < 80 || height > 250)
    errors.height = '80〜250cmの範囲で入力してください';

  const weightRange = `${WEIGHT_MIN_KG}〜${WEIGHT_MAX_KG}kgの範囲で入力してください`;
  const weight = d.weightText.trim() ? parseDecimalInput(d.weightText) : null;
  if ((requireWeights || d.weightText.trim()) && (weight === null || !isValidWeightKg(weight))) {
    errors.weight = weightRange;
  }
  const target = d.targetText.trim() ? parseDecimalInput(d.targetText) : null;
  if ((requireWeights || d.targetText.trim()) && (target === null || !isValidWeightKg(target))) {
    errors.target = weightRange;
  }
  const fat = d.bodyFatText.trim() ? parseDecimalInput(d.bodyFatText) : null;
  if (d.bodyFatText.trim() && (fat === null || !isValidBodyFatPct(fat))) {
    errors.bodyFat = `${BODY_FAT_MIN_PCT}〜${BODY_FAT_MAX_PCT}%の範囲で入力してください`;
  }
  const birth = d.birthText.trim() ? parseBirthDate(d.birthText) : null;
  if (d.birthText.trim() && !birth)
    errors.birth = '例：1990-04-15 の形式で入力してください（13歳以上）';
  const nickname = d.nickname.trim().slice(0, 20) || null;

  if (Object.keys(errors).length > 0 || height === null) return { value: null, errors };
  return {
    value: {
      nickname,
      heightCm: height,
      weightKg: weight,
      targetKg: target,
      bodyFatPct: fat,
      birthDate: birth,
      sex: d.sex,
      activity: d.activity,
    },
    errors,
  };
}
