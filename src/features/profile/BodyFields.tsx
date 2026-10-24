import { StyleSheet, View } from 'react-native';

import { AppText, PressableScale, SegmentedControl, TextField } from '@/components/ui';
import { ACTIVITY_LABELS, type ActivityLevel, type Sex } from '@/domain/goals';
import { radius, spacing, useTheme } from '@/theme';

import type { BodyDraft } from './bodyForm';

const SEX_SEGMENTS = [
  { value: 'female', label: '女性' },
  { value: 'male', label: '男性' },
  { value: 'unspecified', label: '回答しない' },
] as const;

export function BodyFields({
  draft,
  onChange,
  errors,
  showWeights,
}: {
  draft: BodyDraft;
  onChange: (d: BodyDraft) => void;
  errors: Record<string, string>;
  showWeights: boolean;
}) {
  const set = <K extends keyof BodyDraft>(k: K, v: BodyDraft[K]) => onChange({ ...draft, [k]: v });
  return (
    <View style={styles.gap}>
      <TextField
        label="ニックネーム（任意）"
        value={draft.nickname}
        onChangeText={(t) => set('nickname', t)}
        maxLength={20}
      />
      <TextField
        label="身長"
        unit="cm"
        value={draft.heightText}
        onChangeText={(t) => set('heightText', t)}
        keyboardType="decimal-pad"
        error={errors.height}
        testID="height-input"
      />
      {showWeights ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField
              label="現在の体重"
              unit="kg"
              value={draft.weightText}
              onChangeText={(t) => set('weightText', t)}
              keyboardType="decimal-pad"
              error={errors.weight}
              testID="current-weight-input"
            />
          </View>
          <View style={styles.flex}>
            <TextField
              label="目標体重"
              unit="kg"
              value={draft.targetText}
              onChangeText={(t) => set('targetText', t)}
              keyboardType="decimal-pad"
              error={errors.target}
              testID="target-weight-input"
            />
          </View>
        </View>
      ) : null}
      {showWeights ? (
        <TextField
          label="体脂肪率（任意）"
          unit="%"
          value={draft.bodyFatText}
          onChangeText={(t) => set('bodyFatText', t)}
          keyboardType="decimal-pad"
          error={errors.bodyFat}
        />
      ) : null}
      <TextField
        label="生年月日（任意）"
        value={draft.birthText}
        onChangeText={(t) => set('birthText', t)}
        placeholder="1990-04-15"
        keyboardType="numbers-and-punctuation"
        error={errors.birth}
        hint="目標カロリーの推定に使います"
      />
      <View style={styles.gapSm}>
        <AppText variant="footnote" color="textSecondary">
          性別（任意・推定計算にのみ使用）
        </AppText>
        <SegmentedControl
          segments={SEX_SEGMENTS}
          value={draft.sex}
          onChange={(v) => set('sex', v as Sex)}
          accessibilityLabel="性別"
        />
      </View>
      <View style={styles.gapSm}>
        <AppText variant="footnote" color="textSecondary">
          ふだんの活動量
        </AppText>
        {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => (
          <ActivityOption
            key={a}
            level={a}
            selected={draft.activity === a}
            onPress={() => set('activity', a)}
          />
        ))}
      </View>
    </View>
  );
}

function ActivityOption({
  level,
  selected,
  onPress,
}: {
  level: ActivityLevel;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { label, description } = ACTIVITY_LABELS[level];
  return (
    <PressableScale
      onPress={onPress}
      haptic
      scaleTo={0.99}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[
        styles.option,
        {
          backgroundColor: colors.surface,
          borderColor: selected ? colors.accent : colors.separator,
        },
      ]}
    >
      <AppText variant="headline" color={selected ? 'accent' : 'text'}>
        {label}
      </AppText>
      <AppText variant="footnote" color="textSecondary">
        {description}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.lg },
  gapSm: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  option: { borderWidth: 1.5, borderRadius: radius.md, padding: spacing.md, gap: 2 },
});
