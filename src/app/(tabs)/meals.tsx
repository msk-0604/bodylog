import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ClockIcon, LayersIcon, MealIcon, StarIcon } from '@/components/icons';
import {
  AppText,
  Button,
  Card,
  DateStepper,
  EmptyState,
  ListGroup,
  ListRow,
  Screen,
  SearchField,
  SectionHeader,
  SegmentedControl,
  Skeleton,
} from '@/components/ui';
import { writeLocal } from '@/data/hooks';
import { copyMeals } from '@/data/repo/meals';
import { addDays, formatDateKeyJa, type DateKey } from '@/domain/date';
import { FREE_LIMITS, usableTemplateIds } from '@/domain/entitlements';
import { MEAL_TYPE_LABELS, MEAL_TYPES } from '@/domain/mealType';
import { formatKcal } from '@/domain/nutrition';
import { DayMeals } from '@/features/meals/DayMeals';
import { FoodRow } from '@/features/meals/FoodRow';
import { FoodSearchResults } from '@/features/meals/FoodSearchResults';
import { useFavorites, useMealItems, useRecentFoods, useTemplates } from '@/features/meals/hooks';
import { useMealsUi } from '@/features/meals/mealsUi';
import { openFood } from '@/features/meals/navigation';
import { usePlan } from '@/features/premium/usePlan';
import { haptics } from '@/lib/haptics';
import { useToday } from '@/lib/useToday';
import { spacing, useTheme } from '@/theme';

const MEAL_SEGMENTS = MEAL_TYPES.map((t) => ({ value: t, label: MEAL_TYPE_LABELS[t] }));

function dayLabel(date: DateKey, today: DateKey) {
  if (date === today) return `今日 ${formatDateKeyJa(date)}`;
  if (date === addDays(today, -1)) return `昨日 ${formatDateKeyJa(date)}`;
  return formatDateKeyJa(date);
}

