import { StyleSheet, View } from 'react-native';

import { DumbbellIcon, MealIcon, PlusIcon, ScaleIcon } from '@/components/icons';
import { AppText, Button, Card, EmptyState, ProgressBar, ProgressRing } from '@/components/ui';
import { MEAL_TYPE_LABELS, MEAL_TYPES } from '@/domain/mealType';
import {
  calorieBalance,
  formatGrams,
  formatKcal,
  sumNutrients,
  type NutrientTotals,
} from '@/domain/nutrition';
import type { WeightMeasurement } from '@/domain/weight';
import type { ExerciseRecord, MealItemRecord } from '@/features/records/localRecordsStore';
import { spacing, useTheme } from '@/theme';

/* ---------------- Calories ---------------- */

export function CalorieCard({ intake, goal }: { intake: number; goal: number | null }) {
  const { colors } = useTheme();
  const balance = goal ? calorieBalance(intake, goal) : null;
  const isOver = !!balance && balance.over > 0;

  const a11y = balance
    ? `摂取${formatKcal(intake)}キロカロリー、目標${formatKcal(balance.goal)}キロカロリー、` +
      (isOver
        ? `${formatKcal(balance.over)}キロカロリー超過`
        : `残り${formatKcal(balance.remaining)}キロカロリー`)
    : `摂取${formatKcal(intake)}キロカロリー、目標未設定`;

  return (
    <Card style={styles.calorieCard}>
      <ProgressRing
        progress={balance?.ratio ?? 0}
        size={208}
        strokeWidth={16}
        accessibilityLabel={a11y}
      >
        <AppText variant="footnote" color="textSecondary">
          {isOver ? '目標を超えています' : balance ? '残り' : '摂取'}
        </AppText>
        <AppText
          variant="display"
          tabular
          maxFontSizeMultiplier={1.4}
          color={isOver ? 'warning' : 'text'}
        >
          {balance
            ? isOver
              ? `+${formatKcal(balance.over)}`
              : formatKcal(balance.remaining)
            : formatKcal(intake)}
        </AppText>
        <AppText variant="footnote" color="textSecondary">
          kcal
        </AppText>
      </ProgressRing>

      <View style={styles.calorieStats}>
        <Stat label="摂取" value={`${formatKcal(intake)}`} unit="kcal" />
        <View style={[styles.statDivider, { backgroundColor: colors.separator }]} />
        <Stat label="目標" value={goal ? formatKcal(goal) : '未設定'} unit={goal ? 'kcal' : ''} />
      </View>
    </Card>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="footnote" color="textSecondary">
        {label}
      </AppText>
      <AppText variant="headline" tabular>
        {value}
        {unit ? (
          <AppText variant="footnote" color="textSecondary">
            {' '}
            {unit}
          </AppText>
        ) : null}
      </AppText>
    </View>
  );
}

/* ---------------- PFC ---------------- */

type PfcGoals = { proteinG: number | null; fatG: number | null; carbohydrateG: number | null };

export function PfcCard({ totals, goals }: { totals: NutrientTotals; goals: PfcGoals }) {
  const { colors } = useTheme();
  const rows = [
    { key: 'proteinG', letter: 'P', label: 'たんぱく質', color: colors.protein },
    { key: 'fatG', letter: 'F', label: '脂質', color: colors.fat },
    { key: 'carbohydrateG', letter: 'C', label: '炭水化物', color: colors.carbohydrate },
  ] as const;

  return (
    <Card style={styles.pfcCard}>
      {rows.map((r) => {
        const intake = totals[r.key];
        const goal = goals[r.key];
        const incomplete = totals.incomplete[r.key];
        return (
          <View
            key={r.key}
            style={styles.pfcRow}
            accessible
            accessibilityLabel={`${r.label} ${formatGrams(intake)}グラム、目標${
              goal ? `${formatGrams(goal)}グラム` : '未設定'
            }${incomplete ? '、一部の食品は値が不明' : ''}`}
          >
            <View style={styles.pfcHead}>
              <View style={[styles.pfcBadge, { backgroundColor: r.color }]}>
                <AppText variant="caption" style={styles.pfcLetter}>
                  {r.letter}
                </AppText>
              </View>
              <AppText variant="subhead" style={styles.flex}>
                {r.label}
              </AppText>
              <AppText variant="subhead" tabular>
                {formatGrams(intake)}
                {incomplete ? '*' : ''}
                <AppText variant="footnote" color="textSecondary">
                  {' / '}
                  {goal ? `${formatGrams(goal)} g` : '未設定'}
                </AppText>
              </AppText>
            </View>
            <ProgressBar progress={goal ? intake / goal : 0} color={r.color} />
          </View>
        );
      })}
      {rows.some((r) => totals.incomplete[r.key]) ? (
        <AppText variant="caption" color="textTertiary">
          * 一部の食品は成分値が不明のため合計に含まれていません
        </AppText>
      ) : null}
    </Card>
  );
}

/* ---------------- Weight ---------------- */

