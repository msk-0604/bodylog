import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LockIcon, PlusIcon, ScaleIcon } from '@/components/icons';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  ListGroup,
  ListRow,
  ProgressBar,
  SectionHeader,
  SegmentedControl,
} from '@/components/ui';
import { addDays, formatDateKeyJa, formatTimeJa } from '@/domain/date';
import {
  GRAPH_RANGE_LABELS,
  GRAPH_RANGES,
  isGraphRangeAvailable,
  type GraphRange,
} from '@/domain/entitlements';
import { averageOverDays, latestMeasurement } from '@/domain/weight';
import {
  dailySeries,
  goalStatus,
  periodStats,
  rangeDays,
  type Metric,
} from '@/domain/weightAnalysis';
import { showPremiumInfo } from '@/features/premium/premiumInfo';
import { usePlan } from '@/features/premium/usePlan';
import { useGoal, useWeights } from '@/features/profile/hooks';
import { useToday } from '@/lib/useToday';
import { spacing, useTheme } from '@/theme';

import { WeightChart } from './WeightChart';

const METRICS = [
  { value: 'weight', label: '体重' },
  { value: 'bodyFat', label: '体脂肪率' },
] as const;

const HISTORY_PAGE = 30;

export function WeightSection() {
  const { colors } = useTheme();
  const today = useToday();
  const plan = usePlan();
  const goal = useGoal(today).data ?? null;
  const [range, setRange] = useState<GraphRange>('7d');
  const [metric, setMetric] = useState<Metric>('weight');
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE);
  const weightsQuery = useWeights();
  const weights = useMemo(() => weightsQuery.data ?? [], [weightsQuery.data]);

  const series = useMemo(() => dailySeries(weights, metric), [weights, metric]);
  const weightDaily = useMemo(() => dailySeries(weights, 'weight'), [weights]);
  const sorted = useMemo(
    () => [...weights].sort((a, b) => b.measuredAt.getTime() - a.measuredAt.getTime()),
    [weights],
  );
  const firstDay = [...weightDaily.keys()].sort()[0] ?? null;
  const days = rangeDays(range, today, firstDay);
  const unit = metric === 'weight' ? 'kg' : '%';
  const stats = periodStats(series, addDays(today, -(days - 1)), today);

  const latest = latestMeasurement(weights);
  const status = goalStatus({
    startKg: goal?.startWeightKg ?? null,
    targetKg: goal?.targetWeightKg ?? null,
    currentKg: latest?.weightKg ?? null,
    firstRecordedKg: firstDay ? (weightDaily.get(firstDay) ?? null) : null,
  });

  const segments = GRAPH_RANGES.map((r) => ({
    value: r,
    label: GRAPH_RANGE_LABELS[r],
    locked: !isGraphRangeAvailable(plan, r),
  }));
  const onRangeChange = (r: GraphRange) => {
    if (!isGraphRangeAvailable(plan, r)) {
      showPremiumInfo('30日・90日・全期間のグラフ');
      return;
    }
    setRange(r);
  };
  const premium = plan === 'premium';

  return (
    <>
      <Button
        label="体重を記録"
        icon={<PlusIcon color={colors.onAccent} size={20} />}
        onPress={() => router.push('/weight-entry')}
        style={styles.primaryAction}
        testID="record-weight-button"
      />

      {status ? (
        <>
          <SectionHeader title="目標" />
          <Card style={styles.gap} testID="goal-progress">
            <View style={styles.goalRow}>
              <GoalNumber label="開始" value={`${status.startKg.toFixed(1)} kg`} />
              <GoalNumber label="現在" value={`${status.currentKg.toFixed(1)} kg`} strong />
              <GoalNumber label="目標" value={`${status.targetKg.toFixed(1)} kg`} />
            </View>
            <ProgressBar progress={status.progress} />
            <AppText variant="subhead" color={status.reached ? 'success' : 'textSecondary'}>
              {status.reached
                ? '目標を達成しています'
                : `達成率 ${Math.round(status.progress * 100)}%・目標まで ${status.remainingKg.toFixed(1)} kg`}
            </AppText>
          </Card>
        </>
      ) : null}

      <SectionHeader title="推移" />
      <Card style={styles.gap}>
        <SegmentedControl
          segments={METRICS}
          value={metric}
          onChange={setMetric}
          accessibilityLabel="グラフの項目"
        />
        <SegmentedControl
          segments={segments}
          value={range}
          onChange={onRangeChange}
          accessibilityLabel="グラフの期間"
        />
        <WeightChart
          daily={series}
          end={today}
          days={days}
          unit={unit}
          showAverage={metric === 'weight'}
          target={metric === 'weight' ? (goal?.targetWeightKg ?? null) : null}
        />
        {metric === 'weight' ? (
          <View style={styles.row}>
            <Average label="直近7日平均" value={averageOverDays(weightDaily, today, 7)} />
            <Average label="直近30日平均" value={averageOverDays(weightDaily, today, 30)} />
          </View>
        ) : null}
      </Card>

      <SectionHeader title="期間の統計" trailing={premium ? null : <PremiumBadge />} />
      {premium ? (
        <Card style={styles.gap} testID="period-stats">
          <AppText variant="footnote" color="textSecondary">
            {GRAPH_RANGE_LABELS[range]}（{stats.days}日間・記録{stats.recordedDays}日）
          </AppText>
          <View style={styles.row}>
            <Average label="期間の平均" value={stats.average} unit={unit} />
            <Average label="増減" value={stats.change} unit={unit} signed />
          </View>
          <View style={styles.row}>
            <Average label="最小" value={stats.min} unit={unit} />
            <Average label="最大" value={stats.max} unit={unit} />
          </View>
        </Card>
      ) : (
        <Card>
          <AppText variant="subhead" color="textSecondary">
            期間ごとの平均・増減・最小/最大はPremiumで確認できます。
          </AppText>
          <Button
            label="Premiumについて"
            variant="ghost"
            size="md"
            onPress={() => showPremiumInfo('期間別の統計')}
          />
        </Card>
      )}

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
        <>
          <ListGroup>
            {sorted.slice(0, historyLimit).map((w) => {
              const label = `${formatDateKeyJa(w.measuredOn)} ${formatTimeJa(w.measuredAt)}`;
              const extra = [
                w.bodyFatPct !== null ? `体脂肪 ${w.bodyFatPct.toFixed(1)}%` : null,
                w.note,
                w.syncError ? '同期できませんでした' : null,
              ]
                .filter(Boolean)
                .join(' ・ ');
              return (
                <ListRow
                  key={w.id}
                  title={`${w.weightKg.toFixed(1)} kg`}
                  subtitle={extra ? `${label} ・ ${extra}` : label}
                  onPress={() => router.push({ pathname: '/weight-entry', params: { id: w.id } })}
                  accessibilityHint="タップすると編集・削除できます"
                />
              );
            })}
          </ListGroup>
          {sorted.length > historyLimit ? (
            <Button
              label="さらに表示"
              variant="ghost"
              size="md"
              onPress={() => setHistoryLimit((n) => n + HISTORY_PAGE)}
            />
          ) : null}
        </>
      )}
    </>
  );
}

