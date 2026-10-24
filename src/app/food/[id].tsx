import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { StarIcon } from '@/components/icons';
import {
  AppText,
  Button,
  Chip,
  closeModal,
  EmptyState,
  LoadingView,
  ModalScreen,
  PressableScale,
  SegmentedControl,
  TextField,
} from '@/components/ui';
import { useLocalQuery, writeLocal } from '@/data/hooks';
import { addFavorite, isFavorite, removeFavorite } from '@/data/repo/favorites';
import { getFood, type FoodRecord, type FoodSource } from '@/data/repo/foods';
import { addMealItem } from '@/data/repo/meals';
import { addTemplateItem } from '@/data/repo/templates';
import { formatDateKeyJa, isDateKey, toDateKey, type DateKey } from '@/domain/date';
import { FREE_LIMITS } from '@/domain/entitlements';
import { VALUE_FLAG_LABELS } from '@/domain/foodData';
import {
  isMealType,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
  suggestMealType,
  type MealType,
} from '@/domain/mealType';
import { isValidGrams, MAX_FOOD_GRAMS, scaleNutrients } from '@/domain/nutrition';
import { parseDecimalInput } from '@/domain/weight';
import { NutrientSummary } from '@/features/meals/NutrientSummary';
import { usePlan } from '@/features/premium/usePlan';
import { haptics } from '@/lib/haptics';
import { MIN_TAP, spacing, useTheme } from '@/theme';

const QUICK_GRAMS = [50, 100, 150, 200];
const MEAL_SEGMENTS = MEAL_TYPES.map((t) => ({ value: t, label: MEAL_TYPE_LABELS[t] }));
const NUTRIENT_LABELS = {
  energyKcal: 'エネルギー',
  proteinG: 'たんぱく質',
  fatG: '脂質',
  carbohydrateG: '炭水化物',
} as const;

export default function FoodScreen() {
  const params = useLocalSearchParams<{
    id: string;
    source?: string;
    date?: string;
    mealType?: string;
    templateId?: string;
  }>();
  const source: FoodSource = params.source === 'custom' ? 'custom' : 'master';
  const ref = { source, id: params.id };
  const date = params.date && isDateKey(params.date) ? params.date : toDateKey(new Date());

  const food = useLocalQuery(['food', source, params.id], (db, uid) => getFood(db, uid, ref));

  if (food.isLoading) return <LoadingView />;
  if (!food.data) {
    return (
      <ModalScreen title="食品">
        <EmptyState
          title="食品が見つかりません"
          message="削除されたか、この端末に保存されていません。"
        />
      </ModalScreen>
    );
  }
  return (
    <FoodForm
      key={food.data.id}
      food={food.data}
      date={date}
      initialMealType={
        params.mealType && isMealType(params.mealType)
          ? params.mealType
          : suggestMealType(new Date())
      }
      templateId={params.templateId}
    />
  );
}

