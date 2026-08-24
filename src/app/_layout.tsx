import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ActivityIndicator } from 'react-native';
import type { ReactNode } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { LoginScreen } from '@/components/login-screen';
import { ThemedView } from '@/components/themed-view';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { ThemeModeProvider, useThemeMode } from '@/context/theme-context';
import { ToastProvider } from '@/context/toast-context';

SplashScreen.preventAutoHideAsync();

// Gate: while we're checking a persisted token, show a loading state; once we
// know, either the real app (AppTabs) or the Login screen is rendered — never
// both, so an unauthenticated visitor can never see Dashboard/Products/etc.
function AuthGate() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return user ? <AppTabs /> : <LoginScreen />;
}

// Picks the navigation chrome theme (header/status bar colors etc.) to match
// whatever the user picked in Profile → Appearance, not just the OS setting.
function NavigationThemeBridge({ children }: { children: ReactNode }) {
  const { resolvedScheme } = useThemeMode();
  return <ThemeProvider value={resolvedScheme === 'dark' ? DarkTheme : DefaultTheme}>{children}</ThemeProvider>;
}

export default function TabLayout() {
  return (
    <ThemeModeProvider>
      <NavigationThemeBridge>
        <AnimatedSplashOverlay />
        <AuthProvider>
          <ToastProvider>
            <AuthGate />
          </ToastProvider>
        </AuthProvider>
      </NavigationThemeBridge>
    </ThemeModeProvider>
  );
}
