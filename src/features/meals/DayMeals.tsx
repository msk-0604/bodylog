import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, ListGroup, ListRow, PressableScale } from '@/components/ui';
import type { MealItemView } from '@/data/repo/meals';
import type { DateKey } from '@/domain/date';
import { MEAL_TYPE_LABELS, MEAL_TYPES, type MealType } from '@/domain/mealType';
import { formatGrams, formatKcal, sumNutrients } from '@/domain/nutrition';
import { spacing } from '@/theme';

/** Logged items of one day, grouped by meal type, each item tappable for editing. */
export function DayMeals({ items, date }: { items: readonly MealItemView[]; date: DateKey }) {
  const totals = sumNutrients(items.map((i) => i.nutrients));
  return (
    <View style={styles.gap}>
      <Card style={styles.totals}>
        <Total label="合計" value={`${formatKcal(totals.energyKcal)} kcal`} />
        <Total label="P" value={`${formatGrams(totals.proteinG)} g`} />
        <Total label="F" value={`${formatGrams(totals.fatG)} g`} />
        <Total label="C" value={`${formatGrams(totals.carbohydrateG)} g`} />
      </Card>
      {MEAL_TYPES.map((type) => {
        const group = items.filter((i) => i.mealType === type);
        if (group.length === 0) return null;
        return <MealGroup key={type} type={type} items={group} date={date} />;
      })}
    </View>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.total}>
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
      <AppText variant="subhead" tabular numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

function MealGroup({
  type,
  items,
  date,
}: {
  type: MealType;
  items: MealItemView[];
  date: DateKey;
}) {
  const kcal = sumNutrients(items.map((i) => i.nutrients)).energyKcal;
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <AppText variant="headline">{MEAL_TYPE_LABELS[type]}</AppText>
        <AppText variant="subhead" color="textSecondary" tabular style={styles.flex}>
          {'  '}
          {formatKcal(kcal)} kcal
        </AppText>
        <PressableScale
          onPress={() =>
            router.push({ pathname: '/template/new', params: { date, mealType: type } })
          }
          accessibilityRole="button"
          accessibilityLabel={`${MEAL_TYPE_LABELS[type]}をテンプレートに保存`}
          style={styles.groupAction}
        >
          <AppText variant="footnote" color="accent">
            テンプレートに保存
          </AppText>
        </PressableScale>
      </View>
      <ListGroup>
        {items.map((i) => (
          <ListRow
            key={i.id}
            testID={`meal-item-${i.foodName}`}
            title={i.foodName}
            subtitle={`${formatGrams(i.grams).replace(/\.0$/, '')} g${i.syncError ? ' ・ 同期できませんでした' : ''}`}
            value={
              i.nutrients.energyKcal === null
                ? '— kcal'
                : `${formatKcal(i.nutrients.energyKcal)} kcal`
            }
            onPress={() => router.push({ pathname: '/meal-item/[id]', params: { id: i.id } })}
            accessibilityHint="分量の変更や削除ができます"
          />
        ))}
      </ListGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: spacing.lg },
  totals: { flexDirection: 'row', paddingVertical: spacing.md },
  total: { flex: 1, alignItems: 'center', gap: 2 },
  group: { gap: spacing.sm },
  groupHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs },
  groupAction: { paddingVertical: spacing.sm, paddingLeft: spacing.sm },
});
