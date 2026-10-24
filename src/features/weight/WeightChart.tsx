import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { AppText } from '@/components/ui';
import { diffDays, formatDateKeyJa, lastNDays, type DateKey } from '@/domain/date';
import { movingAverage } from '@/domain/weight';
import { spacing, useTheme } from '@/theme';

type Props = {
  daily: ReadonlyMap<DateKey, number>;
  end: DateKey;
  days: number;
  height?: number;
};

const PAD_Y = 12;
/** Keeps the first/last dots fully visible. */
const PAD_X = 6;

/**
 * Minimal weight line chart. Days without records are skipped (never plotted as 0).
 * Shows daily values (dots + line) and the 7-day moving average (dashed).
 */
export function WeightChart({ daily, end, days, height = 160 }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const range = lastNDays(end, days);
  const start = range[0]!;
  const points = range.filter((d) => daily.has(d)).map((d) => ({ date: d, value: daily.get(d)! }));
  const avg = movingAverage(daily, 7).filter((p) => diffDays(start, p.date) >= 0);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (points.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <AppText variant="subhead" color="textSecondary" align="center">
          この期間の記録はありません
        </AppText>
      </View>
    );
  }

  const values = [...points.map((p) => p.value), ...avg.map((p) => p.value)];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 1) {
    const mid = (max + min) / 2;
    min = mid - 0.5;
    max = mid + 0.5;
  }
  const plotW = Math.max(width - PAD_X * 2, 0);
  const x = (d: DateKey) =>
    PAD_X + (days <= 1 ? plotW / 2 : (diffDays(start, d) / (days - 1)) * plotW);
  const y = (v: number) => PAD_Y + (1 - (v - min) / (max - min)) * (height - PAD_Y * 2);
  const toPath = (ps: { date: DateKey; value: number }[]) =>
    ps
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join(' ');

  const last = points.at(-1)!;
  const a11y = `${formatDateKeyJa(start)}から${formatDateKeyJa(end)}の体重グラフ。記録${points.length}日、最小${min.toFixed(1)}キロ、最大${max.toFixed(1)}キロ、最新${last.value.toFixed(1)}キロ`;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={a11y}>
      <View style={[styles.chart, { height }]} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {[0, 0.5, 1].map((t) => (
              <Line
                key={t}
                x1={0}
                x2={width}
                y1={PAD_Y + t * (height - PAD_Y * 2)}
                y2={PAD_Y + t * (height - PAD_Y * 2)}
                stroke={colors.separator}
                strokeWidth={1}
              />
            ))}
            {avg.length > 1 ? (
              <Path
                d={toPath(avg)}
                stroke={colors.textTertiary}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fill="none"
              />
            ) : null}
            {points.length > 1 ? (
              <Path d={toPath(points)} stroke={colors.accent} strokeWidth={2.5} fill="none" />
            ) : null}
            {points.map((p) => (
              <Circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={3.5} fill={colors.accent} />
            ))}
          </Svg>
        ) : null}
      </View>
      <View style={styles.axis}>
        <AppText variant="caption" color="textTertiary">
          {formatDateKeyJa(start)}
        </AppText>
        <AppText variant="caption" color="textTertiary">
          {max.toFixed(1)} – {min.toFixed(1)} kg
        </AppText>
        <AppText variant="caption" color="textTertiary">
          {formatDateKeyJa(end)}
        </AppText>
      </View>
      <View style={styles.legend}>
        <View style={[styles.legendLine, { backgroundColor: colors.accent }]} />
        <AppText variant="caption" color="textSecondary">
          体重（1日の最初の記録）
        </AppText>
        <View
          style={[styles.legendLine, styles.legendDash, { borderColor: colors.textTertiary }]}
        />
        <AppText variant="caption" color="textSecondary">
          7日移動平均
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  chart: { width: '100%' },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  legendLine: { width: 16, height: 3, borderRadius: 2, marginLeft: spacing.xs },
  legendDash: {
    height: 0,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
});
