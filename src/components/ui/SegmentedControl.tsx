import { StyleSheet, View } from 'react-native';

import { LockIcon } from '@/components/icons';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export type Segment<T extends string> = { value: T; label: string; locked?: boolean };

export type SegmentedControlProps<T extends string> = {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
};

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const { colors, scheme } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.container, { backgroundColor: colors.fill }]}
    >
      {segments.map((s) => {
        const selected = s.value === value;
        return (
          <PressableScale
            key={s.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={s.locked ? `${s.label}（Premium）` : s.label}
            haptic
            scaleTo={0.98}
            onPress={() => onChange(s.value)}
            style={[
              styles.segment,
              selected && { backgroundColor: colors.fillSelected },
              selected && scheme === 'light' && styles.shadow,
            ]}
          >
            <View style={styles.label}>
              {s.locked ? <LockIcon color={colors.textTertiary} size={13} strokeWidth={2} /> : null}
              <AppText
                variant="subhead"
                color={selected ? 'text' : 'textSecondary'}
                style={selected && styles.selectedText}
                numberOfLines={1}
              >
                {s.label}
              </AppText>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 3,
    gap: 2,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.sm + 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  label: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  selectedText: { fontWeight: '600' },
  shadow: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
