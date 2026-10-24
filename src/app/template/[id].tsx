import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  Card,
  closeModal,
  EmptyState,
  ListGroup,
  ListRow,
  LoadingView,
  ModalScreen,
  SegmentedControl,
  TextField,
} from '@/components/ui';
import { useLocalQuery, writeLocal } from '@/data/hooks';
import {
  applyTemplate,
  deleteTemplate,
  getTemplate,
  removeTemplateItem,
  renameTemplate,
  setTemplateItemGrams,
  type MealTemplate,
} from '@/data/repo/templates';
import { formatDateKeyJa, isDateKey, toDateKey, type DateKey } from '@/domain/date';
import { usableTemplateIds } from '@/domain/entitlements';
import { isMealType, MEAL_TYPE_LABELS, MEAL_TYPES, type MealType } from '@/domain/mealType';
import { formatKcal, scaleNutrients } from '@/domain/nutrition';
import { useTemplates } from '@/features/meals/hooks';
import { usePlan } from '@/features/premium/entitlement';
import { haptics } from '@/lib/haptics';
import { spacing } from '@/theme';

const MEAL_SEGMENTS = MEAL_TYPES.map((t) => ({ value: t, label: MEAL_TYPE_LABELS[t] }));

export default function TemplateScreen() {
  const params = useLocalSearchParams<{ id: string; date?: string; mealType?: string }>();
  const t = useLocalQuery(['template', params.id], (db, uid) => getTemplate(db, uid, params.id));
  const date = params.date && isDateKey(params.date) ? params.date : toDateKey(new Date());

  if (t.isLoading) return <LoadingView />;
  if (!t.data) {
    return (
      <ModalScreen title="テンプレート" cancelLabel="閉じる">
        <EmptyState title="テンプレートが見つかりません" />
      </ModalScreen>
    );
  }
  const initialMealType =
    params.mealType && isMealType(params.mealType)
      ? params.mealType
      : (t.data.defaultMealType ?? 'breakfast');
  return (
    <TemplateForm key={t.data.id} tpl={t.data} date={date} initialMealType={initialMealType} />
  );
}

function TemplateForm({
  tpl,
  date,
  initialMealType,
}: {
  tpl: MealTemplate;
  date: DateKey;
  initialMealType: MealType;
}) {
  const plan = usePlan();
  const all = useTemplates();
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [name, setName] = useState<string | null>(tpl.name);
  const [applying, setApplying] = useState(false);
  const usable = usableTemplateIds(plan, all.data ?? []).has(tpl.id);

  const editGrams = (itemId: string, current: number) => {
    if (!usable) return;
    // Alert.prompt is iOS-only, so offer quick multipliers that work on both platforms.
    Alert.alert('分量を変更', '', [
      { text: 'キャンセル', style: 'cancel' },
      ...[0.5, 1.5, 2].map((x) => ({
        text: `${Math.round(current * x * 10) / 10} g（×${x}）`,
        onPress: () =>
          void writeLocal((db, uid) =>
            setTemplateItemGrams(db, uid, itemId, Math.round(current * x * 10) / 10),
          ),
      })),
      {
        text: '削除',
        style: 'destructive' as const,
        onPress: () => void writeLocal((db, uid) => removeTemplateItem(db, uid, itemId)),
      },
    ]);
  };

  const apply = () => {
    const available = tpl.items.filter((i) => i.food);
    Alert.alert(
      `${MEAL_TYPE_LABELS[mealType]}にまとめて追加`,
      `${formatDateKeyJa(date)}\n` +
        available.map((i) => `・${i.foodName} ${i.grams}g`).join('\n') +
        (available.length < tpl.items.length ? '\n（この端末にない食品は追加されません）' : ''),
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '追加',
          onPress: async () => {
            setApplying(true);
            const r = await writeLocal((db, uid) => applyTemplate(db, uid, tpl.id, date, mealType));
            setApplying(false);
            haptics.success();
            if (r.skipped.length > 0) {
              Alert.alert('一部の食品を追加できませんでした', r.skipped.join('、'));
            }
            router.dismissAll();
          },
        },
      ],
    );
  };

  const remove = () =>
    Alert.alert('テンプレートを削除しますか？', '記録済みの食事は削除されません。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await writeLocal((db, uid) => deleteTemplate(db, uid, tpl.id));
          closeModal();
        },
      },
    ]);

  return (
    <ModalScreen title="テンプレート" testID="template-screen">
      {!usable ? (
        <Card>
          <AppText variant="subhead">
            無料プランでは最初に作成した1件のみ利用・編集できます。このテンプレートは閲覧・削除のみ可能です（Premiumで再び利用できます）。
          </AppText>
        </Card>
      ) : null}
      <TextField
        label="テンプレート名"
        value={name ?? ''}
        onChangeText={setName}
        editable={usable}
        maxLength={40}
        onEndEditing={() => {
          if (name && name !== tpl.name)
            void writeLocal((db, uid) => renameTemplate(db, uid, tpl.id, name));
        }}
      />
      <ListGroup>
        {tpl.items.map((i) => {
          const kcal = i.food ? scaleNutrients(i.food.per100g, i.grams).energyKcal : null;
          return (
            <ListRow
              key={i.id}
              title={i.foodName}
              subtitle={`${i.grams} g${i.food ? '' : ' ・ この端末にありません'}`}
              value={kcal === null ? '— kcal' : `${formatKcal(kcal)} kcal`}
              onPress={usable ? () => editGrams(i.id, i.grams) : undefined}
            />
          );
        })}
      </ListGroup>
      {usable ? (
        <Button
          label="食品を追加"
          variant="secondary"
          size="md"
          onPress={() => router.push({ pathname: '/food-search', params: { templateId: tpl.id } })}
        />
      ) : null}
      <View style={styles.gapSm}>
        <AppText variant="footnote" color="textSecondary">
          {formatDateKeyJa(date)} に追加する食事区分
        </AppText>
        <SegmentedControl segments={MEAL_SEGMENTS} value={mealType} onChange={setMealType} />
      </View>
      <Button
        label={`合計 約${formatKcal(tpl.energyKcal)} kcal をまとめて追加`}
        onPress={apply}
        disabled={!usable || !tpl.items.some((i) => i.food)}
        loading={applying}
        testID="template-apply"
      />
      <Button label="テンプレートを削除" variant="destructive" onPress={remove} />
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  gapSm: { gap: spacing.sm },
});
