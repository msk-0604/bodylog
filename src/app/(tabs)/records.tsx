import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Screen, SegmentedControl } from '@/components/ui';
import { ExerciseSection } from '@/features/exercise/ExerciseSection';
import { WeightSection } from '@/features/weight/WeightSection';

type Tab = 'weight' | 'exercise';
const TABS = [
  { value: 'weight', label: '体重' },
  { value: 'exercise', label: '運動' },
] as const;

export default function RecordsScreen() {
  const [tab, setTab] = useState<Tab>('weight');
  return (
    <Screen
      title="記録"
      testID="records-screen"
      headerRight={
        <Button
          label="カレンダー"
          variant="secondary"
          size="md"
          onPress={() => router.push('/calendar')}
          testID="open-calendar"
        />
      }
    >
      <SegmentedControl
        segments={TABS}
        value={tab}
        onChange={setTab}
        accessibilityLabel="記録の種類"
      />
      {tab === 'weight' ? <WeightSection /> : <ExerciseSection />}
    </Screen>
  );
}
