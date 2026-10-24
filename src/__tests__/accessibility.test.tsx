/**
 * Accessibility audit of the main screens (local mode): every pressable control and input has
 * an accessible name (label or visible text), so VoiceOver / TalkBack never reads "button".
 * Contrast and dynamic type still need checking on devices (docs/QA_CHECKLIST.md).
 */
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import type { SqlDb } from '@/data/db/types';
import { createTestDb } from '@/data/db/testing/nodeDb';
import { resetSessionForTests } from '@/features/auth/session';
import { mockBillingState } from '@/features/premium/billing/mock';

let mockDb: (SqlDb & { close(): void }) | null = null;
jest.mock('@/data/db/expoDb', () => ({ getDb: async () => mockDb }));
jest.setTimeout(60_000);

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };

function textOf(n: Node | string): string {
  if (typeof n === 'string') return n;
  return (n.children ?? []).map(textOf).join('');
}

/** Interactive host elements without an accessible name. */
function unnamed(root: Node | Node[] | null): { problems: string[]; checked: number } {
  const out: string[] = [];
  let checked = 0;
  const visit = (n: Node | string) => {
    if (typeof n === 'string') return;
    const p = n.props;
    const interactive =
      (typeof p.onClick === 'function' || typeof p.onResponderRelease === 'function') &&
      p.accessible !== false;
    const input = n.type === 'TextInput' || n.type === 'RCTSwitch';
    if ((interactive || input) && p.accessibilityElementsHidden !== true) {
      checked++;
      const name =
        (p.accessibilityLabel as string | undefined) ?? (input ? p.placeholder : textOf(n));
      if (!name || !String(name).trim()) {
        out.push(`${n.type}${p.testID ? `#${p.testID}` : ''}`);
      }
    }
    (n.children ?? []).forEach(visit);
  };
  (Array.isArray(root) ? root : root ? [root] : []).forEach(visit);
  return { problems: out, checked };
}

const audit = (screenName: string) => {
  const { problems, checked } = unnamed(screen.toJSON() as Node | Node[] | null);
  expect(checked).toBeGreaterThan(2); // the detector really sees the controls
  if (problems.length) throw new Error(`${screenName}: unnamed controls ${problems.join(', ')}`);
  counts.push(`${screenName}:${checked}`);
};

const counts: string[] = [];

beforeAll(async () => {
  resetSessionForTests();
  mockBillingState.reset();
  mockDb = await createTestDb();
});
afterAll(() => {
  mockDb?.close();
  console.log(`controls checked per screen: ${counts.join(', ')}`);
});

it('all main screens expose accessible names', async () => {
  await renderRouter('./src/app', { initialUrl: '/' });
  await screen.findByTestId('onboarding-screen');
  audit('onboarding');
  await fireEvent.changeText(screen.getByTestId('height-input'), '170');
  await fireEvent.changeText(screen.getByTestId('current-weight-input'), '70');
  await fireEvent.changeText(screen.getByTestId('target-weight-input'), '65');
  await fireEvent.press(screen.getByTestId('onboarding-next'));
  await fireEvent.changeText(await screen.findByTestId('goal-kcal-input'), '1800');
  audit('onboarding step 2');
  await fireEvent.press(screen.getByTestId('terms-checkbox'));
  await fireEvent.press(screen.getByTestId('onboarding-finish'));
  await screen.findByTestId('home-screen', {}, { timeout: 5000 });
  audit('home');

  await fireEvent.press(screen.getByTestId('tab-meals'));
  await screen.findByTestId('meals-screen');
  audit('meals');

  await fireEvent.press(screen.getByTestId('tab-records'));
  await screen.findByTestId('records-screen');
  audit('records (weight)');
  await fireEvent.press(screen.getByTestId('record-weight-button'));
  await screen.findByTestId('weight-entry-screen');
  audit('weight entry');
  await fireEvent.press(screen.getByText('キャンセル'));

  await fireEvent.press(await screen.findByLabelText('運動'));
  await fireEvent.press(await screen.findByTestId('record-exercise-button'));
  await screen.findByTestId('exercise-entry-screen');
  await fireEvent.press(screen.getByTestId('exercise-type-strength'));
  await fireEvent.press(screen.getByTestId('add-set'));
  audit('exercise entry');
  await fireEvent.press(screen.getByText('キャンセル'));

  await fireEvent.press(await screen.findByTestId('open-calendar'));
  await screen.findByTestId('calendar-screen');
  audit('calendar');
  await fireEvent.press(screen.getByText('閉じる'));

  await fireEvent.press(await screen.findByTestId('tab-mypage'));
  await screen.findByTestId('mypage-screen');
  audit('mypage');
  await fireEvent.press(screen.getByTestId('row-notifications'));
  await screen.findByTestId('notifications-screen');
  audit('notifications');
  await fireEvent.press(screen.getByText('閉じる'));
  await fireEvent.press(await screen.findByTestId('row-goals'));
  await screen.findByTestId('goals-screen');
  audit('goals');
  await fireEvent.press(screen.getByText('キャンセル'));
  await fireEvent.press(await screen.findByTestId('row-premium'));
  await screen.findByTestId('premium-price');
  audit('premium');
});
