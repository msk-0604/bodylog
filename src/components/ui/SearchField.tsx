import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { CloseIcon, SearchIcon } from '@/components/icons';
import { MIN_TAP, radius, spacing, typography, useTheme } from '@/theme';

import { PressableScale } from './PressableScale';

export type SearchFieldProps = Omit<TextInputProps, 'style'> & {
  value: string;
  onChangeText: (text: string) => void;
};

export function SearchField({
  value,
  onChangeText,
  placeholder = '検索',
  ...rest
}: SearchFieldProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.fill }]}>
      <SearchIcon color={colors.textTertiary} size={20} />
      <TextInput
        {...rest}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="never"
        accessibilityLabel={rest.accessibilityLabel ?? placeholder}
        style={[styles.input, typography.body, { color: colors.text }]}
      />
      {value.length > 0 ? (
        <PressableScale
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="検索文字をクリア"
          hitSlop={8}
          style={[styles.clear, { backgroundColor: colors.textTertiary }]}
        >
          <CloseIcon color={colors.surface} size={12} strokeWidth={2.6} />
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: MIN_TAP,
  },
  input: { flex: 1, paddingVertical: spacing.sm },
  clear: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
