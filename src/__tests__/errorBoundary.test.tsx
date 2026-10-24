import { fireEvent, render, screen } from '@testing-library/react-native';

import { AppErrorScreen } from '@/components/AppErrorScreen';
import { AppThemeProvider } from '@/theme';

it('shows a calm recovery screen (no technical details) and retries', async () => {
  const retry = jest.fn();
  await render(
    <AppThemeProvider>
      <AppErrorScreen onRetry={retry} />
    </AppThemeProvider>,
  );
  expect(screen.getByText('問題が発生しました')).toBeTruthy();
  expect(screen.getByText(/記録データは端末に保存されています/)).toBeTruthy();
  await fireEvent.press(screen.getByText('再試行'));
  expect(retry).toHaveBeenCalled();
});
