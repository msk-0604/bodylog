/**
 * App-level flows in local mode (no Supabase settings): onboarding → food search → logging →
 * home totals → "restart" with the same SQLite database. SQLite is node:sqlite here
 * (same SQL as expo-sqlite on device); native rendering on iOS/Android is not covered.
 */
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import type { SqlDb } from '@/data/db/types';
import { createTestDb } from '@/data/db/testing/nodeDb';
import { cacheMasterFoods, type MasterFoodRow } from '@/data/repo/foods';
import { resetSessionForTests } from '@/features/auth/session';
import { useMealsUi } from '@/features/meals/mealsUi';

let mockDb: (SqlDb & { close(): void }) | null = null;
jest.mock('@/data/db/expoDb', () => ({ getDb: async () => mockDb }));

const APP_DIR = './src/app';

jest.setTimeout(30_000);

// Fictional test food (NOT a real 成分表 value)
const FOOD: MasterFoodRow = {
  id: '00000000-0000-4000-8000-000000000001',
  food_code: 'T0001',
  name: 'テスト穀物 めし',
  category_code: '01',
  category_name: '穀類',
  energy_kcal: 150,
  protein_g: 2,
  fat_g: 0.5,
  carbohydrate_g: 35,
  value_flags: {},
  source_version: 'test-v1',
};

/** A database kept from one test to the next to simulate an app restart. */
let keptDb: (SqlDb & { close(): void }) | null = null;

beforeEach(async () => {
  resetSessionForTests();
  if (keptDb) {
    mockDb = keptDb;
    keptDb = null;
  } else {
    mockDb = await createTestDb();
    await cacheMasterFoods(mockDb, [FOOD]);
  }
  useMealsUi.setState({ mealType: 'breakfast' });
});
afterEach(() => {
  if (mockDb !== keptDb) mockDb?.close();
  mockDb = null;
});

async function completeOnboarding() {
  await fireEvent.changeText(await screen.findByTestId('height-input'), '170');
  await fireEvent.changeText(screen.getByTestId('current-weight-input'), '70');
  await fireEvent.changeText(screen.getByTestId('target-weight-input'), '65');
  await fireEvent.press(screen.getByTestId('onboarding-next'));
  await fireEvent.changeText(await screen.findByTestId('goal-kcal-input'), '1800');
  await fireEvent.press(screen.getByTestId('terms-checkbox'));
  await fireEvent.press(screen.getByTestId('onboarding-finish'));
  await screen.findByTestId('home-screen', {}, { timeout: 5000 });
}

describe('first launch', () => {
  it('shows onboarding, validates, then the home screen with the goal', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    expect(await screen.findByTestId('onboarding-screen')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onboarding-next'));
    expect(await screen.findByText('80〜250cmの範囲で入力してください')).toBeTruthy();

    await completeOnboarding();
    // calorie card: remaining = goal (nothing eaten yet); initial weight recorded
    expect(await screen.findByLabelText(/目標1,800キロカロリー、残り1,800/)).toBeTruthy();
    expect(await screen.findByText(/70\.0/)).toBeTruthy();
  });

  it('requires agreeing to the terms', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await fireEvent.changeText(await screen.findByTestId('height-input'), '170');
    await fireEvent.changeText(screen.getByTestId('current-weight-input'), '70');
    await fireEvent.changeText(screen.getByTestId('target-weight-input'), '65');
    await fireEvent.press(screen.getByTestId('onboarding-next'));
    await fireEvent.changeText(await screen.findByTestId('goal-kcal-input'), '1800');
    await fireEvent.press(screen.getByTestId('onboarding-finish'));
    expect(await screen.findByText('ご利用には同意が必要です')).toBeTruthy();
  });
});

