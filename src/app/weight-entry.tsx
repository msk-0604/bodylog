import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button, Card, closeModal, LoadingView, ModalScreen } from '@/components/ui';
import { writeLocal } from '@/data/hooks';
import { addWeight, deleteWeight, updateWeight, type WeightRecord } from '@/data/repo/body';
import { formatDateKeyJa, formatTimeJa, toDateKey } from '@/domain/date';
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
import { useWeights } from '@/features/profile/hooks';
import { haptics } from '@/lib/haptics';
import { MIN_TAP, radius, spacing, typography, useTheme } from '@/theme';

export default function WeightEntryScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
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
    />
  );
}

function WeightForm({
  editing,
  initialWeight,
  initialFat,
}: {
  editing: WeightRecord | undefined;
  initialWeight: string;
  initialFat: string;
}) {
  const { colors } = useTheme();
  const [text, setWeightText] = useState(initialWeight);
  const [fatText, setFatText] = useState(initialFat);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [now] = useState(() => new Date());
  const measuredAt = editing?.measuredAt ?? now;

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

  const save = async () => {
    setSubmitted(true);
    if (weightError || fatError || weight === null) {
      haptics.warning();
      return;
    }
    // Guard against double submission (fast double taps).
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const input = { weightKg: weight, bodyFatPct: fat, measuredAt };
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
      <AppText variant="subhead" color="textSecondary" style={styles.when}>
        {formatDateKeyJa(toDateKey(measuredAt))} {formatTimeJa(measuredAt)}
      </AppText>

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
  when: { marginLeft: spacing.xs },
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
