import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
};

/** Friendly guidance when there is nothing to show yet. */
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  compact,
}: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, compact && styles.compact]}>
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>{icon}</View>
      ) : null}
      <AppText variant="headline" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText variant="subhead" color="textSecondary" align="center">
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
          size="md"
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

type ErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
};

/** Error guidance. Never shows raw error details (they may contain personal data). */
export function ErrorState({
  title = '読み込めませんでした',
  message = '通信環境をご確認のうえ、もう一度お試しください。',
  onRetry,
}: ErrorStateProps) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <AppText variant="headline" align="center">
        {title}
      </AppText>
      <AppText variant="subhead" color="textSecondary" align="center">
        {message}
      </AppText>
      {onRetry ? (
        <Button
          label="再試行"
          onPress={onRetry}
          variant="secondary"
          size="md"
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

export function LoadingView({ label = '読み込み中' }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, styles.fill]} accessibilityLabel={label} accessible>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  compact: { paddingVertical: spacing.xl },
  fill: { flex: 1 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  action: { marginTop: spacing.md, alignSelf: 'center' },
});
