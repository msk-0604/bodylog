import { StyleSheet, View } from 'react-native';

import { AppText, Card, SegmentedControl, TextField } from '@/components/ui';
import {
  CALORIE_GOAL_MAX,
  CALORIE_GOAL_MIN,
  GOAL_TYPE_LABELS,
  goalWarnings,
  pfcGramsFromCalories,
  type CalorieEstimate,
  type GoalType,
} from '@/domain/goals';
import { formatKcal } from '@/domain/nutrition';
import { parseDecimalInput } from '@/domain/weight';
import { spacing, useTheme } from '@/theme';

export type GoalDraft = {
  goalType: GoalType;
  calorieText: string;
  proteinText: string;
  fatText: string;
  carbText: string;
  /** true while the kcal field still holds the automatic estimate */
  usingEstimate: boolean;
};

export function draftFromEstimate(goalType: GoalType, estimate: CalorieEstimate | null): GoalDraft {
  const kcal = estimate?.goalKcal ?? null;
  const pfc = kcal ? pfcGramsFromCalories(kcal) : null;
  return {
    goalType,
    calorieText: kcal ? String(kcal) : '',
    proteinText: pfc ? String(pfc.proteinG) : '',
    fatText: pfc ? String(pfc.fatG) : '',
    carbText: pfc ? String(pfc.carbohydrateG) : '',
    usingEstimate: !!kcal,
  };
}

export type ParsedGoal = {
  goalType: GoalType;
  calorieKcal: number;
  proteinG: number | null;
  fatG: number | null;
  carbohydrateG: number | null;
};

export function parseGoalDraft(d: GoalDraft): {
  value: ParsedGoal | null;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const kcal = parseDecimalInput(d.calorieText);
  if (kcal === null || kcal < CALORIE_GOAL_MIN || kcal > CALORIE_GOAL_MAX) {
    errors.calorie = `${CALORIE_GOAL_MIN}〜${CALORIE_GOAL_MAX}kcalの範囲で入力してください`;
  }
  const grams = (t: string, key: string) => {
    if (t.trim() === '') return null;
    const v = parseDecimalInput(t);
    if (v === null || v > 1000) errors[key] = '0〜1000gで入力してください';
    return v;
  };
  const p = grams(d.proteinText, 'protein');
  const f = grams(d.fatText, 'fat');
  const c = grams(d.carbText, 'carb');
  if (Object.keys(errors).length > 0 || kcal === null) return { value: null, errors };
  return {
    value: {
      goalType: d.goalType,
      calorieKcal: Math.round(kcal),
      proteinG: p,
      fatG: f,
      carbohydrateG: c,
    },
    errors,
  };
}

const GOAL_SEGMENTS = (['lose', 'maintain', 'gain'] as const).map((g) => ({
  value: g,
  label: GOAL_TYPE_LABELS[g],
}));

/** Editor for calorie / PFC goals with the estimate explanation and gentle warnings. */
export function GoalEditor({
  draft,
  onChange,
  estimate,
  currentKg,
  targetKg,
  showErrors,
}: {
  draft: GoalDraft;
  onChange: (d: GoalDraft) => void;
  estimate: CalorieEstimate | null;
  currentKg: number | null;
  targetKg: number | null;
  showErrors: boolean;
}) {
  const { colors } = useTheme();
  const { value, errors } = parseGoalDraft(draft);
  const warnings = value
    ? goalWarnings({
        calorieKcal: value.calorieKcal,
        bmr: estimate?.bmr ?? null,
        currentKg,
        targetKg,
      })
    : [];

  const setKcal = (t: string) => {
    const kcal = parseDecimalInput(t);
    // Keep PFC in the default balance while the user adjusts calories.
    const pfc = kcal ? pfcGramsFromCalories(kcal) : null;
    onChange({
      ...draft,
      calorieText: t,
      usingEstimate: false,
      ...(pfc
        ? {
            proteinText: String(pfc.proteinG),
            fatText: String(pfc.fatG),
            carbText: String(pfc.carbohydrateG),
          }
        : {}),
    });
  };

  return (
    <View style={styles.gap}>
      <SegmentedControl
        segments={GOAL_SEGMENTS}
        value={draft.goalType}
        onChange={(g) => onChange({ ...draft, goalType: g })}
        accessibilityLabel="目標の種類"
      />
      {estimate ? (
        <Card style={[styles.estimate, { backgroundColor: colors.accentSoft }]}>
          <AppText variant="subhead">
            推定消費エネルギー 約{formatKcal(estimate.tdee)} kcal/日（推定基礎代謝 約
            {formatKcal(estimate.bmr)} kcal）
          </AppText>
          <AppText variant="caption" color="textSecondary">
            基礎代謝は国立健康・栄養研究所の式で推定し、身体活動レベルを掛けて算出しています。目標摂取カロリーは
            {GOAL_TYPE_LABELS[draft.goalType]}
            に合わせて調整した推定値です（推定基礎代謝を下回らないようにしています）。医学的な指示ではありません。
          </AppText>
        </Card>
      ) : (
        <AppText variant="caption" color="textSecondary">
          身長・体重・生年月日・性別（男性/女性）を入力すると、目標カロリーの推定値を表示できます。
        </AppText>
      )}
      <TextField
        label={draft.usingEstimate ? '1日の目標摂取カロリー（推定値）' : '1日の目標摂取カロリー'}
        unit="kcal"
        value={draft.calorieText}
        onChangeText={setKcal}
        keyboardType="number-pad"
        error={showErrors ? errors.calorie : null}
        testID="goal-kcal-input"
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label="たんぱく質"
            unit="g"
            value={draft.proteinText}
            onChangeText={(t) => onChange({ ...draft, proteinText: t })}
            keyboardType="decimal-pad"
            error={showErrors ? errors.protein : null}
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label="脂質"
            unit="g"
            value={draft.fatText}
            onChangeText={(t) => onChange({ ...draft, fatText: t })}
            keyboardType="decimal-pad"
            error={showErrors ? errors.fat : null}
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label="炭水化物"
            unit="g"
            value={draft.carbText}
            onChangeText={(t) => onChange({ ...draft, carbText: t })}
            keyboardType="decimal-pad"
            error={showErrors ? errors.carb : null}
          />
        </View>
      </View>
      <AppText variant="caption" color="textTertiary">
        PFCは目標カロリーに対し たんぱく質20%・脂質25%・炭水化物55%
        を初期値にしています（変更できます）。
      </AppText>
      {warnings.map((w) => (
        <AppText key={w} variant="footnote" color="warning">
          {w}
        </AppText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  estimate: { gap: spacing.xs },
});
