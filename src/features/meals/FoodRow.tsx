import { StyleSheet, View } from 'react-native';

import { ChevronRightIcon } from '@/components/icons';
import { AppText, PressableScale } from '@/components/ui';
import type { FoodRecord } from '@/data/repo/foods';
import { formatKcal } from '@/domain/nutrition';
import { MIN_TAP, spacing, useTheme } from '@/theme';

export function FoodRow({
  food,
  onPress,
  trailingText,
  testID,
}: {
  food: FoodRecord;
  onPress: () => void;
  trailingText?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const kcal = food.per100g.energyKcal;
  const right = trailingText ?? (kcal === null ? '— kcal' : `${formatKcal(kcal)} kcal`);
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      haptic
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel={`${food.name}、100gあたり${kcal === null ? '不明' : `${formatKcal(kcal)}キロカロリー`}`}
      style={styles.row}
    >
      <View style={styles.texts}>
        <AppText variant="body" numberOfLines={2}>
          {food.name}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {food.source === 'custom' ? 'マイ食品' : (food.categoryName ?? '食品成分表')}
          {trailingText ? '' : ' ・ 100gあたり'}
        </AppText>
      </View>
      <AppText variant="subhead" color="textSecondary" tabular>
        {right}
      </AppText>
      <ChevronRightIcon color={colors.textTertiary} size={16} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TAP + 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  texts: { flex: 1, gap: 2 },
});
