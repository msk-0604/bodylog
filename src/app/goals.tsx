import { useState } from 'react';

import { AppText, Button, closeModal, LoadingView, ModalScreen, TextField } from '@/components/ui';
import { writeLocal } from '@/data/hooks';
import { saveGoal, type Goal } from '@/data/repo/profile';
import { toDateKey } from '@/domain/date';
import { ageOn, estimateCalorieGoal, type GoalType } from '@/domain/goals';
import { isValidWeightKg, parseDecimalInput, WEIGHT_MAX_KG, WEIGHT_MIN_KG } from '@/domain/weight';
import {
  draftFromEstimate,
  GoalEditor,
  parseGoalDraft,
  type GoalDraft,
} from '@/features/profile/GoalEditor';
import { useGoal, useLatestWeight, useProfile } from '@/features/profile/hooks';
import { haptics } from '@/lib/haptics';
import { useToday } from '@/lib/useToday';

export default function GoalsScreen() {
  const today = useToday();
  const { data: goal, isLoading } = useGoal(today);
  if (isLoading) return <LoadingView />;
  return <GoalsForm goal={goal ?? null} />;
}

function GoalsForm({ goal }: { goal: Goal | null }) {
  const { data: profile } = useProfile();
  const latest = useLatestWeight();
  const [draft, setDraft] = useState<GoalDraft>(() =>
    goal
      ? {
          goalType: goal.goalType,
          calorieText: String(goal.calorieKcal),
          proteinText: goal.proteinG?.toString() ?? '',
          fatText: goal.fatG?.toString() ?? '',
          carbText: goal.carbohydrateG?.toString() ?? '',
          usingEstimate: goal.calorieSource === 'estimate',
        }
      : draftFromEstimate('lose', null),
  );
  const [targetText, setTargetText] = useState(goal?.targetWeightKg?.toString() ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const estimateFor = (goalType: GoalType) => {
    const age = profile?.birthDate ? ageOn(profile.birthDate) : null;
    if (!profile?.heightCm || !latest || age === null || !profile.sex) return null;
    return estimateCalorieGoal({
      weightKg: latest.weightKg,
      heightCm: profile.heightCm,
      age,
      sex: profile.sex,
      activity: profile.activityLevel ?? 'moderate',
      goalType,
    });
  };

  const target = targetText.trim() ? parseDecimalInput(targetText) : null;
  const targetError =
    targetText.trim() && (target === null || !isValidWeightKg(target))
      ? `${WEIGHT_MIN_KG}〜${WEIGHT_MAX_KG}kgの範囲で入力してください`
      : null;
  const estimate = estimateFor(draft.goalType);

  const save = async () => {
    setSubmitted(true);
    const parsed = parseGoalDraft(draft).value;
    if (!parsed || targetError) {
      haptics.warning();
      return;
    }
    setSaving(true);
    try {
      await writeLocal((db, uid) =>
        saveGoal(db, uid, toDateKey(new Date()), {
          ...parsed,
          startWeightKg: goal?.startWeightKg ?? latest?.weightKg ?? null,
          targetWeightKg: target,
          calorieSource: draft.usingEstimate ? 'estimate' : 'manual',
        }),
      );
      haptics.success();
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalScreen title="目標設定" testID="goals-screen">
      <TextField
        label="目標体重"
        unit="kg"
        value={targetText}
        onChangeText={setTargetText}
        keyboardType="decimal-pad"
        error={submitted ? targetError : null}
      />
      <GoalEditor
        draft={draft}
        onChange={setDraft}
        estimate={estimate}
        currentKg={latest?.weightKg ?? null}
        targetKg={target}
        showErrors={submitted}
      />
      {estimate ? (
        <Button
          label="推定値を入れ直す"
          variant="secondary"
          size="md"
          onPress={() => setDraft(draftFromEstimate(draft.goalType, estimate))}
        />
      ) : null}
      <AppText variant="caption" color="textTertiary">
        変更は今日から適用されます。過去の日の集計には、その日に設定されていた目標が使われます。
      </AppText>
      <Button label="保存" onPress={save} loading={saving} testID="goals-save" />
    </ModalScreen>
  );
}
