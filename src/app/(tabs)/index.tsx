import { router } from 'expo-router';
import { useMemo } from 'react';

import { Screen, SectionHeader } from '@/components/ui';
import { formatDateKeyJa } from '@/domain/date';
import { dailyBudget } from '@/domain/budget';
import { sumNutrients } from '@/domain/nutrition';
import { changeFromPrevious, latestMeasurement } from '@/domain/weight';
import {
  CalorieCard,
  PfcCard,
  TodayExerciseCard,
  TodayMealsCard,
  WeighInPromptCard,
  WeightCard,
} from '@/features/home/HomeCards';
import { useExercises, usePreferences } from '@/features/exercise/hooks';
import { useWeighInStatus } from '@/features/notifications/useWeighIn';
import { useMealItems } from '@/features/meals/hooks';
import { useMealsUi } from '@/features/meals/mealsUi';
import { useGoal, useProfile, useWeights } from '@/features/profile/hooks';
import { scheduleSync } from '@/data/sync/syncService';
import { useToday } from '@/lib/useToday';

export default function HomeScreen() {
  const today = useToday();
  const weighIn = useWeighInStatus();
  const goal = useGoal(today).data ?? null;
  const profile = useProfile().data;
  const weights = useWeights();
  const meals = useMealItems(today);

  const exercises = useExercises({ from: today, to: today }).data ?? [];
  const prefs = usePreferences().data;
  const todayMeals = useMemo(() => meals.data ?? [], [meals.data]);
  const totals = useMemo(() => sumNutrients(todayMeals.map((m) => m.nutrients)), [todayMeals]);
  const latest = useMemo(() => latestMeasurement(weights.data ?? []), [weights.data]);
  const change = useMemo(() => changeFromPrevious(weights.data ?? []), [weights.data]);
  const budget = dailyBudget({
    goalKcal: goal?.calorieKcal ?? null,
    includeExercise: prefs?.includeExerciseInBudget ?? false,
    exercises,
    weightKg: latest?.weightKg ?? null,
  });

  const openMeals = () => {
    useMealsUi.getState().setDate(today);
    router.navigate('/meals');
  };

  return (
    <Screen
      title={profile?.nickname ? `${profile.nickname}さんの今日` : '今日'}
      eyebrow={formatDateKeyJa(today)}
      grouped
      testID="home-screen"
      refreshing={false}
      onRefresh={() => scheduleSync(0)}
    >
      <CalorieCard
        intake={totals.energyKcal}
        goal={budget.budget}
        exerciseBonus={budget.exerciseBonus}
      />

      <SectionHeader title="PFCバランス" />
      <PfcCard
        totals={totals}
        goals={{
          proteinG: goal?.proteinG ?? null,
          fatG: goal?.fatG ?? null,
          carbohydrateG: goal?.carbohydrateG ?? null,
        }}
      />

      {weighIn === 'pending' ? (
        <WeighInPromptCard onRecord={() => router.push('/weight-entry')} />
      ) : null}

      <SectionHeader title="体重" />
      <WeightCard
        latest={latest}
        change={change}
        targetKg={goal?.targetWeightKg ?? null}
        onRecord={() => router.push('/weight-entry')}
      />

      <SectionHeader title="今日の食事" />
      <TodayMealsCard items={todayMeals} onAdd={openMeals} />

      <SectionHeader title="今日の運動" />
      <TodayExerciseCard items={exercises} onAdd={() => router.push('/exercise-entry')} />
    </Screen>
  );
}
