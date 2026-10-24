import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { useLocalRecords } from '@/features/records/localRecordsStore';

/** Resolved by expo-router from the Jest rootDir (project root). */
const APP_DIR = './src/app';

beforeEach(() => {
  useLocalRecords.setState({ weights: [], mealItems: [], exercises: [] });
});

describe('App shell', () => {
  it('renders the home screen with empty states', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    expect(await screen.findByTestId('home-screen')).toBeTruthy();
    expect(screen.getByText('今日の食事はまだありません')).toBeTruthy();
    expect(screen.getByText('体重はまだ記録されていません')).toBeTruthy();
    expect(screen.getByText('PFCバランス')).toBeTruthy();
  });

  it('has four bottom tabs', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    for (const id of ['tab-home', 'tab-meals', 'tab-records', 'tab-mypage']) {
      expect(await screen.findByTestId(id)).toBeTruthy();
    }
  });

  it('navigates to each tab', async () => {
    const r = await renderRouter(APP_DIR, { initialUrl: '/' });
    await fireEvent.press(await screen.findByTestId('tab-meals'));
    expect(await screen.findByTestId('meals-screen')).toBeTruthy();
    expect(r.getPathname()).toBe('/meals');

    await fireEvent.press(screen.getByTestId('tab-records'));
    expect(await screen.findByTestId('records-screen')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('tab-mypage'));
    expect(await screen.findByTestId('mypage-screen')).toBeTruthy();
  });
});

describe('Weight entry', () => {
  it('validates input before saving', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/weight-entry' });
    await fireEvent.changeText(await screen.findByTestId('weight-input'), '5');
    await fireEvent.press(screen.getByTestId('weight-save-button'));
    expect(await screen.findByText('20〜300kgの範囲で入力してください')).toBeTruthy();
    expect(useLocalRecords.getState().weights).toHaveLength(0);
  });

  it('saves a weight once and shows it on home', async () => {
    const r = await renderRouter(APP_DIR, { initialUrl: '/' });
    await fireEvent.press(await screen.findByText('体重を記録'));
    await fireEvent.changeText(await screen.findByTestId('weight-input'), '６５．４');
    await fireEvent.changeText(screen.getByTestId('bodyfat-input'), '22.5');
    const save = screen.getByTestId('weight-save-button');
    await fireEvent.press(save);
    await fireEvent.press(save);

    await waitFor(() => expect(r.getPathname()).toBe('/'));
    const weights = useLocalRecords.getState().weights;
    expect(weights).toHaveLength(1);
    expect(weights[0]).toMatchObject({ weightKg: 65.4, bodyFatPct: 22.5 });
    expect(await screen.findByText(/65\.4/)).toBeTruthy();
  });
});
