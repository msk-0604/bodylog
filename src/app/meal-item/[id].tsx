import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  Chip,
  closeModal,
  DateStepper,
  EmptyState,
  LoadingView,
  ModalScreen,
  SegmentedControl,
  TextField,
} from '@/components/ui';
import { useLocalQuery, writeLocal } from '@/data/hooks';
import { deleteMealItem, getMealItem, updateMealItem, type MealItemView } from '@/data/repo/meals';
import { addDays, formatDateKeyJa, type DateKey } from '@/domain/date';
import { MEAL_TYPE_LABELS, MEAL_TYPES, type MealType } from '@/domain/mealType';
import { isValidGrams, MAX_FOOD_GRAMS, type Nutrients } from '@/domain/nutrition';
import { parseDecimalInput } from '@/domain/weight';
import { NutrientSummary } from '@/features/meals/NutrientSummary';
import { haptics } from '@/lib/haptics';
import { useToday } from '@/lib/useToday';
import { spacing } from '@/theme';

const MEAL_SEGMENTS = MEAL_TYPES.map((t) => ({ value: t, label: MEAL_TYPE_LABELS[t] }));

export default function MealItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = useToday();
  const item = useLocalQuery(['mealItem', id], (db, uid) => getMealItem(db, uid, id));

  if (item.isLoading) return <LoadingView />;
  if (!item.data) {
    return (
      <ModalScreen title="食事の編集" cancelLabel="閉じる">
        <EmptyState title="記録が見つかりません" message="削除された可能性があります。" />
      </ModalScreen>
    );
  }
  return <MealItemForm key={item.data.id} item={item.data} today={today} />;
}

function MealItemForm({ item: it, today }: { item: MealItemView; today: DateKey }) {
  const [gramsText, setGramsText] = useState(String(it.grams));
  const [mealType, setMealType] = useState<MealType>(it.mealType);
  const [date, setDate] = useState<DateKey>(it.date);
  const [saving, setSaving] = useState(false);
  const grams = parseDecimalInput(gramsText);
  const valid = grams !== null && isValidGrams(grams);
  // Preview scales the stored snapshot (same values the save will produce for this record).
  const preview: Nutrients | null = valid
    ? (Object.fromEntries(
        Object.entries(it.nutrients).map(([k, v]) => [
          k,
          v === null ? null : (v * grams) / it.grams,
        ]),
      ) as Nutrients)
    : null;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await writeLocal((db, uid) => updateMealItem(db, uid, it.id, { grams, mealType, date }));
      haptics.success();
      closeModal();
    } catch {
      setSaving(false);
      Alert.alert('保存できませんでした', 'もう一度お試しください。');
    }
  };

  const remove = () => {
    haptics.warning();
    Alert.alert('この食品を削除しますか？', `${it.foodName} ${it.grams}g`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await writeLocal((db, uid) => deleteMealItem(db, uid, it.id));
          closeModal();
        },
      },
    ]);
  };

  return (
    <ModalScreen title="食事の編集" testID="meal-item-screen">
      <AppText variant="title3">{it.foodName}</AppText>
      <NutrientSummary
        nutrients={preview}
        caption={valid ? `${gramsText} g あたり` : '分量を入力してください'}
      />
      <TextField
        label="分量"
        unit="g"
        value={gramsText}
        onChangeText={setGramsText}
        keyboardType="decimal-pad"
        selectTextOnFocus
        error={!valid ? `0より大きく${MAX_FOOD_GRAMS}g以下で入力してください` : null}
        testID="edit-grams-input"
      />
      <View style={styles.chips}>
        {[0.5, 1.5, 2].map((x) => (
          <Chip
            key={x}
            label={`×${x}`}
            onPress={() => setGramsText(String(Math.round(it.grams * x * 10) / 10))}
          />
        ))}
      </View>
      <View style={styles.gapSm}>
        <AppText variant="footnote" color="textSecondary">
          食事区分
        </AppText>
        <SegmentedControl segments={MEAL_SEGMENTS} value={mealType} onChange={setMealType} />
      </View>
      <View style={styles.gapSm}>
        <AppText variant="footnote" color="textSecondary">
          日付
        </AppText>
        <DateStepper
          label={formatDateKeyJa(date)}
          onPrev={() => setDate(addDays(date, -1))}
          onNext={() => setDate(addDays(date, 1))}
          nextDisabled={date >= today}
        />
      </View>
      <Button
        label="保存"
        onPress={() => void save()}
        disabled={!valid}
        loading={saving}
        testID="save-meal-item"
      />
      <Button
        label="この食品を削除"
        variant="destructive"
        onPress={remove}
        testID="delete-meal-item"
      />
      {it.syncError ? (
        <AppText variant="footnote" color="warning">
          この記録はサーバーに保存できませんでした。内容を変更して保存すると再送信します。
        </AppText>
      ) : null}
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  gapSm: { gap: spacing.sm },
  chips: { flexDirection: 'row', gap: spacing.sm },
});
