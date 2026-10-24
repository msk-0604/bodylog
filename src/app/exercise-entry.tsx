import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { CloseIcon, PlusIcon } from '@/components/icons';
import {
  AppText,
  Button,
  Card,
  Chip,
  closeModal,
  DateTimeField,
  LoadingView,
  ModalScreen,
  PressableScale,
  SegmentedControl,
  TextField,
} from '@/components/ui';
import { writeLocal } from '@/data/hooks';
import {
  addExercise,
  deleteExercise,
  updateExercise,
  validateExercise,
  type ExerciseRecord,
} from '@/data/repo/exercise';
import { atDateWithTime, isDateKey, isInFuture } from '@/domain/date';
import { estimateExerciseKcal } from '@/domain/exercise';
import {
  EXERCISE_TYPE_LABELS,
  EXERCISE_TYPES,
  INTENSITIES,
  METS_TABLE,
  metsFor,
  type ExerciseType,
  type Intensity,
} from '@/domain/exerciseTypes';
import { formatKcal } from '@/domain/nutrition';
import { latestMeasurement } from '@/domain/weight';
import { useExercise, useRecentSetNames } from '@/features/exercise/hooks';
import { useWeights } from '@/features/profile/hooks';
import { haptics } from '@/lib/haptics';
import { MIN_TAP, radius, spacing, useTheme } from '@/theme';

const INTENSITY_LABELS: Record<Intensity, string> = {
  light: '軽め',
  moderate: 'ふつう',
  hard: 'きつめ',
};
const QUICK_MINUTES = [15, 30, 45, 60];

type SetDraft = { key: number; exerciseName: string; weightText: string; repsText: string };

export default function ExerciseEntryScreen() {
  const { id, date } = useLocalSearchParams<{ id?: string; date?: string }>();
  const existing = useExercise(id);
  const weights = useWeights();
  if ((id && existing.isLoading) || !weights.data) return <LoadingView />;
  const latestKg = latestMeasurement(weights.data)?.weightKg ?? null;
  return (
    <ExerciseForm
      key={id ?? 'new'}
      existing={existing.data ?? null}
      latestKg={latestKg}
      initialAt={date && isDateKey(date) ? atDateWithTime(date) : new Date()}
    />
  );
}

function intensityOf(type: ExerciseType, mets: number | null): Intensity {
  if (type === 'other' || mets === null) return 'moderate';
  return INTENSITIES.find((i) => METS_TABLE[type][i].mets === mets) ?? 'moderate';
}

