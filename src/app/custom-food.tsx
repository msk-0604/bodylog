import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  closeModal,
  LoadingView,
  ModalScreen,
  SegmentedControl,
  TextField,
} from '@/components/ui';
import { useLocalQuery, writeLocal } from '@/data/hooks';
import {
  createCustomFood,
  deleteCustomFood,
  getFood,
  updateCustomFood,
  type FoodRecord,
} from '@/data/repo/foods';
import { isValidGrams, roundTo, type Nutrients } from '@/domain/nutrition';
import { parseDecimalInput } from '@/domain/weight';
import { useMealsUi } from '@/features/meals/mealsUi';
import { openFood } from '@/features/meals/navigation';
import { haptics } from '@/lib/haptics';
import { spacing } from '@/theme';

type Basis = 'per100g' | 'perServing';
const BASIS = [
  { value: 'per100g', label: '100gあたり' },
  { value: 'perServing', label: '1食（1個）あたり' },
] as const;

/**
 * マイ食品: user-entered foods (e.g. from a product's 栄養成分表示). Values can be entered per
 * 100 g or per serving; they are stored per 100 g.
 */
export default function CustomFoodScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const existing = useLocalQuery(['food', 'custom', params.id ?? 'new'], (db, uid) =>
    params.id ? getFood(db, uid, { source: 'custom', id: params.id }) : Promise.resolve(null),
  );
  if (params.id && existing.isLoading) return <LoadingView />;
  return <CustomFoodForm existing={existing.data ?? null} initialName={params.name ?? ''} />;
}

function CustomFoodForm({
  existing,
  initialName,
}: {
  existing: FoodRecord | null;
  initialName: string;
}) {
  const editing = !!existing;
  const s = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  const [name, setName] = useState(existing?.name ?? initialName);
  const [basis, setBasis] = useState<Basis>(editing ? 'per100g' : 'perServing');
  const [servingLabel, setServingLabel] = useState(existing?.serving?.label ?? '1個');
  const [servingGrams, setServingGrams] = useState(s(existing?.serving?.grams));
  const [kcal, setKcal] = useState(s(existing?.per100g.energyKcal));
  const [p, setP] = useState(s(existing?.per100g.proteinG));
  const [f, setF] = useState(s(existing?.per100g.fatG));
  const [c, setC] = useState(s(existing?.per100g.carbohydrateG));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors: Record<string, string> = {};
  if (!name.trim()) errors.name = '食品名を入力してください';
  const sg = servingGrams.trim() ? parseDecimalInput(servingGrams) : null;
  if (basis === 'perServing' && (sg === null || !isValidGrams(sg))) {
    errors.serving = '1食あたりの重量（g）を入力してください';
  }
  if (servingGrams.trim() && (sg === null || !isValidGrams(sg)))
    errors.serving = '重量が正しくありません';
  const num = (t: string, key: string, max: number) => {
    if (t.trim() === '') return null; // unknown → null (not 0)
    const v = parseDecimalInput(t);
    if (v === null || v > max) errors[key] = '数値を入力してください';
    return v;
  };
  const values = {
    kcal: num(kcal, 'kcal', 5000),
    p: num(p, 'p', 1000),
    f: num(f, 'f', 1000),
    c: num(c, 'c', 1000),
  };
  if (values.kcal === null && !errors.kcal) errors.kcal = 'エネルギーを入力してください';

  const save = async () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      haptics.warning();
      return;
    }
    const factor = basis === 'perServing' && sg ? 100 / sg : 1;
    const to100 = (v: number | null) => (v === null ? null : roundTo(v * factor, 2));
    const per100g: Nutrients = {
      energyKcal: to100(values.kcal),
      proteinG: to100(values.p),
      fatG: to100(values.f),
      carbohydrateG: to100(values.c),
    };
    const input = {
      name: name.trim(),
      per100g,
      serving: sg ? { label: servingLabel.trim() || '1食', grams: sg } : null,
    };
    setSaving(true);
    try {
      if (editing) {
        await writeLocal((db, uid) => updateCustomFood(db, uid, existing!.id, input));
        closeModal();
      } else {
        const food = await writeLocal((db, uid) => createCustomFood(db, uid, input));
        haptics.success();
        const { date, mealType } = useMealsUi.getState();
        router.back();
        void openFood(food, { kind: 'meal', date, mealType });
      }
    } catch {
      setSaving(false);
      Alert.alert('保存できませんでした', 'もう一度お試しください。');
    }
  };

  const remove = () =>
    Alert.alert('マイ食品を削除しますか？', '記録済みの食事は削除されません。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await writeLocal((db, uid) => deleteCustomFood(db, uid, existing!.id));
          router.dismissAll();
        },
      },
    ]);

  const e = (k: string) => (submitted ? errors[k] : null);
  const unitLabel = basis === 'per100g' ? '100gあたり' : `${servingLabel || '1食'}あたり`;

  return (
    <ModalScreen title={editing ? 'マイ食品の編集' : 'マイ食品を登録'} testID="custom-food-screen">
      <TextField
        label="食品名"
        value={name}
        onChangeText={setName}
        maxLength={60}
        error={e('name')}
        testID="custom-name"
      />
      <SegmentedControl
        segments={BASIS}
        value={basis}
        onChange={setBasis}
        accessibilityLabel="入力の基準"
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label="単位の名前"
            value={servingLabel}
            onChangeText={setServingLabel}
            maxLength={20}
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label={basis === 'perServing' ? '1食の重量' : '1食の重量（任意）'}
            unit="g"
            value={servingGrams}
            onChangeText={setServingGrams}
            keyboardType="decimal-pad"
            error={e('serving')}
            testID="custom-serving-grams"
          />
        </View>
      </View>
      <AppText variant="footnote" color="textSecondary">
        栄養成分（{unitLabel}）—
        商品の栄養成分表示を参考に入力してください。分からない項目は空欄のままにしてください（0とはみなしません）。
      </AppText>
      <TextField
        label="エネルギー"
        unit="kcal"
        value={kcal}
        onChangeText={setKcal}
        keyboardType="decimal-pad"
        error={e('kcal')}
        testID="custom-kcal"
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label="たんぱく質"
            unit="g"
            value={p}
            onChangeText={setP}
            keyboardType="decimal-pad"
            error={e('p')}
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label="脂質"
            unit="g"
            value={f}
            onChangeText={setF}
            keyboardType="decimal-pad"
            error={e('f')}
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label="炭水化物"
            unit="g"
            value={c}
            onChangeText={setC}
            keyboardType="decimal-pad"
            error={e('c')}
          />
        </View>
      </View>
      <Button label="保存" onPress={() => void save()} loading={saving} testID="custom-save" />
      {editing ? (
        <Button label="このマイ食品を削除" variant="destructive" onPress={remove} />
      ) : null}
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
