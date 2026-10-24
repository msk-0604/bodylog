import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { MIN_TAP, radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: ReactNode;
  disabled?: boolean;
  /** Shows a spinner and blocks presses (prevents double submission). */
  loading?: boolean;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  size = 'lg',
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { colors } = useTheme();

  const palette = {
    primary: { bg: colors.accent, fg: 'onAccent' as const, spinner: colors.onAccent },
    secondary: { bg: colors.accentSoft, fg: 'accent' as const, spinner: colors.accent },
    ghost: { bg: 'transparent', fg: 'accent' as const, spinner: colors.accent },
    destructive: { bg: colors.dangerSoft, fg: 'danger' as const, spinner: colors.danger },
  }[variant];

  const blocked = disabled || loading;

  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!blocked, busy: !!loading }}
      disabled={blocked}
      haptic
      onPress={onPress}
      style={[
        styles.base,
        { backgroundColor: palette.bg, minHeight: size === 'lg' ? 52 : MIN_TAP },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.spinner} />
      ) : (
        <View style={styles.content}>
          {icon}
          <AppText variant="headline" color={palette.fg} numberOfLines={1}>
            {label}
          </AppText>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