let setKey = 0;
/** Empty → null; unparseable → NaN so validation rejects it instead of silently dropping it. */
const toNumber = (t: string) => {
  const s = t.normalize('NFKC').trim().replace(/[,，]/g, '');
  if (s === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
};

function ExerciseForm({
  existing,
  latestKg,
  initialAt,
}: {
  existing: ExerciseRecord | null;
  latestKg: number | null;
  initialAt: Date;
}) {
  const { colors } = useTheme();
  const setNames = useRecentSetNames().data ?? [];
  const [type, setType] = useState<ExerciseType>(existing?.type ?? 'walking');
  const [intensity, setIntensity] = useState<Intensity>(
    intensityOf(existing?.type ?? 'walking', existing?.mets ?? null),
  );
  const [name, setName] = useState(existing?.name ?? EXERCISE_TYPE_LABELS.walking);
  const [nameEdited, setNameEdited] = useState(!!existing);
  const [performedAt, setPerformedAt] = useState(() => existing?.performedAt ?? initialAt);
  const [durationText, setDurationText] = useState(existing ? String(existing.durationMin) : '30');
  const [kcalMode, setKcalMode] = useState<'auto' | 'manual'>(
    existing && !existing.kcalIsEstimated ? 'manual' : 'auto',
  );
  const [kcalText, setKcalText] = useState(existing?.kcal?.toString() ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [sets, setSets] = useState<SetDraft[]>(
    (existing?.sets ?? []).map((s) => ({
      key: ++setKey,
      exerciseName: s.exerciseName,
      weightText: s.weightKg?.toString() ?? '',
      repsText: s.reps?.toString() ?? '',
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const duration = toNumber(durationText);
  const mets = metsFor(type, intensity);
  const canEstimate = mets !== null && latestKg !== null;
  const effectiveMode = canEstimate ? kcalMode : 'manual';
  const estimate =
    canEstimate && duration
      ? estimateExerciseKcal({ mets: mets!, weightKg: latestKg!, durationMin: duration })
      : null;

  const changeType = (t: ExerciseType) => {
    setType(t);
    if (!nameEdited) setName(EXERCISE_TYPE_LABELS[t]);
  };

  const updateSet = (key: number, patch: Partial<SetDraft>) =>
    setSets((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const addSet = (exerciseName?: string) =>
    setSets((list) => {
      const last = list.at(-1);
      return [
        ...list,
        {
          key: ++setKey,
          exerciseName: exerciseName ?? last?.exerciseName ?? '',
          weightText: exerciseName ? '' : (last?.weightText ?? ''),
          repsText: exerciseName ? '' : (last?.repsText ?? ''),
        },
      ];
    });

  const save = async () => {
    if (savingRef.current) return;
    const kcal = effectiveMode === 'auto' ? estimate : kcalText.trim() ? toNumber(kcalText) : null;
    const input = {
      type,
      name,
      performedAt,
      durationMin: duration ?? 0,
      kcal,
      kcalIsEstimated: effectiveMode === 'auto' && kcal !== null,
      mets: effectiveMode === 'auto' ? mets : null,
      note,
      sets:
        type === 'strength'
          ? sets
              .filter((s) => s.exerciseName.trim())
              .map((s) => ({
                exerciseName: s.exerciseName,
                weightKg: toNumber(s.weightText),
                reps: toNumber(s.repsText),
              }))
          : [],
    };
    const v = isInFuture(performedAt) ? '未来の日時は記録できません' : validateExercise(input);
    setError(v);
    if (v) {
      haptics.warning();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await writeLocal(async (db, uid) => {
        if (existing) await updateExercise(db, uid, existing.id, input);
        else await addExercise(db, uid, input);
      });
      haptics.success();
      closeModal();
    } catch {
      savingRef.current = false;
      setSaving(false);
      Alert.alert('保存できませんでした', 'もう一度お試しください。');
    }
  };

  const remove = () => {
    if (!existing) return;
    haptics.warning();
    Alert.alert('この運動の記録を削除しますか？', existing.name, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await writeLocal((db, uid) => deleteExercise(db, uid, existing.id));
          closeModal();
        },
      },
    ]);
  };

  return (
    <ModalScreen title={existing ? '運動の編集' : '運動を記録'} testID="exercise-entry-screen">
      <View style={styles.chips}>
        {EXERCISE_TYPES.map((t) => (
          <Chip
            key={t}
            label={EXERCISE_TYPE_LABELS[t]}
            selected={type === t}
            onPress={() => changeType(t)}
            testID={`exercise-type-${t}`}
          />
        ))}
      </View>
      <TextField
        label="運動名"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setNameEdited(true);
        }}
        maxLength={60}
        testID="exercise-name"
      />
      <DateTimeField value={performedAt} onChange={setPerformedAt} />
      <TextField
        label="時間"
        unit="分"
        value={durationText}
        onChangeText={setDurationText}
        keyboardType="number-pad"
        testID="exercise-duration"
      />
      <View style={styles.chips}>
        {QUICK_MINUTES.map((m) => (
          <Chip
            key={m}
            label={`${m}分`}
            selected={duration === m}
            onPress={() => setDurationText(String(m))}
          />
        ))}
      </View>

      {type !== 'other' ? (
        <View style={styles.gapSm}>
          <AppText variant="footnote" color="textSecondary">
            強度
          </AppText>
          <SegmentedControl
            segments={INTENSITIES.map((i) => ({ value: i, label: INTENSITY_LABELS[i] }))}
            value={intensity}
            onChange={setIntensity}
            accessibilityLabel="強度"
          />
          <AppText variant="caption" color="textTertiary">
            {METS_TABLE[type][intensity].label}・{METS_TABLE[type][intensity].mets} METs
          </AppText>
        </View>
      ) : null}

      <Card style={styles.gapSm}>
        <AppText variant="headline">消費カロリー</AppText>
        {canEstimate ? (
          <SegmentedControl
            segments={[
              { value: 'auto', label: '推定する' },
              { value: 'manual', label: '自分で入力' },
            ]}
            value={kcalMode}
            onChange={setKcalMode}
            accessibilityLabel="消費カロリーの入力方法"
          />
        ) : null}
        {effectiveMode === 'auto' ? (
          <>
            <AppText variant="title2" tabular testID="exercise-kcal-estimate">
              推定 {estimate === null ? '—' : formatKcal(estimate)} kcal
            </AppText>
            <AppText variant="caption" color="textSecondary">
              METs × 体重 {latestKg?.toFixed(1)} kg × 時間 × 1.05 で計算した推定値です。
            </AppText>
          </>
        ) : (
          <>
            <TextField
              label="消費カロリー（任意）"
              unit="kcal"
              value={kcalText}
              onChangeText={setKcalText}
              keyboardType="number-pad"
              testID="exercise-kcal"
            />
            {!canEstimate ? (
              <AppText variant="caption" color="textSecondary">
                {type === 'other'
                  ? '「その他」は推定できません。わかる場合のみ入力してください。'
                  : '体重を記録すると、消費カロリーを推定できます。'}
              </AppText>
            ) : null}
          </>
        )}
      </Card>

      {type === 'strength' ? (
        <View style={styles.gapSm}>
          <AppText variant="headline">セット</AppText>
          {sets.map((s, i) => (
            <View key={s.key} style={styles.setRow}>
              <AppText variant="caption" color="textSecondary" style={styles.setNo}>
                {i + 1}
              </AppText>
              <View style={styles.setName}>
                <TextField
                  label="種目"
                  value={s.exerciseName}
                  onChangeText={(t) => updateSet(s.key, { exerciseName: t })}
                  maxLength={60}
                  testID={`set-name-${i}`}
                />
              </View>
              <View style={styles.setNum}>
                <TextField
                  label="重量"
                  unit="kg"
                  value={s.weightText}
                  onChangeText={(t) => updateSet(s.key, { weightText: t })}
                  keyboardType="decimal-pad"
                  testID={`set-weight-${i}`}
                />
              </View>
              <View style={styles.setNum}>
                <TextField
                  label="回数"
                  unit="回"
                  value={s.repsText}
                  onChangeText={(t) => updateSet(s.key, { repsText: t })}
                  keyboardType="number-pad"
                  testID={`set-reps-${i}`}
                />
              </View>
              <PressableScale
                onPress={() => setSets((list) => list.filter((x) => x.key !== s.key))}
                accessibilityRole="button"
                accessibilityLabel={`${i + 1}セット目を削除`}
                style={styles.remove}
              >
                <CloseIcon color={colors.textTertiary} size={16} />
              </PressableScale>
            </View>
          ))}
          <Button
            label={sets.length ? '前のセットをコピーして追加' : 'セットを追加'}
            variant="secondary"
            size="md"
            icon={<PlusIcon color={colors.accent} size={18} />}
            onPress={() => addSet()}
            testID="add-set"
          />
          {setNames.length > 0 ? (
            <View style={styles.chips}>
              {setNames.slice(0, 6).map((n) => (
                <Chip key={n} label={n} onPress={() => addSet(n)} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <TextField label="メモ（任意）" value={note} onChangeText={setNote} maxLength={500} />
      {error ? (
        <AppText variant="footnote" color="danger" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <Button label="保存" onPress={() => void save()} loading={saving} testID="exercise-save" />
      {existing ? <Button label="この記録を削除" variant="destructive" onPress={remove} /> : null}
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gapSm: { gap: spacing.sm },
  setRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  setNo: { width: 14, paddingBottom: spacing.lg },
  setName: { flex: 1.6 },
  setNum: { flex: 1 },
  remove: {
    width: 32,
    height: MIN_TAP,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
});
