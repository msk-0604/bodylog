import { authErrorMessage, validateEmail, validatePassword } from '../auth/authErrors';
import { isActivePremium } from '@/domain/subscription';
import { parseBirthDate, parseBodyDraft, emptyBodyDraft } from '../profile/bodyForm';
import { draftFromEstimate, parseGoalDraft } from '../profile/GoalEditor';

describe('auth validation & messages', () => {
  it('validates email and password strength', () => {
    expect(validateEmail('a@b.jp')).toBeNull();
    expect(validateEmail('ab.jp')).not.toBeNull();
    expect(validatePassword('short1')).not.toBeNull();
    expect(validatePassword('longpassword')).not.toBeNull();
    expect(validatePassword('longpass123')).toBeNull();
  });
  it('maps Supabase errors to Japanese without leaking raw messages', () => {
    expect(
      authErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' }),
    ).toBe('メールアドレスまたはパスワードが正しくありません。');
    expect(authErrorMessage({ status: 429, message: 'x' })).toContain('しばらく待って');
    expect(authErrorMessage({ message: 'some internal detail user@example.com' })).not.toContain(
      'user@',
    );
  });
});

describe('body form', () => {
  it('parses birth dates in several formats', () => {
    expect(parseBirthDate('1990-04-15')).toBe('1990-04-15');
    expect(parseBirthDate('1990/4/5')).toBe('1990-04-05');
    expect(parseBirthDate('１９９００４１５')).toBe('1990-04-15');
    expect(parseBirthDate('1990-02-30')).toBeNull();
    expect(parseBirthDate('2030-01-01')).toBeNull();
  });
  it('requires weights only during onboarding', () => {
    const d = { ...emptyBodyDraft, heightText: '170' };
    expect(parseBodyDraft(d, true).errors.weight).toBeDefined();
    expect(parseBodyDraft(d, false).value).toMatchObject({ heightCm: 170, weightKg: null });
  });
});

describe('goal form', () => {
  it('validates calories and keeps unknown PFC as null', () => {
    const d = { ...draftFromEstimate('lose', null), calorieText: '1800' };
    expect(parseGoalDraft(d).value).toEqual({
      goalType: 'lose',
      calorieKcal: 1800,
      proteinG: null,
      fatG: null,
      carbohydrateG: null,
    });
    expect(parseGoalDraft({ ...d, calorieText: '300' }).errors.calorie).toBeDefined();
  });
});

describe('premium state (mirrors public.is_premium)', () => {
  const now = new Date('2026-10-24T00:00:00Z');
  const row = (status: string, expires: string | null) => ({
    status,
    expires_at: expires,
    entitlement: 'premium',
  });
  it('is premium only while not expired/refunded and before expiry', () => {
    expect(isActivePremium(row('active', '2026-11-01T00:00:00Z'), now)).toBe(true);
    expect(isActivePremium(row('cancelled', '2026-11-01T00:00:00Z'), now)).toBe(true); // until period end
    expect(isActivePremium(row('active', '2026-10-01T00:00:00Z'), now)).toBe(false);
    expect(isActivePremium(row('refunded', '2026-11-01T00:00:00Z'), now)).toBe(false);
    expect(isActivePremium(null, now)).toBe(false);
  });
});
