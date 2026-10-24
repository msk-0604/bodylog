import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MIN_TAP, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export function closeModal() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Sheet-style screen with a cancel button, title and optional right action. */
export function ModalScreen({
  title,
  children,
  right,
  cancelLabel = 'キャンセル',
  onCancel = closeModal,
  testID,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  cancelLabel?: string;
  onCancel?: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      testID={testID}
      style={[styles.flex, { backgroundColor: colors.backgroundGrouped }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === 'ios' ? spacing.md : insets.top + spacing.sm },
        ]}
      >
        <PressableScale
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          style={styles.side}
        >
          <AppText variant="body" color="accent" numberOfLines={1}>
            {cancelLabel}
          </AppText>
        </PressableScale>
        <AppText
          variant="headline"
          accessibilityRole="header"
          numberOfLines={1}
          style={styles.title}
        >
          {title}
        </AppText>
        <View style={[styles.side, styles.right]}>{right}</View>
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxxl }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  side: { width: 112, minHeight: MIN_TAP, justifyContent: 'center', paddingHorizontal: spacing.sm },
  right: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center' },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg, paddingTop: spacing.sm },
});
