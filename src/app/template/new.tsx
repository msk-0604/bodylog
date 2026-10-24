import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { AppText, Button, ListGroup, ListRow, ModalScreen, TextField } from '@/components/ui';
import { useLocalQuery, writeLocal } from '@/data/hooks';
import { getFood, type FoodRecord } from '@/data/repo/foods';
import { listMealItems } from '@/data/repo/meals';
import { createTemplate } from '@/data/repo/templates';
import { isDateKey, toDateKey } from '@/domain/date';
import { FREE_LIMITS } from '@/domain/entitlements';
import { isMealType, MEAL_TYPE_LABELS } from '@/domain/mealType';
import { formatKcal } from '@/domain/nutrition';
import { usePlan } from '@/features/premium/entitlement';
import { showPremiumInfo } from '@/features/premium/premiumInfo';
import { haptics } from '@/lib/haptics';

/** Saves the items of one logged meal as a template. */
export default function NewTemplateScreen() {
  const params = useLocalSearchParams<{ date?: string; mealType?: string }>();
  const plan = usePlan();
  const date = params.date && isDateKey(params.date) ? params.date : toDateKey(new Date());
  const mealType = params.mealType && isMealType(params.mealType) ? params.mealType : 'breakfast';
  const [name, setName] = useState(`いつもの${MEAL_TYPE_LABELS[mealType]}`);
  const [saving, setSaving] = useState(false);

  const source = useLocalQuery(['templateSource', date, mealType], async (db, uid) => {
    const items = (await listMealItems(db, uid, date)).filter((i) => i.mealType === mealType);
    const out: { food: FoodRecord; grams: number; kcal: number | null }[] = [];
    for (const i of items) {
      const food = i.foodRef ? await getFood(db, uid, i.foodRef) : null;
      if (food) out.push({ food, grams: i.grams, kcal: i.nutrients.energyKcal });
    }
    return out;
  });

  const save = async () => {
    if (!source.data || source.data.length === 0) return;
    setSaving(true);
    const r = await writeLocal((db, uid) =>
      createTemplate(db, uid, plan, { name, defaultMealType: mealType, items: source.data! }),
    );
    setSaving(false);
    if (r.ok) {
      haptics.success();
      router.back();
    } else if (r.reason === 'limit') {
      haptics.warning();
      Alert.alert(
        'テンプレートの上限です',
        `無料プランではテンプレートを${FREE_LIMITS.templates}件まで作成できます。既存のテンプレートを編集・削除するか、Premiumで無制限に作成できます。`,
        [
          { text: '閉じる', style: 'cancel' },
          { text: 'Premiumを見る', onPress: () => showPremiumInfo('食事テンプレートの無制限作成') },
        ],
      );
    } else {
      Alert.alert('名前を入力してください');
    }
  };

  return (
    <ModalScreen title="テンプレートを作成" testID="template-new-screen">
      <TextField
        label="テンプレート名"
        value={name}
        onChangeText={setName}
        maxLength={40}
        testID="template-name"
      />
      <AppText variant="footnote" color="textSecondary">
        {MEAL_TYPE_LABELS[mealType]}の内容を保存します。次回からワンタップでまとめて記録できます。
      </AppText>
      {source.data && source.data.length > 0 ? (
        <ListGroup>
          {source.data.map((s, i) => (
            <ListRow
              key={i}
              title={s.food.name}
              subtitle={`${s.grams} g`}
              value={s.kcal === null ? '— kcal' : `${formatKcal(s.kcal)} kcal`}
            />
          ))}
        </ListGroup>
      ) : (
        <AppText variant="subhead" color="textSecondary">
          保存できる食品がありません。
        </AppText>
      )}
      <Button
        label="保存"
        onPress={() => void save()}
        loading={saving}
        disabled={!source.data?.length}
        testID="template-save"
      />
    </ModalScreen>
  );
}
