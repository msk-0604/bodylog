import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
    mutations: {
      retry: 0,
    },
  },
});

/** Refetch on app foreground (TanStack Query's window-focus equivalent on native). */
export function registerAppFocusManager() {
  if (Platform.OS === 'web') return () => {};
  const sub = AppState.addEventListener('change', (status) => {
    focusManager.setFocused(status === 'active');
  });
  return () => sub.remove();
}
