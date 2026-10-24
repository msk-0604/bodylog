import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Card, PressableScale } from '@/components/ui';
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
import { useLocalRecords } from '@/features/records/localRecordsStore';
import { haptics } from '@/lib/haptics';
import { MIN_TAP, radius, spacing, typography, useTheme } from '@/theme';

export default function WeightEntryScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const addWeight = useLocalRecords((s) => s.addWeight);
  const previous = useLocalRecords((s) => latestMeasurement(s.weights));

  const [weightText, setWeightText] = useState(previous ? previous.weightKg.toFixed(1) : '');
  const [fatText, setFatText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [now] = useState(() => new Date());

  const weight = parseDecimalInput(weightText);
  const fat = fatText.trim() === '' ? null : parseDecimalInput(fatText);
  const weightError =
    weight === null || !isValidWeightKg(weight)
      ? `${WEIGHT_MIN_KG}〜${WEIGHT_MAX_KG}kgの範囲で入力してください`
      : null;
  const fatError =
    fatText.trim() !== '' && (fat === null || !isValidBodyFatPct(fat))
      ? `${BODY_FAT_MIN_PCT}〜${BODY_FAT_MAX_PCT}%の範囲で入力してください`
      : null;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const save = () => {
    setSubmitted(true);
    if (weightError || fatError || weight === null) {
      haptics.warning();
      return;
    }
    // Guard against double submission (fast double taps).
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    addWeight({ weightKg: weight, bodyFatPct: fat, measuredAt: now });
    haptics.success();
    close();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.backgroundGrouped }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === 'ios' ? spacing.md : insets.top + spacing.sm },
        ]}
      >
        <PressableScale
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="キャンセル"
          style={styles.headerButton}
        >
          <AppText variant="body" color="accent">
            キャンセル
          </AppText>
        </PressableScale>
        <AppText variant="headline" accessibilityRole="header">
          体重を記録
        </AppText>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <AppText variant="subhead" color="textSecondary" style={styles.when}>
          {formatDateKeyJa(toDateKey(now))} {formatTimeJa(now)}
        </AppText>

        <Card style={styles.card}>
          <Field
            label="体重"
            unit="kg"
            value={weightText}
            onChangeText={setWeightText}
            placeholder="65.0"
            autoFocus
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
          onPress={save}
          loading={saving}
          style={styles.save}
          testID="weight-save-button"
        />
      </ScrollView>
    </KeyboardAvoidingView>
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
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headerButton: {
    minWidth: 88,
    minHeight: MIN_TAP,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  content: { paddingHorizontal: spacing.lg },
  when: { marginTop: spacing.sm, marginBottom: spacing.md, marginLeft: spacing.xs },
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
  save: { marginTop: spacing.xxl },
});
