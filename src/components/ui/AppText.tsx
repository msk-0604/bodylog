import { StyleSheet, Text, type TextProps } from 'react-native';

import { typography, useTheme, type ColorTokens, type TypographyVariant } from '@/theme';

type TextColor = Extract<
  keyof ColorTokens,
  | 'text'
  | 'textSecondary'
  | 'textTertiary'
  | 'accent'
  | 'danger'
  | 'success'
  | 'onAccent'
  | 'warning'
>;

export type AppTextProps = TextProps & {
  variant?: TypographyVariant;
  color?: TextColor;
  /** Use tabular (monospaced) digits so numbers don't jitter while changing. */
  tabular?: boolean;
  align?: 'left' | 'center' | 'right';
};

export function AppText({
  variant = 'body',
  color = 'text',
  tabular,
  align,
  style,
  ...rest
}: AppTextProps) {
  const { colors } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        typography[variant],
        { color: colors[color] },
        tabular && styles.tabular,
        align && { textAlign: align },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
});
