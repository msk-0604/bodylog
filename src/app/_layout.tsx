import { QueryClientProvider } from '@tanstack/react-query';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  type ErrorBoundaryProps,
  type Theme as NavigationTheme,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorState } from '@/components/ui';
import { queryClient, registerAppFocusManager } from '@/lib/queryClient';
import { AppThemeProvider, useTheme } from '@/theme';

export default function RootLayout() {
  useEffect(() => registerAppFocusManager(), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppThemeProvider>
          <QueryClientProvider client={queryClient}>
            <RootNavigator />
          </QueryClientProvider>
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { scheme, colors } = useTheme();

  const navTheme = useMemo<NavigationTheme>(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.separator,
      },
    };
  }, [scheme, colors]);

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="weight-entry" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}

/** Last-resort error screen for uncaught render errors. Never shows raw error text. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <AppThemeProvider>
      <ErrorScreen onRetry={retry} />
    </AppThemeProvider>
  );
}

function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
      <ErrorState
        title="問題が発生しました"
        message="記録データは端末に保持されています。もう一度お試しください。"
        onRetry={onRetry}
      />
    </View>
  );
}
