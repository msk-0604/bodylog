import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SCREEN_PADDING, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';

export type ScreenProps = {
  title?: string;
  /** Small text above the title (e.g. today's date). */
  eyebrow?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  /** Use grouped (tinted) background — for list/settings style screens. */
  grouped?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  testID?: string;
};

/**
 * Standard tab screen: safe-area aware scroll view with a large title header.
 * Keyboard-aware so inputs at the bottom stay visible.
 */
export function Screen({
  title,
  eyebrow,
  headerRight,
  children,
  grouped,
  refreshing,
  onRefresh,
  testID,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bg = grouped ? colors.backgroundGrouped : colors.background;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        testID={testID}
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xxxl },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={colors.textTertiary}
            />
          ) : undefined
        }
      >
        {title ? (
          <View style={styles.header}>
            <View style={styles.flex}>
              {eyebrow ? (
                <AppText variant="subhead" color="textSecondary">
                  {eyebrow}
                </AppText>
              ) : null}
              <AppText variant="largeTitle" accessibilityRole="header">
                {title}
              </AppText>
            </View>
            {headerRight}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: SCREEN_PADDING },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
});
