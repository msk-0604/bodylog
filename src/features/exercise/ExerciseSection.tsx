import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { DumbbellIcon, PlusIcon } from '@/components/icons';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  ListGroup,
  ListRow,
  SectionHeader,
} from '@/components/ui';
import type { ExerciseRecord } from '@/data/repo/exercise';
import { addDays, diffDays, formatDateKeyJa, formatTimeJa, type DateKey } from '@/domain/date';
import { EXERCISE_TYPE_LABELS, volumeByExercise } from '@/domain/exerciseTypes';
import { formatKcal } from '@/domain/nutrition';
import { useToday } from '@/lib/useToday';
import { spacing, useTheme } from '@/theme';

import { useExercises, usePreferences } from './hooks';

/** Start of the week containing `day` (weekStartsOn: 0 = Sunday, 1 = Monday). */
function weekStart(day: DateKey, weekStartsOn: 0 | 1): DateKey {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(day, -((dow - weekStartsOn + 7) % 7));
}

export function exerciseSubtitle(e: ExerciseRecord): string {
  const parts = [
    `${formatDateKeyJa(e.performedOn)} ${formatTimeJa(e.performedAt)}`,
    `${e.durationMin}分`,
    e.kcal !== null ? `${e.kcalIsEstimated ? '推定' : ''}${formatKcal(e.kcal)} kcal` : null,
  ];
  if (e.sets.length > 0) {
    const v = volumeByExercise(e.sets);
    parts.push(`${v.length}種目・${e.sets.length}セット`);
  }
  if (e.syncError) parts.push('同期できませんでした');
  return parts.filter(Boolean).join(' ・ ');
}

export function ExerciseSection() {
  const { colors } = useTheme();
  const today = useToday();
  const prefs = usePreferences().data;
  const all = useExercises();
  const list = useMemo(() => all.data ?? [], [all.data]);
  const from = weekStart(today, prefs?.weekStartsOn ?? 1);
  const thisWeek = list.filter((e) => e.performedOn >= from && e.performedOn <= today);
  const minutes = thisWeek.reduce((s, e) => s + e.durationMin, 0);
  const kcal = thisWeek.reduce((s, e) => s + (e.kcal ?? 0), 0);

  return (
    <>
      <Button
        label="運動を記録"
        icon={<PlusIcon color={colors.onAccent} size={20} />}
        onPress={() => router.push('/exercise-entry')}
        style={styles.primaryAction}
        testID="record-exercise-button"
      />
      <SectionHeader title="今週" />
      <Card style={styles.summary}>
        <Stat label="回数" value={`${thisWeek.length}回`} />
        <Stat label="合計時間" value={`${minutes}分`} />
        <Stat label="消費（推定含む）" value={`${formatKcal(kcal)} kcal`} />
      </Card>
      <AppText variant="caption" color="textTertiary" style={styles.note}>
        {formatDateKeyJa(from)}〜今日（{diffDays(from, today) + 1}日間）
      </AppText>

      <SectionHeader title="履歴" />
      {list.length === 0 ? (
        <Card>
          <EmptyState
            compact
            icon={<DumbbellIcon color={colors.accent} />}
            title="運動の記録はまだありません"
            message="ウォーキングや筋トレを記録できます。消費カロリーは推定値として表示します。"
          />
        </Card>
      ) : (
        <ListGroup>
          {list.slice(0, 60).map((e) => (
            <ListRow
              key={e.id}
              testID={`exercise-row-${e.name}`}
              title={
                e.name === EXERCISE_TYPE_LABELS[e.type]
                  ? e.name
                  : `${e.name}（${EXERCISE_TYPE_LABELS[e.type]}）`
              }
              subtitle={exerciseSubtitle(e)}
              onPress={() => router.push({ pathname: '/exercise-entry', params: { id: e.id } })}
              accessibilityHint="タップすると編集・削除できます"
            />
          ))}
        </ListGroup>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="caption" color="textSecondary" align="center">
        {label}
      </AppText>
      <AppText variant="headline" tabular>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  primaryAction: { marginTop: spacing.lg },
  summary: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  note: { marginTop: spacing.xs, marginLeft: spacing.xs },
});
