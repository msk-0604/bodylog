import { StyleSheet, View } from 'react-native';

import { addDays, formatDateKeyJa, toDateKey } from '@/domain/date';
import { formatTime, stepTime } from '@/domain/reminders';
import { MIN_TAP, radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { DateStepper } from './Inputs';
import { PressableScale } from './PressableScale';

function StepButton({
  label,
  onPress,
  accessibilityLabel,
  disabled,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      haptic
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.step, { backgroundColor: colors.fill }]}
    >
      <AppText variant="subhead" color="accent" style={styles.stepLabel}>
        {label}
      </AppText>
    </PressableScale>
  );
}

/** Hour/minute stepper (no native picker dependency). Minutes move in `minuteStep` increments. */
export function TimeStepper({
  hour,
  minute,
  onChange,
  minuteStep = 5,
  label = '時刻',
  testID,
}: {
  hour: number;
  minute: number;
  onChange: (t: { hour: number; minute: number }) => void;
  minuteStep?: number;
  label?: string;
  testID?: string;
}) {
  return (
    <View
      style={styles.row}
      testID={testID}
      accessible={false}
      accessibilityLabel={`${label} ${formatTime(hour, minute)}`}
    >
      <StepButton
        label="−時"
        accessibilityLabel={`${label}を1時間前に`}
        onPress={() => onChange(stepTime(hour, minute, -60))}
      />
      <StepButton
        label="−分"
        accessibilityLabel={`${label}を${minuteStep}分前に`}
        onPress={() => onChange(stepTime(hour, minute, -minuteStep))}
      />
      <AppText variant="title2" tabular style={styles.time} accessibilityLiveRegion="polite">
        {formatTime(hour, minute)}
      </AppText>
      <StepButton
        label="+分"
        accessibilityLabel={`${label}を${minuteStep}分後に`}
        onPress={() => onChange(stepTime(hour, minute, minuteStep))}
      />
      <StepButton
        label="+時"
        accessibilityLabel={`${label}を1時間後に`}
        onPress={() => onChange(stepTime(hour, minute, 60))}
      />
    </View>
  );
}

/** Date (day stepper, never in the future) + time for a record. */
export function DateTimeField({
  value,
  onChange,
  testID,
}: {
  value: Date;
  onChange: (d: Date) => void;
  testID?: string;
}) {
  const day = toDateKey(value);
  const today = toDateKey(new Date());
  const setDay = (delta: number) => {
    const next = addDays(day, delta);
    if (next > today) return;
    const [y, m, d] = next.split('-').map(Number) as [number, number, number];
    onChange(new Date(y, m - 1, d, value.getHours(), value.getMinutes()));
  };
  return (
    <View style={styles.dateTime} testID={testID}>
      <DateStepper
        label={formatDateKeyJa(day)}
        onPrev={() => setDay(-1)}
        onNext={() => setDay(1)}
        nextDisabled={day >= today}
      />
      <TimeStepper
        hour={value.getHours()}
        minute={value.getMinutes()}
        onChange={({ hour, minute }) =>
          onChange(new Date(value.getFullYear(), value.getMonth(), value.getDate(), hour, minute))
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  step: {
    width: MIN_TAP,
    height: MIN_TAP,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: { flex: 1, textAlign: 'center' },
  stepLabel: { fontWeight: '600' },
  dateTime: { gap: spacing.sm },
});
