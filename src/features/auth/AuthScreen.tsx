import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { spacing, useTheme } from '@/theme';

/** Layout for sign-in / sign-up style screens. */
export function AuthScreen({
  title,
  subtitle,
  children,
  testID,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      testID={testID}
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xxxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <AppText variant="caption" color="accent" style={styles.brand}>
          BODYLOG
        </AppText>
        <AppText variant="title1" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="subhead" color="textSecondary">
            {subtitle}
          </AppText>
        ) : null}
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  brand: { fontWeight: '700', letterSpacing: 2 },
  body: { marginTop: spacing.xl, gap: spacing.lg },
});