export function WeightCard({
  latest,
  change,
  targetKg,
  onRecord,
}: {
  latest: WeightMeasurement | null;
  change: number | null;
  targetKg: number | null;
  onRecord: () => void;
}) {
  const { colors } = useTheme();
  if (!latest) {
    return (
      <Card>
        <EmptyState
          compact
          icon={<ScaleIcon color={colors.accent} />}
          title="体重はまだ記録されていません"
          message="毎日同じタイミングで測ると、変化がわかりやすくなります。"
          actionLabel="体重を記録"
          onAction={onRecord}
        />
      </Card>
    );
  }

  const toGoal = targetKg !== null ? latest.weightKg - targetKg : null;
  const changeText =
    change === null
      ? '—'
      : change === 0
        ? '±0.0'
        : `${change > 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}`;

  return (
    <Card>
      <View style={styles.weightRow}>
        <View style={styles.flex}>
          <AppText variant="footnote" color="textSecondary">
            最新体重
          </AppText>
          <AppText variant="title1" tabular>
            {latest.weightKg.toFixed(1)}
            <AppText variant="subhead" color="textSecondary">
              {' '}
              kg
            </AppText>
          </AppText>
        </View>
        <View style={styles.weightMeta}>
          <AppText variant="footnote" color="textSecondary">
            前回比
          </AppText>
          <AppText variant="headline" tabular>
            {changeText}
            {change !== null ? ' kg' : ''}
          </AppText>
        </View>
        <View style={styles.weightMeta}>
          <AppText variant="footnote" color="textSecondary">
            目標まで
          </AppText>
          <AppText variant="headline" tabular>
            {toGoal === null ? '未設定' : toGoal <= 0 ? '達成' : `${toGoal.toFixed(1)} kg`}
          </AppText>
        </View>
      </View>
      <Button
        label="体重を記録"
        variant="secondary"
        size="md"
        icon={<PlusIcon color={colors.accent} size={18} />}
        onPress={onRecord}
        style={styles.cardButton}
      />
    </Card>
  );
}

/* ---------------- Meals ---------------- */

export function TodayMealsCard({
  items,
  onAdd,
}: {
  items: readonly MealItemRecord[];
  onAdd: () => void;
}) {
  const { colors } = useTheme();
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          compact
          icon={<MealIcon color={colors.accent} />}
          title="今日の食事はまだありません"
          message="食品を検索して、分量を選ぶだけで記録できます。"
          actionLabel="食事を追加"
          onAction={onAdd}
        />
      </Card>
    );
  }

  return (
    <Card style={styles.mealsCard}>
      {MEAL_TYPES.map((type) => {
        const group = items.filter((i) => i.mealType === type);
        if (group.length === 0) return null;
        const kcal = sumNutrients(group.map((g) => g.nutrients)).energyKcal;
        return (
          <View key={type} style={styles.mealGroup}>
            <View style={styles.mealHead}>
              <AppText variant="headline">{MEAL_TYPE_LABELS[type]}</AppText>
              <AppText variant="subhead" color="textSecondary" tabular>
                {formatKcal(kcal)} kcal
              </AppText>
            </View>
            {group.map((i) => (
              <AppText key={i.id} variant="subhead" color="textSecondary" numberOfLines={1}>
                {i.foodName} {i.grams}g
              </AppText>
            ))}
          </View>
        );
      })}
      <Button
        label="食事を追加"
        variant="secondary"
        size="md"
        icon={<PlusIcon color={colors.accent} size={18} />}
        onPress={onAdd}
      />
    </Card>
  );
}

/* ---------------- Exercise ---------------- */

export function TodayExerciseCard({ items }: { items: readonly ExerciseRecord[] }) {
  const { colors } = useTheme();
  if (items.length === 0) {
    return (
      <Card>
        <View style={styles.inlineEmpty}>
          <DumbbellIcon color={colors.textTertiary} />
          <AppText variant="subhead" color="textSecondary" style={styles.flex}>
            今日の運動記録はありません。「記録」タブから追加できます。
          </AppText>
        </View>
      </Card>
    );
  }
  return (
    <Card style={styles.mealsCard}>
      {items.map((e) => (
        <View key={e.id} style={styles.mealHead}>
          <AppText variant="body">{e.name}</AppText>
          <AppText variant="subhead" color="textSecondary" tabular>
            {e.durationMin}分{e.kcal !== null ? `・推定${formatKcal(e.kcal)} kcal` : ''}
          </AppText>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  calorieCard: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xxl },
  calorieStats: { flexDirection: 'row', alignSelf: 'stretch', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  pfcCard: { gap: spacing.lg },
  pfcRow: { gap: spacing.sm },
  pfcHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pfcBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pfcLetter: { color: '#FFFFFF', fontWeight: '700' },
  weightRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.lg },
  weightMeta: { alignItems: 'flex-end', gap: 2 },
  cardButton: { marginTop: spacing.lg },
  mealsCard: { gap: spacing.lg },
  mealGroup: { gap: spacing.xs },
  mealHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inlineEmpty: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
