import { fireEvent, render, screen } from '@testing-library/react-native';

import { formatKcal, sumNutrients } from '@/domain/nutrition';
import { CalorieCard, PfcCard } from '@/features/home/HomeCards';
import { AppThemeProvider } from '@/theme';

import { Button } from '../Button';

const wrap = (ui: React.ReactElement) => render(<AppThemeProvider>{ui}</AppThemeProvider>);

describe('Button', () => {
  it('calls onPress', async () => {
    const onPress = jest.fn();
    await wrap(<Button label="保存" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: '保存' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('blocks presses while loading (no double submit)', async () => {
    const onPress = jest.fn();
    await wrap(<Button label="保存" onPress={onPress} loading />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('CalorieCard', () => {
  it('shows remaining kcal under goal', async () => {
    await wrap(<CalorieCard intake={1650} goal={2000} />);
    expect(screen.getByText('残り')).toBeTruthy();
    expect(screen.getByText('350')).toBeTruthy();
    expect(
      screen.getByLabelText(/摂取1,650キロカロリー、目標2,000キロカロリー、残り350/),
    ).toBeTruthy();
  });

  it('shows the overage without blaming language', async () => {
    await wrap(<CalorieCard intake={2300} goal={2000} />);
    expect(screen.getByText('目標を超えています')).toBeTruthy();
    expect(screen.getByText('+300')).toBeTruthy();
  });

  it('handles an unset goal', async () => {
    await wrap(<CalorieCard intake={0} goal={null} />);
    expect(screen.getByText('未設定')).toBeTruthy();
    expect(screen.getAllByText(formatKcal(0)).length).toBeGreaterThan(0);
  });
});

describe('PfcCard', () => {
  it('marks totals with unknown nutrient values', async () => {
    const totals = sumNutrients([{ energyKcal: 100, proteinG: 5, fatG: null, carbohydrateG: 10 }]);
    await wrap(<PfcCard totals={totals} goals={{ proteinG: 60, fatG: 50, carbohydrateG: 250 }} />);
    expect(screen.getByText(/一部の食品は成分値が不明/)).toBeTruthy();
    expect(
      screen.getByLabelText(/脂質 0.0グラム、目標50.0グラム、一部の食品は値が不明/),
    ).toBeTruthy();
  });
});
