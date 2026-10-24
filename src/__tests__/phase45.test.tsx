/**
 * Phase 4/5 flows in local mode: exercise logging (estimate, strength sets), budget preference,
 * weight on a past day, graph range gating for the free plan, calendar and local reminders.
 * SQLite is node:sqlite; expo-notifications is the in-memory mock from src/testing.
 */
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import type { SqlDb } from '@/data/db/types';
import { createTestDb } from '@/data/db/testing/nodeDb';
import { addDays, toDateKey } from '@/domain/date';
import { resetSessionForTests } from '@/features/auth/session';
import { mockNotifications } from '@/testing/notificationsMock';

let mockDb: (SqlDb & { close(): void }) | null = null;
jest.mock('@/data/db/expoDb', () => ({ getDb: async () => mockDb }));

const APP_DIR = './src/app';
jest.setTimeout(30_000);

beforeEach(async () => {
  resetSessionForTests();
  mockNotifications.reset();
  mockDb = await createTestDb();
});
afterEach(() => {
  mockDb?.close();
  mockDb = null;
});

async function start() {
  const r = await renderRouter(APP_DIR, { initialUrl: '/' });
  await fireEvent.changeText(await screen.findByTestId('height-input'), '170');
  await fireEvent.changeText(screen.getByTestId('current-weight-input'), '70');
  await fireEvent.changeText(screen.getByTestId('target-weight-input'), '65');
  await fireEvent.press(screen.getByTestId('onboarding-next'));
  await fireEvent.changeText(await screen.findByTestId('goal-kcal-input'), '1800');
  await fireEvent.press(screen.getByTestId('terms-checkbox'));
  await fireEvent.press(screen.getByTestId('onboarding-finish'));
  await screen.findByTestId('home-screen', {}, { timeout: 5000 });
  return r;
}

async function openExerciseEntry() {
  await fireEvent.press(screen.getByTestId('tab-records'));
  await fireEvent.press(await screen.findByLabelText('運動'));
  await fireEvent.press(await screen.findByTestId('record-exercise-button'));
  await screen.findByTestId('exercise-entry-screen');
}

describe('exercise', () => {
  it('estimates kcal from METs and body weight and saves the record', async () => {
    const r = await start();
    await openExerciseEntry();
    await fireEvent.press(screen.getByTestId('exercise-type-running'));
    await fireEvent.changeText(screen.getByTestId('exercise-duration'), '30');
    // running, moderate = 8.3 METs: 8.3 × 70 kg × 0.5 h × 1.05 = 305.0
    expect(screen.getByTestId('exercise-kcal-estimate')).toHaveTextContent('推定 305 kcal');
    await fireEvent.press(screen.getByTestId('exercise-save'));
    await waitFor(() => expect(r.getPathname()).toBe('/records'));
    expect(await screen.findByTestId('exercise-row-ランニング')).toBeTruthy();

    const rows = await mockDb!.all<{ kcal: number; kcal_is_estimated: number; mets: number }>(
      'SELECT kcal, kcal_is_estimated, mets FROM exercise_entries WHERE deleted_at IS NULL',
    );
    expect(rows).toEqual([{ kcal: 305, kcal_is_estimated: 1, mets: 8.3 }]);
  });

  it('records strength sets with decimal weights and rejects invalid reps', async () => {
    const r = await start();
    await openExerciseEntry();
    await fireEvent.press(screen.getByTestId('exercise-type-strength'));
    await fireEvent.changeText(screen.getByTestId('exercise-duration'), '20');
    await fireEvent.press(screen.getByTestId('add-set'));
    await fireEvent.changeText(screen.getByTestId('set-name-0'), 'ベンチプレス');
    await fireEvent.changeText(screen.getByTestId('set-weight-0'), '62.5');
    await fireEvent.changeText(screen.getByTestId('set-reps-0'), 'abc');
    await fireEvent.press(screen.getByTestId('exercise-save'));
    expect(await screen.findByText(/回数は1〜\d+回で入力してください/)).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('set-reps-0'), '８');
    await fireEvent.press(screen.getByTestId('add-set')); // copies the previous set
    await fireEvent.press(screen.getByTestId('exercise-save'));
    await waitFor(() => expect(r.getPathname()).toBe('/records'));

    const sets = await mockDb!.all<{ exercise_name: string; weight_kg: number; reps: number }>(
      'SELECT exercise_name, weight_kg, reps FROM exercise_sets WHERE deleted_at IS NULL ORDER BY set_number',
    );
    expect(sets).toEqual([
      { exercise_name: 'ベンチプレス', weight_kg: 62.5, reps: 8 },
      { exercise_name: 'ベンチプレス', weight_kg: 62.5, reps: 8 },
    ]);
  });

  it('adds net exercise kcal to the budget only when the preference is on', async () => {
    await start();
    await openExerciseEntry();
    await fireEvent.press(screen.getByTestId('exercise-type-running'));
    await fireEvent.changeText(screen.getByTestId('exercise-duration'), '30');
    await fireEvent.press(screen.getByTestId('exercise-save'));
    await screen.findByTestId('exercise-row-ランニング');

    await fireEvent.press(screen.getByTestId('tab-home'));
    expect(await screen.findByLabelText(/目標1,800キロカロリー/)).toBeTruthy();
    expect(screen.queryByTestId('exercise-bonus')).toBeNull();

    await fireEvent.press(screen.getByTestId('tab-mypage'));
    await fireEvent.press(await screen.findByTestId('row-goals'));
    await fireEvent(await screen.findByTestId('include-exercise-switch'), 'valueChange', true);
    await fireEvent.press(screen.getByText('キャンセル'));
    await fireEvent.press(await screen.findByTestId('tab-home'));
    // net = (8.3 − 1) × 70 × 0.5 × 1.05 = 268.275 → 268
    expect(await screen.findByTestId('exercise-bonus')).toHaveTextContent(/運動 268 kcal/);
    expect(screen.getByLabelText(/目標2,068キロカロリー/)).toBeTruthy();
  });
});

