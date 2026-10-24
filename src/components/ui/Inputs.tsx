import type { ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ChevronRightIcon } from '@/components/icons';
import { MIN_TAP, radius, spacing, typography, useTheme } from '@/theme';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

/* ---------------- TextField ---------------- */

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string | null;
  hint?: string;
  unit?: string;
  value: string;
  onChangeText: (t: string) => void;
};

export function TextField({ label, error, hint, unit, ...input }: TextFieldProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <AppText variant="footnote" color="textSecondary">
        {label}
      </AppText>
      <View
        style={[
          styles.inputWrap,
          { backgroundColor: colors.fill, borderColor: error ? colors.danger : 'transparent' },
        ]}
      >
        <TextInput
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel={unit ? `${label}（${unit}）` : label}
          {...input}
          style={[styles.input, typography.body, { color: colors.text }]}
        />
        {unit ? (
          <AppText variant="subhead" color="textSecondary">
            {unit}
          </AppText>
        ) : null}
      </View>
      {error ? (
        <AppText variant="footnote" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="textTertiary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

/* ---------------- Checkbox ---------------- */

export function Checkbox({
  checked,
  onChange,
  children,
  testID,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      haptic
      scaleTo={0.99}
      style={styles.checkRow}
    >
      <View
        style={[
          styles.box,
          {
            borderColor: checked ? colors.accent : colors.textTertiary,
            backgroundColor: checked ? colors.accent : 'transparent',
          },
        ]}
      >
        {checked ? (
          <AppText style={{ color: colors.onAccent, fontWeight: '700' }}>✓</AppText>
        ) : null}
      </View>
      <View style={styles.flex}>{children}</View>
    </PressableScale>
  );
}

/* ---------------- Chip ---------------- */

export function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      haptic
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[styles.chip, { backgroundColor: selected ? colors.accent : colors.fill }]}
    >
      <AppText variant="subhead" color={selected ? 'onAccent' : 'text'}>
        {label}
      </AppText>
    </PressableScale>
  );
}

/* ---------------- DateStepper ---------------- */

export function DateStepper({
  label,
  onPrev,
  onNext,
  nextDisabled,
  trailing,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  trailing?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.stepper}>
      <PressableScale
        onPress={onPrev}
        haptic
        accessibilityRole="button"
        accessibilityLabel="前の日"
        style={styles.stepBtn}
      >
        <View style={{ transform: [{ rotate: '180deg' }] }}>
          <ChevronRightIcon color={colors.accent} size={20} />
        </View>
      </PressableScale>
      <AppText variant="headline" style={styles.stepLabel} accessibilityRole="header">
        {label}
      </AppText>
      <PressableScale
        onPress={onNext}
        disabled={nextDisabled}
        haptic
        accessibilityRole="button"
        accessibilityLabel="次の日"
        style={styles.stepBtn}
      >
        <ChevronRightIcon color={colors.accent} size={20} />
      </PressableScale>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  field: { gap: spacing.xs },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: MIN_TAP,
    borderWidth: 1.5,
    gap: spacing.sm,
  },
  // minWidth 0 lets the input shrink so the unit label stays visible in narrow columns
  input: { flex: 1, minWidth: 0, paddingVertical: spacing.sm },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TAP },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stepBtn: { width: MIN_TAP, height: MIN_TAP, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { minWidth: 120, textAlign: 'center' },
});