function GoalNumber({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.goalNumber}>
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
      <AppText variant={strong ? 'title3' : 'subhead'} tabular>
        {value}
      </AppText>
    </View>
  );
}

function Average({
  label,
  value,
  unit = 'kg',
  signed,
}: {
  label: string;
  value: number | null;
  unit?: string;
  signed?: boolean;
}) {
  const text =
    value === null
      ? '—'
      : `${signed && value > 0 ? '+' : signed && value < 0 ? '−' : ''}${(signed ? Math.abs(value) : value).toFixed(1)} ${unit}`;
  return (
    <View style={styles.avg}>
      <AppText variant="footnote" color="textSecondary">
        {label}
      </AppText>
      <AppText variant="headline" tabular>
        {text}
      </AppText>
    </View>
  );
}

function PremiumBadge() {
  const { colors } = useTheme();
  return (
    <View style={styles.badge}>
      <LockIcon color={colors.textTertiary} size={13} strokeWidth={2} />
      <AppText variant="caption" color="textTertiary">
        Premium
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  primaryAction: { marginTop: spacing.lg },
  gap: { gap: spacing.lg },
  row: { flexDirection: 'row' },
  avg: { flex: 1, gap: 2 },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  goalNumber: { alignItems: 'center', gap: 2, flex: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
