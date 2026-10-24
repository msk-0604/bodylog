import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { AppText } from '@/components/ui';
import { addDays, diffDays, formatDateKeyJa, type DateKey } from '@/domain/date';
import { movingAverageSeries } from '@/domain/weightAnalysis';
import { spacing, useTheme } from '@/theme';

type Props = {
  daily: ReadonlyMap<DateKey, number>;
  end: DateKey;
  days: number;
  unit: 'kg' | '%';
  /** draws the 7-day moving average */
  showAverage?: boolean;
  /** horizontal reference line (e.g. target weight) */
  target?: number | null;
  height?: number;
};

const PAD_Y = 12;
/** Keeps the first/last dots fully visible. */
const PAD_X = 6;
/** Above this many points, dots are omitted (line only) to stay readable. */
const MAX_DOTS = 45;

/**
 * Line chart of daily values. Days without records are skipped (never plotted as 0).
 */
export function WeightChart({
  daily,
  end,
  days,
  unit,
  showAverage = true,
  target = null,
  height = 170,
}: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const start = addDays(end, -(days - 1));
  const inRange = (d: DateKey) => d >= start && d <= end;
  const points = [...daily.entries()]
    .filter(([d]) => inRange(d))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
  const avg = showAverage ? movingAverageSeries(daily, 7).filter((p) => inRange(p.date)) : [];

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
  if (target !== null) values.push(target);
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
  const label = unit === 'kg' ? '体重' : '体脂肪率';
  const a11y = `${formatDateKeyJa(start)}から${formatDateKeyJa(end)}の${label}グラフ。記録${points.length}日、最小${min.toFixed(1)}${unit}、最大${max.toFixed(1)}${unit}、最新${last.value.toFixed(1)}${unit}`;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={a11y} testID="weight-chart">
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
            {target !== null ? (
              <Line
                x1={0}
                x2={width}
                y1={y(target)}
                y2={y(target)}
                stroke={colors.success}
                strokeWidth={1.5}
                strokeDasharray="2 4"
              />
            ) : null}
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
            {(points.length <= MAX_DOTS ? points : [last]).map((p) => (
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
          {max.toFixed(1)} – {min.toFixed(1)} {unit}
        </AppText>
        <AppText variant="caption" color="textTertiary">
          {formatDateKeyJa(end)}
        </AppText>
      </View>
      <View style={styles.legend}>
        <View style={[styles.legendLine, { backgroundColor: colors.accent }]} />
        <AppText variant="caption" color="textSecondary">
          {label}（1日の最初の記録）
        </AppText>
        {showAverage ? (
          <>
            <View
              style={[styles.legendLine, styles.legendDash, { borderColor: colors.textTertiary }]}
            />
            <AppText variant="caption" color="textSecondary">
              7日移動平均
            </AppText>
          </>
        ) : null}
        {target !== null ? (
          <>
            <View style={[styles.legendLine, styles.legendDash, { borderColor: colors.success }]} />
            <AppText variant="caption" color="textSecondary">
              目標
            </AppText>
          </>
        ) : null}
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
