import { Children, Fragment, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChevronRightIcon } from '@/components/icons';
import { MIN_TAP, radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export type ListRowProps = {
  title: string;
  subtitle?: string;
  value?: string;
  leading?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Show chevron (defaults to true when pressable). */
  chevron?: boolean;
  accessibilityHint?: string;
  testID?: string;
};

export function ListRow({
  title,
  subtitle,
  value,
  leading,
  onPress,
  destructive,
  disabled,
  chevron,
  accessibilityHint,
  testID,
}: ListRowProps) {
  const { colors } = useTheme();
  const showChevron = chevron ?? !!onPress;

  const content = (
    <View style={styles.row}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.texts}>
        <AppText variant="body" color={destructive ? 'danger' : 'text'}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="footnote" color="textSecondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="subhead" color="textSecondary" style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {showChevron ? <ChevronRightIcon color={colors.textTertiary} size={18} /> : null}
    </View>
  );

  if (!onPress) {
    return (
      <View
        testID={testID}
        accessible
        accessibilityLabel={[title, subtitle, value].filter(Boolean).join('、')}
        style={disabled && styles.disabled}
      >
        {content}
      </View>
    );
  }

  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      haptic
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel={[title, value].filter(Boolean).join('、')}
      accessibilityHint={accessibilityHint}
    >
      {content}
    </PressableScale>
  );
}

/** Inset grouped list (iOS Settings style) with hairline separators. */
export function ListGroup({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, { backgroundColor: colors.surface }]}>
      {items.map((child, i) => (
        <Fragment key={i}>
          {i > 0 ? (
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
          ) : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TAP + 4,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  leading: { width: 28, alignItems: 'center' },
  texts: { flex: 1, gap: 2 },
  value: { flexShrink: 1, textAlign: 'right' },
  group: { borderRadius: radius.lg, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: spacing.lg },
  disabled: { opacity: 0.5 },
});
