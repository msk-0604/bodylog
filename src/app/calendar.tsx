import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  Card,
  DateStepper,
  ListGroup,
  ListRow,
  ModalScreen,
  PressableScale,
  SectionHeader,
} from '@/components/ui';
import {
  addMonths,
  formatMonthJa,
  monthGrid,
  monthOf,
  monthRange,
  WEEKDAY_LABELS,
  type MonthKey,
} from '@/domain/calendar';
import { formatDateKeyJaLong, formatTimeJa, type DateKey } from '@/domain/date';
import { MEAL_TYPE_LABELS, MEAL_TYPES } from '@/domain/mealType';
import { formatGrams, formatKcal, sumNutrients } from '@/domain/nutrition';
import { exerciseSubtitle } from '@/features/exercise/ExerciseSection';
import { useDayMarks, useExercises, usePreferences } from '@/features/exercise/hooks';
import { useMealItems } from '@/features/meals/hooks';
import { useMealsUi } from '@/features/meals/mealsUi';
import { useWeights } from '@/features/profile/hooks';
import { useToday } from '@/lib/useToday';
import { MIN_TAP, radius, spacing, useTheme } from '@/theme';

/** Past records by day: dots show meals / weight / exercise; tap a day for details and editing. */
export default function CalendarScreen() {
  const today = useToday();
  const weekStartsOn = usePreferences().data?.weekStartsOn ?? 1;
  const [month, setMonth] = useState<MonthKey>(() => monthOf(today));
  const [selected, setSelected] = useState<DateKey>(today);
  const { first, last } = monthRange(month);
  const marks = useDayMarks(first, last).data;
  const grid = useMemo(() => monthGrid(month, weekStartsOn), [month, weekStartsOn]);
  const thisMonth = monthOf(today);
  const isFutureMonth =
    month.year > thisMonth.year ||
    (month.year === thisMonth.year && month.month >= thisMonth.month);

  return (
    <ModalScreen title="カレンダー" cancelLabel="閉じる" testID="calendar-screen">
      <DateStepper
        label={formatMonthJa(month)}
        onPrev={() => setMonth(addMonths(month, -1))}
        onNext={() => setMonth(addMonths(month, 1))}
        nextDisabled={isFutureMonth}
      />
      <Card padded={false} style={styles.calendar}>
        <View style={styles.week}>
          {WEEKDAY_LABELS(weekStartsOn).map((w) => (
            <AppText
              key={w}
              variant="caption"
              color="textSecondary"
              align="center"
              style={styles.cell}
            >
              {w}
            </AppText>
          ))}
        </View>
        {grid.map((week, i) => (
          <View key={i} style={styles.week}>
            {week.map((day, j) =>
              day ? (
                <DayCell
                  key={day}
                  day={day}
                  marks={marks?.get(day)}
                  selected={day === selected}
                  today={day === today}
                  future={day > today}
                  onPress={() => setSelected(day)}
                />
              ) : (
                <View key={`e${j}`} style={styles.cell} />
              ),
            )}
          </View>
        ))}
        <Legend />
      </Card>
      <DayDetail date={selected} today={today} />
    </ModalScreen>
  );
}

function DayCell({
  day,
  marks,
  selected,
  today,
  future,
  onPress,
}: {
  day: DateKey;
  marks?: { meals: boolean; weight: boolean; exercise: boolean };
  selected: boolean;
  today: boolean;
  future: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const n = Number(day.slice(8));
  const kinds = [
    marks?.meals ? '食事' : null,
    marks?.weight ? '体重' : null,
    marks?.exercise ? '運動' : null,
  ].filter(Boolean);
  return (
    <PressableScale
      onPress={onPress}
      disabled={future}
      haptic
      scaleTo={0.95}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: future }}
      accessibilityLabel={`${n}日${today ? '（今日）' : ''}、${kinds.length ? `${kinds.join('・')}の記録あり` : '記録なし'}`}
      style={[styles.cell, styles.day, selected && { backgroundColor: colors.accentSoft }]}
      testID={`cal-${day}`}
    >
      <AppText
        variant="subhead"
        color={future ? 'textTertiary' : today ? 'accent' : 'text'}
        style={today && styles.todayText}
      >
        {n}
      </AppText>
      <View style={styles.dots}>
        <Dot on={!!marks?.meals} color={colors.fat} />
        <Dot on={!!marks?.weight} color={colors.accent} />
        <Dot on={!!marks?.exercise} color={colors.protein} />
      </View>
    </PressableScale>
  );
}

