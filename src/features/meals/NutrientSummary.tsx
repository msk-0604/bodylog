import { StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { formatGrams, formatKcal, type Nutrients } from '@/domain/nutrition';
import { spacing, useTheme } from '@/theme';

/** Calories + PFC for an amount. Unknown values are shown as 「不明」, never 0. */
export function NutrientSummary({
  nutrients,
  caption,
}: {
  nutrients: Nutrients | null;
  caption: string;
}) {
  const { colors } = useTheme();
  const v = (x: number | null | undefined, f: (n: number) => string) =>
    x === null || x === undefined ? '不明' : f(x);
  const kcal = nutrients?.energyKcal;
  return (
    <Card style={styles.card}>
      <AppText variant="footnote" color="textSecondary">
        {caption}
      </AppText>
      <AppText variant="display" tabular maxFontSizeMultiplier={1.4} testID="nutrient-kcal">
        {nutrients ? v(kcal, formatKcal) : '—'}
        <AppText variant="subhead" color="textSecondary">
          {' '}
          kcal
        </AppText>
      </AppText>
      <View style={styles.row}>
        {(
          [
            ['たんぱく質', nutrients?.proteinG, colors.protein],
            ['脂質', nutrients?.fatG, colors.fat],
            ['炭水化物', nutrients?.carbohydrateG, colors.carbohydrate],
          ] as const
        ).map(([label, value, color]) => (
          <View key={label} style={styles.cell}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <AppText variant="caption" color="textSecondary">
              {label}
            </AppText>
            <AppText variant="headline" tabular>
              {nutrients ? v(value, (n) => `${formatGrams(n)} g`) : '—'}
            </AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', alignSelf: 'stretch', marginTop: spacing.sm },
  cell: { flex: 1, alignItems: 'center', gap: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
