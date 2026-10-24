import { StyleSheet, Switch, View } from 'react-native';

import { MIN_TAP, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';

export type SwitchRowProps = {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
};

/** A labelled on/off switch row (fits inside ListGroup or Card). */
export function SwitchRow({
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
  testID,
}: SwitchRowProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.texts}>
        <AppText variant="body" color={disabled ? 'textTertiary' : 'text'}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="footnote" color="textSecondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.accent, false: colors.fill }}
        accessibilityLabel={title}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TAP,
    paddingVertical: spacing.sm,
  },
  texts: { flex: 1, gap: 2 },
});
