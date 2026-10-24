import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import {
  AppText,
  Button,
  Card,
  closeModal,
  DateTimeField,
  LoadingView,
  ModalScreen,
  TextField,
} from '@/components/ui';
import { writeLocal } from '@/data/hooks';
import { addWeight, deleteWeight, updateWeight, type WeightRecord } from '@/data/repo/body';
import {
  BODY_FAT_MAX_PCT,
  BODY_FAT_MIN_PCT,
  isValidBodyFatPct,
  isValidWeightKg,
  latestMeasurement,
  parseDecimalInput,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
} from '@/domain/weight';
import { atDateWithTime, isDateKey, isInFuture } from '@/domain/date';
import { useWeights } from '@/features/profile/hooks';
import { haptics } from '@/lib/haptics';
import { MIN_TAP, radius, spacing, typography, useTheme } from '@/theme';

export default function WeightEntryScreen() {
  const { id, date } = useLocalSearchParams<{ id?: string; date?: string }>();
  const weights = useWeights();
  if (!weights.data) return <LoadingView />;
  const editing = id ? weights.data.find((w) => w.id === id) : undefined;
  // Prefill: the record being edited, or the latest weight (most days change only slightly).
  const prev = latestMeasurement(weights.data);
  return (
    <WeightForm
      editing={editing}
      initialWeight={editing ? editing.weightKg.toFixed(1) : (prev?.weightKg.toFixed(1) ?? '')}
      initialFat={editing?.bodyFatPct?.toFixed(1) ?? ''}
      initialNote={editing?.note ?? ''}
      initialAt={
        editing?.measuredAt ?? (date && isDateKey(date) ? atDateWithTime(date) : new Date())
      }
    />
  );
}

function WeightForm({
  editing,
  initialWeight,
  initialFat,
  initialNote,
  initialAt,
}: {
  editing: WeightRecord | undefined;
  initialWeight: string;
  initialFat: string;
  initialNote: string;
  initialAt: Date;
}) {
  const { colors } = useTheme();
  const [text, setWeightText] = useState(initialWeight);
  const [fatText, setFatText] = useState(initialFat);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [measuredAt, setMeasuredAt] = useState(initialAt);
  const [note, setNote] = useState(initialNote);

  const weight = parseDecimalInput(text);
  const fat = fatText.trim() === '' ? null : parseDecimalInput(fatText);
  const weightError =
    weight === null || !isValidWeightKg(weight)
      ? `${WEIGHT_MIN_KG}〜${WEIGHT_MAX_KG}kgの範囲で入力してください`
      : null;
  const fatError =
    fatText.trim() !== '' && (fat === null || !isValidBodyFatPct(fat))
      ? `${BODY_FAT_MIN_PCT}〜${BODY_FAT_MAX_PCT}%の範囲で入力してください`
      : null;

  const [futureError, setFutureError] = useState<string | null>(null);

  const save = async () => {
    setSubmitted(true);
    const inFuture = isInFuture(measuredAt);
    setFutureError(inFuture ? '未来の日時は記録できません' : null);
    if (weightError || fatError || inFuture || weight === null) {
      haptics.warning();
      return;
    }
    // Guard against double submission (fast double taps).
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const input = { weightKg: weight, bodyFatPct: fat, measuredAt, note };
      await writeLocal(async (db, uid) => {
        if (editing) await updateWeight(db, uid, editing.id, input);
        else await addWeight(db, uid, input);
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
    if (!editing) return;
    haptics.warning();
    Alert.alert('この記録を削除しますか？', `${editing.weightKg.toFixed(1)} kg`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await writeLocal((db, uid) => deleteWeight(db, uid, editing.id));
          closeModal();
        },
      },
    ]);
  };

  return (
    <ModalScreen title={editing ? '体重の編集' : '体重を記録'} testID="weight-entry-screen">
      <DateTimeField value={measuredAt} onChange={setMeasuredAt} testID="weight-datetime" />
      {futureError ? (
        <AppText variant="footnote" color="danger">
          {futureError}
        </AppText>
      ) : null}

      <Card style={styles.card}>
        <Field
          label="体重"
          unit="kg"
          value={text}
          onChangeText={setWeightText}
          placeholder="65.0"
          autoFocus={!editing}
          error={submitted ? weightError : null}
          testID="weight-input"
        />
        <View style={[styles.separator, { backgroundColor: colors.separator }]} />
        <Field
          label="体脂肪率（任意）"
          unit="%"
          value={fatText}
          onChangeText={setFatText}
          placeholder="—"
          error={submitted ? fatError : null}
          testID="bodyfat-input"
        />
      </Card>

      <TextField
        label="メモ（任意）"
        value={note}
        onChangeText={setNote}
        maxLength={500}
        placeholder="例：起床後・トイレの後"
        testID="weight-note"
      />
      <Button
        label="保存"
        onPress={() => void save()}
        loading={saving}
        testID="weight-save-button"
      />
      {editing ? <Button label="この記録を削除" variant="destructive" onPress={remove} /> : null}
    </ModalScreen>
  );
}

function Field({
  label,
  unit,
  error,
  ...input
}: {
  label: string;
  unit: string;
  error: string | null;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <View style={styles.fieldRow}>
        <AppText variant="body" style={styles.fieldLabel}>
          {label}
        </AppText>
        <TextInput
          {...input}
          keyboardType="decimal-pad"
          inputMode="decimal"
          maxLength={6}
          selectTextOnFocus
          accessibilityLabel={`${label}（${unit}）`}
          placeholderTextColor={colors.textTertiary}
          style={[styles.input, typography.title2, { color: colors.text }]}
        />
        <AppText variant="body" color="textSecondary" style={styles.unit}>
          {unit}
        </AppText>
      </View>
      {error ? (
        <AppText variant="footnote" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: spacing.xs },
  field: { paddingVertical: spacing.sm, gap: spacing.xs },
  fieldRow: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TAP },
  fieldLabel: { flexShrink: 0 },
  input: {
    flex: 1,
    minWidth: 96,
    marginLeft: spacing.md,
    textAlign: 'right',
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    fontVariant: ['tabular-nums'],
  },
  unit: { width: 32, textAlign: 'right' },
  separator: { height: StyleSheet.hairlineWidth },
});
