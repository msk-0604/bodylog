import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ClockIcon, LayersIcon, SearchIcon, StarIcon } from '@/components/icons';
import {
  AppText,
  Card,
  EmptyState,
  Screen,
  SearchField,
  SectionHeader,
  SegmentedControl,
} from '@/components/ui';
import { FREE_LIMITS } from '@/domain/entitlements';
import { MEAL_TYPE_LABELS, MEAL_TYPES, suggestMealType, type MealType } from '@/domain/mealType';
import { normalizeForSearch } from '@/domain/searchNormalize';
import { spacing, useTheme } from '@/theme';

const MEAL_SEGMENTS = MEAL_TYPES.map((t) => ({ value: t, label: MEAL_TYPE_LABELS[t] }));

export default function MealsScreen() {
  const { colors } = useTheme();
  const [mealType, setMealType] = useState<MealType>(() => suggestMealType(new Date()));
  const [query, setQuery] = useState('');
  const normalized = useMemo(() => normalizeForSearch(query), [query]);

  // TODO(Phase 3): replace with food search / favorites / templates repositories.
  const favoritesCount = 0;
  const templatesCount = 0;

  return (
    <Screen title="食事" testID="meals-screen">
      <SegmentedControl
        segments={MEAL_SEGMENTS}
        value={mealType}
        onChange={setMealType}
        accessibilityLabel="食事区分"
      />
      <View style={styles.search}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="食品名で検索（例：ごはん、たまご）"
          testID="food-search-input"
        />
      </View>

      {normalized.length > 0 ? (
        <Card>
          <EmptyState
            compact
            icon={<SearchIcon color={colors.accent} />}
            title={`「${query.trim()}」の検索結果`}
            message="食品データベースを準備しています。日本食品標準成分表のデータを取り込み後、ここに検索結果が表示されます。"
          />
        </Card>
      ) : (
        <>
          <SectionHeader title="最近使った食品" />
          <Card>
            <EmptyState
              compact
              icon={<ClockIcon color={colors.accent} />}
              title="まだありません"
              message="記録した食品がここに表示され、ワンタップで追加できます。"
            />
          </Card>

          <SectionHeader
            title="お気に入り"
            trailing={
              <AppText variant="footnote" color="textSecondary" tabular>
                {favoritesCount} / {FREE_LIMITS.favorites}
              </AppText>
            }
          />
          <Card>
            <EmptyState
              compact
              icon={<StarIcon color={colors.accent} />}
              title="お気に入りはまだありません"
              message="よく食べる食品をお気に入りに登録すると、すばやく記録できます。"
            />
          </Card>

          <SectionHeader
            title="食事テンプレート"
            trailing={
              <AppText variant="footnote" color="textSecondary" tabular>
                {templatesCount} / {FREE_LIMITS.templates}
              </AppText>
            }
          />
          <Card>
            <EmptyState
              compact
              icon={<LayersIcon color={colors.accent} />}
              title="テンプレートはまだありません"
              message="「いつもの朝食」のように、複数の食品をまとめて一度に記録できます。"
            />
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { marginTop: spacing.md },
});
