import { router } from 'expo-router';
import { useMemo } from 'react';

import { Screen, SectionHeader } from '@/components/ui';
import { formatDateKeyJa } from '@/domain/date';
import { sumNutrients } from '@/domain/nutrition';
import { changeFromPrevious, latestMeasurement } from '@/domain/weight';
import { useGoals } from '@/features/goals/useGoals';
import {
  CalorieCard,
  PfcCard,
  TodayExerciseCard,
  TodayMealsCard,
  WeightCard,
} from '@/features/home/HomeCards';
import { useLocalRecords } from '@/features/records/localRecordsStore';
import { useToday } from '@/lib/useToday';

export default function HomeScreen() {
  const today = useToday();
  const goals = useGoals();
  const weights = useLocalRecords((s) => s.weights);
  const mealItems = useLocalRecords((s) => s.mealItems);
  const exercises = useLocalRecords((s) => s.exercises);

  const todayMeals = useMemo(
    () => mealItems.filter((m) => m.eatenOn === today),
    [mealItems, today],
  );
  const todayExercises = useMemo(
    () => exercises.filter((e) => e.performedOn === today),
    [exercises, today],
  );
  const totals = useMemo(() => sumNutrients(todayMeals.map((m) => m.nutrients)), [todayMeals]);
  const latest = useMemo(() => latestMeasurement(weights), [weights]);
  const change = useMemo(() => changeFromPrevious(weights), [weights]);

  const openWeightEntry = () => router.push('/weight-entry');
  const openMeals = () => router.navigate('/meals');

  return (
    <Screen title="今日" eyebrow={formatDateKeyJa(today)} grouped testID="home-screen">
      <CalorieCard intake={totals.energyKcal} goal={goals.calorieKcal} />

      <SectionHeader title="PFCバランス" />
      <PfcCard totals={totals} goals={goals} />

      <SectionHeader title="体重" />
      <WeightCard
        latest={latest}
        change={change}
        targetKg={goals.targetWeightKg}
        onRecord={openWeightEntry}
      />

      <SectionHeader title="今日の食事" />
      <TodayMealsCard items={todayMeals} onAdd={openMeals} />

      <SectionHeader title="今日の運動" />
      <TodayExerciseCard items={todayExercises} />
    </Screen>
  );
}
