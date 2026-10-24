import { useLocalSearchParams } from 'expo-router';

import { AppText, Card, ModalScreen } from '@/components/ui';
import { FOOD_DATA_ATTRIBUTION } from '@/domain/foodData';

const DOCS: Record<string, { title: string; body: string[] }> = {
  terms: {
    title: '利用規約',
    body: [
      '利用規約は現在作成中です。アプリの一般公開前に、確定版をこの画面および公式サイトに掲載します。',
      '確定版の掲載後、内容に変更がある場合はアプリ内でお知らせし、改めて同意をお願いします。',
    ],
  },
  privacy: {
    title: 'プライバシーポリシー',
    body: [
      'プライバシーポリシーは現在作成中です。アプリの一般公開前に、確定版をこの画面および公式サイトに掲載します。',
      'BODYLOGは、体重・食事・運動の記録を、記録の保存・同期とアプリの提供のためにのみ利用します。広告配信やAIによる解析には利用しません。',
      'アカウントを削除すると、サーバー上の記録データはすべて削除されます。',
    ],
  },
  'data-source': {
    title: 'データ出典',
    body: FOOD_DATA_ATTRIBUTION,
  },
};

export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const d = DOCS[doc ?? ''] ?? DOCS.terms!;
  return (
    <ModalScreen title={d.title} cancelLabel="閉じる">
      <Card style={{ gap: 12 }}>
        {d.body.map((p, i) => (
          <AppText key={i} variant="callout">
            {p}
          </AppText>
        ))}
      </Card>
    </ModalScreen>
  );
}