export default function MealsScreen() {
  const { colors } = useTheme();
  const today = useToday();
  const plan = usePlan();
  const { date, setDate, mealType, setMealType } = useMealsUi();
  const [query, setQuery] = useState('');

  // Follow the calendar day when the app stays open across midnight.
  const lastToday = useRef(today);
  useEffect(() => {
    if (lastToday.current !== today && date === lastToday.current) setDate(today);
    lastToday.current = today;
  }, [today, date, setDate]);

  const items = useMealItems(date);
  const favorites = useFavorites();
  const recent = useRecentFoods();
  const templates = useTemplates();
  const usable = usableTemplateIds(plan, templates.data ?? []);
  const target = { kind: 'meal' as const, date, mealType };

  const copyFrom = (from: DateKey, to: DateKey, message: string) => {
    Alert.alert('食事をコピー', message, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'コピー',
        onPress: async () => {
          const n = await writeLocal((db, uid) => copyMeals(db, uid, { from, to }));
          if (n === 0)
            Alert.alert(
              'コピーする食事がありません',
              `${formatDateKeyJa(from)}の記録はありません。`,
            );
          else {
            haptics.success();
            setDate(to);
          }
        },
      },
    ]);
  };

  return (
    <Screen title="食事" testID="meals-screen">
      <DateStepper
        label={dayLabel(date, today)}
        onPrev={() => setDate(addDays(date, -1))}
        onNext={() => setDate(addDays(date, 1))}
        nextDisabled={date >= today}
        trailing={
          date !== today ? (
            <Button label="今日" variant="ghost" size="md" onPress={() => setDate(today)} />
          ) : null
        }
      />
      <View style={styles.gapTop}>
        <SegmentedControl
          segments={MEAL_SEGMENTS}
          value={mealType}
          onChange={setMealType}
          accessibilityLabel="追加する食事区分"
        />
      </View>
      <View style={styles.search}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="食品名で検索（例：ごはん、たまご）"
          testID="food-search-input"
        />
      </View>

      {query.trim().length > 0 ? (
        <FoodSearchResults
          query={query}
          onSelect={(f) => void openFood(f, target)}
          onCreateCustom={() =>
            router.push({ pathname: '/custom-food', params: { name: query.trim() } })
          }
        />
      ) : (
        <>
          <SectionHeader title={date === today ? '今日の食事' : `${formatDateKeyJa(date)}の食事`} />
          {items.isLoading ? (
            <Skeleton height={120} radius={16} />
          ) : items.data && items.data.length > 0 ? (
            <DayMeals items={items.data} date={date} />
          ) : (
            <Card>
              <EmptyState
                compact
                icon={<MealIcon color={colors.accent} />}
                title="記録はまだありません"
                message="上の検索欄から食品を探して追加できます。"
              />
            </Card>
          )}
          <View style={styles.copyRow}>
            <Button
              label="前日の食事をコピー"
              variant="secondary"
              size="md"
              style={styles.flex}
              onPress={() =>
                copyFrom(
                  addDays(date, -1),
                  date,
                  `${formatDateKeyJa(addDays(date, -1))}の食事を、${formatDateKeyJa(date)}に追加します。`,
                )
              }
              testID="copy-previous-day"
            />
            {date !== today && (items.data?.length ?? 0) > 0 ? (
              <Button
                label="今日にコピー"
                variant="secondary"
                size="md"
                style={styles.flex}
                onPress={() =>
                  copyFrom(date, today, `${formatDateKeyJa(date)}の食事を、今日に追加します。`)
                }
              />
            ) : null}
          </View>

          <SectionHeader
            title="お気に入り"
            trailing={
              <AppText variant="footnote" color="textSecondary" tabular>
                {favorites.data?.length ?? 0}
                {plan === 'free' ? ` / ${FREE_LIMITS.favorites}` : ''}
              </AppText>
            }
          />
          {favorites.data && favorites.data.length > 0 ? (
            <ListGroup>
              {favorites.data.map((f) => (
                <FoodRow key={f.id} food={f.food} onPress={() => void openFood(f.food, target)} />
              ))}
            </ListGroup>
          ) : (
            <Card>
              <EmptyState
                compact
                icon={<StarIcon color={colors.accent} />}
                title="お気に入りはまだありません"
                message="食品の画面で ☆ をタップすると登録できます。"
              />
            </Card>
          )}

          <SectionHeader
            title="食事テンプレート"
            trailing={
              <AppText variant="footnote" color="textSecondary" tabular>
                {templates.data?.length ?? 0}
                {plan === 'free' ? ` / ${FREE_LIMITS.templates}` : ''}
              </AppText>
            }
          />
          {templates.data && templates.data.length > 0 ? (
            <ListGroup>
              {templates.data.map((t) => (
                <ListRow
                  key={t.id}
                  title={t.name}
                  subtitle={`${t.items.length}品 ・ 約${formatKcal(t.energyKcal)} kcal${usable.has(t.id) ? '' : ' ・ Premiumで利用可'}`}
                  onPress={() =>
                    router.push({
                      pathname: '/template/[id]',
                      params: { id: t.id, date, mealType },
                    })
                  }
                />
              ))}
            </ListGroup>
          ) : (
            <Card>
              <EmptyState
                compact
                icon={<LayersIcon color={colors.accent} />}
                title="テンプレートはまだありません"
                message="記録した食事の「テンプレートに保存」から作成でき、次回から一度に記録できます。"
              />
            </Card>
          )}

          <SectionHeader title="最近使った食品" />
          {recent.data && recent.data.length > 0 ? (
            <ListGroup>
              {recent.data.map((f) => (
                <FoodRow
                  key={`${f.source}:${f.id}`}
                  food={f}
                  onPress={() => void openFood(f, target)}
                />
              ))}
            </ListGroup>
          ) : (
            <Card>
              <EmptyState
                compact
                icon={<ClockIcon color={colors.accent} />}
                title="まだありません"
                message="記録した食品がここに表示され、すばやく追加できます。"
              />
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gapTop: { marginTop: spacing.sm },
  search: { marginTop: spacing.md, marginBottom: spacing.sm },
  copyRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});