describe('logging a meal', () => {
  it('searches, adds 150 g and shows the totals on home', async () => {
    const r = await renderRouter(APP_DIR, { initialUrl: '/' });
    await completeOnboarding();

    await fireEvent.press(screen.getByTestId('tab-meals'));
    await fireEvent.changeText(await screen.findByTestId('food-search-input'), 'ﾃｽﾄ');
    await fireEvent.press(await screen.findByTestId(`food-result-${FOOD.name}`));
    expect(await screen.findByTestId('food-screen')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('grams-chip-150'));
    expect(screen.getByTestId('nutrient-kcal')).toHaveTextContent(/225/);
    const add = screen.getByTestId('add-food-button');
    await fireEvent.press(add);
    await fireEvent.press(add); // double tap must not log twice

    await waitFor(() => expect(r.getPathname()).toBe('/meals'));
    await fireEvent.changeText(screen.getByTestId('food-search-input'), '');
    expect(await screen.findAllByTestId(`meal-item-${FOOD.name}`)).toHaveLength(1);

    await fireEvent.press(screen.getByTestId('tab-home'));
    expect(await screen.findByText('1,575')).toBeTruthy(); // remaining: 1800 - 225
    keptDb = mockDb; // hand the same SQLite database to the next test ("restart")
  });

  it('keeps the logged meal after an app restart', async () => {
    // Fresh session/query cache/navigation, same database as the previous test.
    const items = await mockDb!.all('SELECT * FROM meal_items WHERE deleted_at IS NULL');
    expect(items).toHaveLength(1);
    await renderRouter(APP_DIR, { initialUrl: '/' });
    expect(await screen.findByTestId('home-screen')).toBeTruthy(); // no onboarding again
    expect(await screen.findByText('1,575')).toBeTruthy();
    expect(screen.getByText(new RegExp(FOOD.name))).toBeTruthy();
  });

  it('edits the amount of a logged item', async () => {
    const r = await renderRouter(APP_DIR, { initialUrl: '/' });
    await completeOnboarding();
    await fireEvent.press(screen.getByTestId('tab-meals'));
    await fireEvent.changeText(await screen.findByTestId('food-search-input'), 'めし');
    await fireEvent.press(await screen.findByTestId(`food-result-${FOOD.name}`));
    await fireEvent.press(await screen.findByTestId('add-food-button')); // default 100 g
    await waitFor(() => expect(r.getPathname()).toBe('/meals'));
    await fireEvent.changeText(screen.getByTestId('food-search-input'), '');

    await fireEvent.press(await screen.findByTestId(`meal-item-${FOOD.name}`));
    await fireEvent.changeText(await screen.findByTestId('edit-grams-input'), '200');
    expect(screen.getByTestId('nutrient-kcal')).toHaveTextContent(/300/);
    await fireEvent.press(screen.getByTestId('save-meal-item'));
    await waitFor(() => expect(r.getPathname()).toBe('/meals'));
    expect((await screen.findAllByText('300 kcal')).length).toBeGreaterThan(0);
  });
});

describe('weight', () => {
  it('validates and persists a weight record', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await completeOnboarding();
    await fireEvent.press(screen.getByTestId('tab-records'));
    await fireEvent.press(await screen.findByTestId('record-weight-button'));
    await fireEvent.changeText(await screen.findByTestId('weight-input'), '5');
    await fireEvent.press(screen.getByTestId('weight-save-button'));
    expect(await screen.findByText('20〜300kgの範囲で入力してください')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('weight-input'), '６９．４');
    await fireEvent.press(screen.getByTestId('weight-save-button'));
    // shown in the goal card (現在) and the history list
    expect((await screen.findAllByText('69.4 kg')).length).toBeGreaterThanOrEqual(2);
    const rows = await mockDb!.all<{ weight_kg: number }>(
      'SELECT weight_kg FROM body_measurements WHERE deleted_at IS NULL ORDER BY measured_at',
    );
    expect(rows.map((r) => r.weight_kg)).toEqual([70, 69.4]);
  });
});

describe('account deletion (local mode)', () => {
  it('requires both confirmations, wipes all data and returns to onboarding', async () => {
    const { Alert } = jest.requireActual<typeof import('react-native')>('react-native');
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await completeOnboarding();
    await fireEvent.press(screen.getByTestId('tab-mypage'));
    await fireEvent.press(await screen.findByTestId('row-delete-account'));
    expect(await screen.findByTestId('account-delete-screen')).toBeTruthy();

    const button = screen.getByRole('button', { name: 'アカウントを削除' });
    expect(button).toBeDisabled();
    await fireEvent.press(screen.getByText('サブスクリプションの状況を確認しました'));
    await fireEvent.press(
      screen.getByText('すべてのデータが削除され、元に戻せないことを理解しました'),
    );
    await fireEvent.press(button);

    expect(await screen.findByTestId('onboarding-screen')).toBeTruthy();
    const left = await mockDb!.get<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM body_measurements) + (SELECT COUNT(*) FROM profiles)
         + (SELECT COUNT(*) FROM nutrition_goals) AS n`,
    );
    expect(Number(left!.n)).toBe(0);
    alertSpy.mockRestore();
  });
});