function Dot({ on, color }: { on: boolean; color: string }) {
  return <View style={[styles.dot, { backgroundColor: on ? color : 'transparent' }]} />;
}

function Legend() {
  const { colors } = useTheme();
  return (
    <View style={styles.legend} importantForAccessibility="no-hide-descendants">
      {(
        [
          ['食事', colors.fat],
          ['体重', colors.accent],
          ['運動', colors.protein],
        ] as const
      ).map(([label, color]) => (
        <View key={label} style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <AppText variant="caption" color="textSecondary">
            {label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function DayDetail({ date, today }: { date: DateKey; today: DateKey }) {
  const meals = useMealItems(date).data ?? [];
  const weights = (useWeights().data ?? [])
    .filter((w) => w.measuredOn === date)
    .sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
  const exercises = useExercises({ from: date, to: date }).data ?? [];
  const totals = sumNutrients(meals.map((m) => m.nutrients));

  const openMeals = () => {
    useMealsUi.getState().setDate(date);
    router.dismissAll();
    router.navigate('/meals');
  };

  return (
    <View style={styles.gap}>
      <SectionHeader title={formatDateKeyJaLong(date)} />
      <Card style={styles.gapSm}>
        <AppText variant="headline">食事</AppText>
        {meals.length === 0 ? (
          <AppText variant="subhead" color="textSecondary">
            記録はありません
          </AppText>
        ) : (
          <>
            <AppText variant="subhead" tabular>
              {formatKcal(totals.energyKcal)} kcal ・ P {formatGrams(totals.proteinG)} g ・ F{' '}
              {formatGrams(totals.fatG)} g ・ C {formatGrams(totals.carbohydrateG)} g
            </AppText>
            {MEAL_TYPES.map((t) => {
              const items = meals.filter((m) => m.mealType === t);
              if (items.length === 0) return null;
              return (
                <AppText key={t} variant="footnote" color="textSecondary" numberOfLines={2}>
                  {MEAL_TYPE_LABELS[t]}：{items.map((i) => i.foodName).join('、')}
                </AppText>
              );
            })}
          </>
        )}
        <Button
          label={meals.length ? 'この日の食事を編集・コピー' : 'この日の食事を記録'}
          variant="secondary"
          size="md"
          onPress={openMeals}
          testID="calendar-open-meals"
        />
      </Card>

      <AppText variant="headline">体重</AppText>
      {weights.length ? (
        <ListGroup>
          {weights.map((w) => (
            <ListRow
              key={w.id}
              title={`${w.weightKg.toFixed(1)} kg`}
              subtitle={`${formatTimeJa(w.measuredAt)}${w.bodyFatPct !== null ? ` ・ 体脂肪 ${w.bodyFatPct.toFixed(1)}%` : ''}`}
              onPress={() => router.push({ pathname: '/weight-entry', params: { id: w.id } })}
            />
          ))}
        </ListGroup>
      ) : (
        <AppText variant="subhead" color="textSecondary">
          記録はありません
        </AppText>
      )}
      <Button
        label="この日の体重を記録"
        variant="ghost"
        size="md"
        onPress={() => router.push({ pathname: '/weight-entry', params: { date } })}
        disabled={date > today}
      />

      <AppText variant="headline">運動</AppText>
      {exercises.length ? (
        <ListGroup>
          {exercises.map((e) => (
            <ListRow
              key={e.id}
              title={e.name}
              subtitle={exerciseSubtitle(e)}
              onPress={() => router.push({ pathname: '/exercise-entry', params: { id: e.id } })}
            />
          ))}
        </ListGroup>
      ) : (
        <AppText variant="subhead" color="textSecondary">
          記録はありません
        </AppText>
      )}
      <Button
        label="この日の運動を記録"
        variant="ghost"
        size="md"
        onPress={() => router.push({ pathname: '/exercise-entry', params: { date } })}
        disabled={date > today}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  calendar: { paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  week: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center' },
  day: { minHeight: MIN_TAP, paddingVertical: spacing.xs, borderRadius: radius.md, gap: 3 },
  todayText: { fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gap: { gap: spacing.md },
  gapSm: { gap: spacing.sm },
});