function FoodForm({
  food: f,
  date,
  initialMealType,
  templateId,
}: {
  food: FoodRecord;
  date: DateKey;
  initialMealType: MealType;
  templateId: string | undefined;
}) {
  const { colors } = useTheme();
  const plan = usePlan();
  const ref = { source: f.source, id: f.id };
  const forTemplate = !!templateId;
  const favorite = useLocalQuery(['favorites', 'is', f.source, f.id], (db, uid) =>
    isFavorite(db, uid, ref),
  );
  const [mealType, setMealType] = useState(initialMealType);
  // Default amount: the food's serving if known, otherwise 100 g.
  const [gramsText, setGramsText] = useState(f.serving ? String(f.serving.grams) : '100');
  const [unit, setUnit] = useState<{ label: string; grams: number } | null>(f.serving);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const grams = parseDecimalInput(gramsText);
  const valid = grams !== null && isValidGrams(grams);
  const nutrients = valid ? scaleNutrients(f.per100g, grams) : null;
  const flagged = (Object.keys(f.valueFlags) as (keyof typeof NUTRIENT_LABELS)[]).filter(
    (k) => f.valueFlags[k],
  );

  const toggleFavorite = async () => {
    if (favorite.data) {
      await writeLocal((db, uid) => removeFavorite(db, uid, ref));
      haptics.selection();
      return;
    }
    const r = await writeLocal((db, uid) => addFavorite(db, uid, ref, plan, valid ? grams : null));
    if (!r.ok) {
      haptics.warning();
      Alert.alert(
        'お気に入りの上限です',
        `無料プランではお気に入りを${FREE_LIMITS.favorites}件まで登録できます。不要なお気に入りを解除するか、Premium（月額350円）で無制限に登録できます。`,
      );
    } else haptics.success();
  };

  const submit = async () => {
    if (!valid || grams === null || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (forTemplate) {
        await writeLocal((db, uid) => addTemplateItem(db, uid, templateId!, f, grams));
      } else {
        await writeLocal((db, uid) =>
          addMealItem(db, uid, {
            date,
            mealType,
            food: f,
            grams,
            quantity: unit ? Math.round((grams / unit.grams) * 100) / 100 : null,
            unitLabel: unit?.label ?? null,
          }),
        );
      }
      haptics.success();
      closeModal();
    } catch {
      savingRef.current = false;
      setSaving(false);
      Alert.alert('保存できませんでした', 'もう一度お試しください。');
    }
  };

  return (
    <ModalScreen
      title={forTemplate ? 'テンプレートに追加' : '分量を選択'}
      testID="food-screen"
      right={
        <PressableScale
          onPress={() => void toggleFavorite()}
          accessibilityRole="button"
          accessibilityLabel={favorite.data ? 'お気に入りから外す' : 'お気に入りに登録'}
          accessibilityState={{ selected: !!favorite.data }}
          style={styles.star}
          testID="favorite-toggle"
        >
          <StarIcon
            color={favorite.data ? colors.warning : colors.textSecondary}
            strokeWidth={favorite.data ? 2.6 : 1.8}
          />
        </PressableScale>
      }
    >
      <View style={styles.gapSm}>
        <AppText variant="title3">{f.name}</AppText>
        <AppText variant="footnote" color="textSecondary">
          {f.source === 'custom'
            ? 'マイ食品'
            : `${f.categoryName ?? ''} ・ 食品番号 ${f.foodCode ?? '—'}`}
        </AppText>
      </View>

      <NutrientSummary
        nutrients={nutrients}
        caption={valid ? `${gramsText} g あたり` : '分量を入力してください'}
      />

      <TextField
        label="分量"
        unit="g"
        value={gramsText}
        onChangeText={(t) => {
          setGramsText(t);
          setUnit(null);
        }}
        keyboardType="decimal-pad"
        selectTextOnFocus
        error={
          gramsText !== '' && !valid ? `0より大きく${MAX_FOOD_GRAMS}g以下で入力してください` : null
        }
        testID="grams-input"
      />
      <View style={styles.chips}>
        {f.serving
          ? [1, 2].map((n) => (
              <Chip
                key={`s${n}`}
                label={`${n === 1 ? f.serving!.label : `${f.serving!.label}×${n}`}（${f.serving!.grams * n}g）`}
                selected={unit !== null && grams === f.serving!.grams * n}
                onPress={() => {
                  setUnit(f.serving);
                  setGramsText(String(f.serving!.grams * n));
                }}
              />
            ))
          : null}
        {QUICK_GRAMS.map((g) => (
          <Chip
            key={g}
            label={`${g}g`}
            selected={unit === null && grams === g}
            onPress={() => {
              setUnit(null);
              setGramsText(String(g));
            }}
            testID={`grams-chip-${g}`}
          />
        ))}
      </View>

      {!forTemplate ? (
        <View style={styles.gapSm}>
          <AppText variant="footnote" color="textSecondary">
            {formatDateKeyJa(date)}
          </AppText>
          <SegmentedControl
            segments={MEAL_SEGMENTS}
            value={mealType}
            onChange={setMealType}
            accessibilityLabel="食事区分"
          />
        </View>
      ) : null}

      <Button
        label={forTemplate ? 'テンプレートに追加' : `${MEAL_TYPE_LABELS[mealType]}に追加`}
        onPress={() => void submit()}
        disabled={!valid}
        loading={saving}
        testID="add-food-button"
      />

      {flagged.length > 0 ? (
        <AppText variant="caption" color="textSecondary">
          {flagged
            .map((k) => `${NUTRIENT_LABELS[k]}: ${VALUE_FLAG_LABELS[f.valueFlags[k]!]}`)
            .join(' / ')}
          。不明な値は合計に含まれません。
        </AppText>
      ) : null}
      {f.source === 'custom' ? (
        <Button
          label="マイ食品を編集"
          variant="ghost"
          size="md"
          onPress={() => router.push({ pathname: '/custom-food', params: { id: f.id } })}
        />
      ) : (
        <AppText variant="caption" color="textTertiary">
          出典：文部科学省「日本食品標準成分表」{f.sourceVersion ? `（${f.sourceVersion}）` : ''}
        </AppText>
      )}
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  gapSm: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  star: { width: MIN_TAP, height: MIN_TAP, alignItems: 'center', justifyContent: 'center' },
});