describe('weight', () => {
  it('records on a past day with a note', async () => {
    const r = await start();
    await fireEvent.press(screen.getByTestId('tab-records'));
    await fireEvent.press(await screen.findByTestId('record-weight-button'));
    await fireEvent.press(await screen.findByLabelText('前の日'));
    await fireEvent.changeText(screen.getByTestId('weight-input'), '69.8');
    await fireEvent.changeText(screen.getByTestId('weight-note'), '外食の翌日');
    await fireEvent.press(screen.getByTestId('weight-save-button'));
    await waitFor(() => expect(r.getPathname()).toBe('/records'));
    const yesterday = addDays(toDateKey(new Date()), -1);
    // the modal closes only after the write finished
    expect(
      await mockDb!.all('SELECT measured_on, note FROM body_measurements WHERE weight_kg = 69.8'),
    ).toEqual([{ measured_on: yesterday, note: '外食の翌日' }]);
  });

  it('locks 30-day and longer graphs on the free plan and opens the paywall', async () => {
    await start();
    await fireEvent.press(screen.getByTestId('tab-records'));
    expect(screen.queryByTestId('period-stats')).toBeNull();
    await fireEvent.press(await screen.findByLabelText('30日（Premium）'));
    expect(await screen.findByTestId('premium-screen')).toBeTruthy();
    expect(screen.getByTestId('premium-feature')).toHaveTextContent(/30日・90日・全期間のグラフ/);
  });
});

describe('calendar', () => {
  it('marks recorded days and shows the day detail', async () => {
    await start();
    await fireEvent.press(screen.getByTestId('tab-records'));
    await fireEvent.press(await screen.findByTestId('open-calendar'));
    const today = toDateKey(new Date());
    const cell = await screen.findByTestId(`cal-${today}`);
    await waitFor(() => expect(cell.props.accessibilityLabel).toMatch(/体重の記録あり/));
    await fireEvent.press(cell);
    expect(await screen.findByText('70.0 kg')).toBeTruthy();
  });
});

describe('reminders', () => {
  async function openSettings() {
    await fireEvent.press(screen.getByTestId('tab-mypage'));
    await fireEvent.press(await screen.findByTestId('row-notifications'));
    await screen.findByTestId('notifications-screen');
  }

  it('asks permission on first enable, schedules daily, follows time changes and turns off', async () => {
    await start();
    await openSettings();
    expect(mockNotifications.requests).toBe(0); // never asked before the user opts in

    await fireEvent(screen.getByTestId('reminder-switch-breakfast'), 'valueChange', true);
    await waitFor(() => expect(mockNotifications.scheduled.has('reminder-breakfast')).toBe(true));
    expect(mockNotifications.requests).toBe(1);
    expect(mockNotifications.scheduled.get('reminder-breakfast')!.trigger).toMatchObject({
      type: 'daily',
      hour: 8,
      minute: 30,
    });

    await fireEvent.press(screen.getByLabelText('朝食の記録の時刻を1時間後に'));
    await fireEvent.press(screen.getByLabelText('朝食の記録の時刻を5分後に'));
    await waitFor(() =>
      expect(mockNotifications.scheduled.get('reminder-breakfast')!.trigger).toMatchObject({
        hour: 9,
        minute: 35,
      }),
    );
    expect(mockNotifications.scheduled.size).toBe(1);

    await fireEvent(screen.getByTestId('reminder-switch-breakfast'), 'valueChange', false);
    await waitFor(() => expect(mockNotifications.scheduled.size).toBe(0));
    const stored = await mockDb!.get<{ enabled: number; hour: number; minute: number }>(
      "SELECT enabled, hour, minute FROM notification_settings WHERE kind = 'breakfast'",
    );
    expect(stored).toEqual({ enabled: 0, hour: 9, minute: 35 });
  });

  it('keeps the reminder off and offers the system settings when permission is denied', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    mockNotifications.grantOnRequest = false;
    await start();
    await openSettings();
    await fireEvent(screen.getByTestId('reminder-switch-dinner'), 'valueChange', true);
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        '通知がオフになっています',
        expect.any(String),
        expect.arrayContaining([expect.objectContaining({ text: '設定を開く' })]),
      ),
    );
    expect(mockNotifications.scheduled.size).toBe(0);
    expect(screen.getByTestId('reminder-switch-dinner').props.value).toBe(false);
  });

  it('reschedules enabled reminders after an app restart', async () => {
    await start();
    await openSettings();
    await fireEvent(screen.getByTestId('reminder-switch-lunch'), 'valueChange', true);
    await waitFor(() => expect(mockNotifications.scheduled.has('reminder-lunch')).toBe(true));

    // restart: OS-scheduled notifications cleared (e.g. after an app update), DB kept
    resetSessionForTests();
    mockNotifications.scheduled.clear();
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await screen.findByTestId('home-screen');
    await waitFor(() => expect(mockNotifications.scheduled.has('reminder-lunch')).toBe(true));
  });
});
