import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ModalScreen, SearchField } from '@/components/ui';
import { FoodSearchResults } from '@/features/meals/FoodSearchResults';
import { openFood } from '@/features/meals/navigation';

/** Food search used when adding items to a template. */
export default function FoodSearchScreen() {
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  const [query, setQuery] = useState('');
  return (
    <ModalScreen title="食品を追加">
      <SearchField value={query} onChangeText={setQuery} placeholder="食品名で検索" autoFocus />
      {query.trim() ? (
        <FoodSearchResults
          query={query}
          onSelect={(f) => {
            router.back();
            void openFood(f, { kind: 'template', templateId });
          }}
          onCreateCustom={() =>
            router.push({ pathname: '/custom-food', params: { name: query.trim() } })
          }
        />
      ) : null}
    </ModalScreen>
  );
}
