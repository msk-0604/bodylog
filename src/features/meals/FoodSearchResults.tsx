import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { PlusIcon, SearchIcon } from '@/components/icons';
import { AppText, Button, Card, EmptyState, ListGroup } from '@/components/ui';
import type { FoodRecord } from '@/data/repo/foods';
import { spacing, useTheme } from '@/theme';

import { FoodRow } from './FoodRow';
import { useFoodSearch } from './hooks';

/** Search results for a non-empty query (on-device + server). */
export function FoodSearchResults({
  query,
  onSelect,
  onCreateCustom,
}: {
  query: string;
  onSelect: (food: FoodRecord) => void;
  onCreateCustom: () => void;
}) {
  const { colors } = useTheme();
  const { results, searchingRemote, remoteUnavailable } = useFoodSearch(query);

  return (
    <View style={styles.gap}>
      {remoteUnavailable ? (
        <AppText variant="caption" color="textSecondary">
          オフラインのため、この端末に保存されている食品（マイ食品・最近使った食品など）から検索しています。
        </AppText>
      ) : null}
      {results.length > 0 ? (
        <ListGroup>
          {results.map((f) => (
            <FoodRow
              key={`${f.source}:${f.id}`}
              food={f}
              onPress={() => onSelect(f)}
              testID={`food-result-${f.name}`}
            />
          ))}
        </ListGroup>
      ) : searchingRemote ? null : (
        <Card>
          <EmptyState
            compact
            icon={<SearchIcon color={colors.accent} />}
            title={`「${query.trim()}」に一致する食品はありません`}
            message="表記を変えて検索するか、商品の栄養成分表示から「マイ食品」として登録できます。"
          />
        </Card>
      )}
      {searchingRemote ? <ActivityIndicator color={colors.accent} /> : null}
      <Button
        label="マイ食品を登録"
        variant="secondary"
        size="md"
        icon={<PlusIcon color={colors.accent} size={18} />}
        onPress={onCreateCustom}
        testID="create-custom-food"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
});
