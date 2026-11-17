import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setSessionExpiredHandler } from '@/api/client';
import { ToastHost } from '@/components/ui/toast-host';
import { useAuth, signOut } from '@/features/auth/use-auth';
import { queryClient } from '@/lib/query-client';
import { setupReactQueryNative } from '@/lib/react-query-native';
import { useSessionStore } from '@/store/session';

SplashScreen.preventAutoHideAsync();
setupReactQueryNative();

function RootNavigator() {
  const { signedIn, isLoading } = useAuth();

  useEffect(() => {
    void useSessionStore.getState().hydrate();
    // 401 on an authenticated request = expired/invalid token: back to sign-in (no refresh endpoint exists).
    setSessionExpiredHandler(() => void signOut());
    return () => setSessionExpiredHandler(null);
  }, []);

  useEffect(() => {
    if (!isLoading) void SplashScreen.hideAsync();
  }, [isLoading]);

  if (isLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
          <StatusBar style="auto" />
          <RootNavigator />
          <ToastHost />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
