import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { DumbbellIcon, PlusIcon, ScaleIcon } from '@/components/icons';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  ListGroup,
  ListRow,
  Screen,
  SectionHeader,
  SegmentedControl,
} from '@/components/ui';
import { formatDateKeyJa, formatTimeJa } from '@/domain/date';
import {
  GRAPH_RANGE_LABELS,
  GRAPH_RANGES,
  isGraphRangeAvailable,
  type GraphRange,
} from '@/domain/entitlements';
import { averageOverDays, dailyWeights } from '@/domain/weight';
import { usePlan } from '@/features/premium/usePlan';
import { useWeights } from '@/features/profile/hooks';
import { WeightChart } from '@/features/weight/WeightChart';
import { useToday } from '@/lib/useToday';
import { spacing, useTheme } from '@/theme';

type Tab = 'weight' | 'exercise';
const TABS = [
  { value: 'weight', label: '体重' },
  { value: 'exercise', label: '運動' },
] as const;

const RANGE_DAYS: Record<Exclude<GraphRange, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

export default function RecordsScreen() {
  const [tab, setTab] = useState<Tab>('weight');
  return (
    <Screen title="記録" testID="records-screen">
      <SegmentedControl
        segments={TABS}
        value={tab}
        onChange={setTab}
        accessibilityLabel="記録の種類"
      />
      {tab === 'weight' ? <WeightSection /> : <ExerciseSection />}
    </Screen>
  );
}

function WeightSection() {
  const { colors } = useTheme();
  const today = useToday();
  const plan = usePlan();
  const [range, setRange] = useState<GraphRange>('7d');
  const weightsQuery = useWeights();
  const weights = useMemo(() => weightsQuery.data ?? [], [weightsQuery.data]);

  const daily = useMemo(() => dailyWeights(weights), [weights]);
  const sorted = useMemo(
    () => [...weights].sort((a, b) => b.measuredAt.getTime() - a.measuredAt.getTime()),
    [weights],
  );
  const avg7 = averageOverDays(daily, today, 7);
  const avg30 = averageOverDays(daily, today, 30);

  const segments = GRAPH_RANGES.map((r) => ({
    value: r,
    label: GRAPH_RANGE_LABELS[r],
    locked: !isGraphRangeAvailable(plan, r),
  }));

  const onRangeChange = (r: GraphRange) => {
    if (!isGraphRangeAvailable(plan, r)) {
      // TODO(Phase 6): open the Premium paywall instead.
      Alert.alert(
        'Premiumの機能です',
        '30日・90日・全期間のグラフはPremium（月額350円）でご利用いただけます。7日間のグラフは無料でご利用いただけます。',
      );
      return;
    }
    setRange(r);
  };

  return (
    <>
      <Button
        label="体重を記録"
        icon={<PlusIcon color={colors.onAccent} size={20} />}
        onPress={() => router.push('/weight-entry')}
        style={styles.primaryAction}
        testID="record-weight-button"
      />

      <SectionHeader title="推移" />
      <Card style={styles.chartCard}>
        <SegmentedControl
          segments={segments}
          value={range}
          onChange={onRangeChange}
          accessibilityLabel="グラフの期間"
        />
        <WeightChart daily={daily} end={today} days={range === 'all' ? 7 : RANGE_DAYS[range]} />
        <View style={styles.avgRow}>
          <Average label="直近7日平均" value={avg7} />
          <Average label="直近30日平均" value={avg30} />
        </View>
      </Card>

      <SectionHeader title="履歴" />
      {sorted.length === 0 ? (
        <Card>
          <EmptyState
            compact
            icon={<ScaleIcon color={colors.accent} />}
            title="記録はまだありません"
            message="1日に何回でも記録できます。グラフには1日の最初の記録を使います。"
          />
        </Card>
      ) : (
        <ListGroup>
          {sorted.map((w) => {
            const label = `${formatDateKeyJa(w.measuredOn)} ${formatTimeJa(w.measuredAt)}`;
            return (
              <ListRow
                key={w.id}
                title={`${w.weightKg.toFixed(1)} kg`}
                subtitle={label}
                value={w.bodyFatPct !== null ? `体脂肪 ${w.bodyFatPct.toFixed(1)}%` : undefined}
                onPress={() => router.push({ pathname: '/weight-entry', params: { id: w.id } })}
                accessibilityHint="タップすると編集・削除できます"
              />
            );
          })}
        </ListGroup>
      )}
    </>
  );
}

function Average({ label, value }: { label: string; value: number | null }) {
  return (
    <View style={styles.avg}>
      <AppText variant="footnote" color="textSecondary">
        {label}
      </AppText>
      <AppText variant="headline" tabular>
        {value === null ? '—' : `${value.toFixed(1)} kg`}
      </AppText>
    </View>
  );
}

function ExerciseSection() {
  const { colors } = useTheme();
  const onAdd = () =>
    // TODO(Phase 4): exercise entry screen.
    Alert.alert('準備中', '運動の記録は次回のアップデートで追加されます。');

  return (
    <>
      <Button
        label="運動を記録"
        icon={<PlusIcon color={colors.onAccent} size={20} />}
        onPress={onAdd}
        style={styles.primaryAction}
      />
      <SectionHeader title="履歴" />
      <Card>
        <EmptyState
          compact
          icon={<DumbbellIcon color={colors.accent} />}
          title="運動の記録はまだありません"
          message="ウォーキングや筋トレの記録ができます。消費カロリーは推定値として表示します。"
        />
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  primaryAction: { marginTop: spacing.lg },
  chartCard: { gap: spacing.lg },
  avgRow: { flexDirection: 'row' },
  avg: { flex: 1, gap: 2 },
});
