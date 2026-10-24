import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, PressableScale } from '@/components/ui';
import { spacing } from '@/theme';

export const PENDING_TERMS_KEY = 'pending_terms_acceptance';

export type PendingTerms = { termsVersion: string; privacyVersion: string; acceptedAt: string };

export function LegalLinks() {
  return (
    <View style={styles.row}>
      {(
        [
          ['terms', '利用規約'],
          ['privacy', 'プライバシーポリシー'],
        ] as const
      ).map(([doc, label]) => (
        <PressableScale
          key={doc}
          onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc } })}
          accessibilityRole="link"
          style={styles.link}
        >
          <AppText variant="footnote" color="accent">
            {label}を読む
          </AppText>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  link: { paddingVertical: spacing.sm },
});
