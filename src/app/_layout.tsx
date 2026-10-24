import { QueryClientProvider } from '@tanstack/react-query';
import {
  DarkTheme,
  DefaultTheme,
  SplashScreen,
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

import { Button, EmptyState, ErrorState, LoadingView } from '@/components/ui';
import { initSession, retryInitialSync, signOut, useSession } from '@/features/auth/session';
import { isSupabaseConfigured } from '@/lib/config';
import { queryClient, registerAppFocusManager } from '@/lib/queryClient';
import { AppThemeProvider, spacing, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

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

const MODAL = { presentation: 'modal' } as const;

function RootNavigator() {
  const { scheme, colors } = useTheme();
  const status = useSession((s) => s.status);
  const onboarded = useSession((s) => s.onboarded);
  const recovery = useSession((s) => s.passwordRecovery);

  useEffect(() => {
    initSession().catch(() => {});
  }, []);

  useEffect(() => {
    if (status !== 'initializing') SplashScreen.hideAsync().catch(() => {});
  }, [status]);

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

  let body;
  if (!__DEV__ && !isSupabaseConfigured()) {
    body = (
      <Centered>
        {<ErrorState title="設定エラー" message="アプリの接続設定がありません。" />}
      </Centered>
    );
  } else if (status === 'initializing') {
    body = <LoadingView />;
  } else if (status === 'initialSync') {
    body = (
      <Centered>
        <LoadingView label="データを同期しています" />
      </Centered>
    );
  } else if (status === 'initialSyncFailed') {
    body = (
      <Centered>
        <ErrorState
          title="データを取得できませんでした"
          message="この端末で初めてログインする場合は、インターネット接続が必要です。接続を確認して再試行してください。"
          onRetry={() => void retryInitialSync()}
        />
        <Button label="ログアウト" variant="ghost" onPress={() => void signOut()} />
      </Centered>
    );
  } else {
    const ready = status === 'ready';
    body = (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={ready && onboarded && !recovery}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="weight-entry" options={MODAL} />
          <Stack.Screen name="food/[id]" options={MODAL} />
          <Stack.Screen name="food-search" options={MODAL} />
          <Stack.Screen name="meal-item/[id]" options={MODAL} />
          <Stack.Screen name="custom-food" options={MODAL} />
          <Stack.Screen name="template/new" options={MODAL} />
          <Stack.Screen name="template/[id]" options={MODAL} />
          <Stack.Screen name="profile" options={MODAL} />
          <Stack.Screen name="goals" options={MODAL} />
          <Stack.Screen name="account-delete" options={MODAL} />
        </Stack.Protected>
        <Stack.Protected guard={ready && !onboarded && !recovery}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'signedOut'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={ready && recovery}>
          <Stack.Screen name="reset-password" />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="legal/[doc]" options={MODAL} />
      </Stack>
    );
  }

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={{ flex: 1, backgroundColor: colors.background }}>{body}</View>
    </ThemeProvider>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, justifyContent: 'center', padding: spacing.lg }}>{children}</View>;
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
      <EmptyState
        title="問題が発生しました"
        message="記録データは端末に保存されています。もう一度お試しください。"
        actionLabel="再試行"
        onAction={onRetry}
      />
    </View>
  );
}
