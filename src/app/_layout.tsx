import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import type { ReactNode } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import UserTabs from '@/components/user-tabs';
import { BrandHeader } from '@/components/brand-header';
import { ChatFab } from '@/components/chat-fab';
import { LoginScreen } from '@/components/login-screen';
import { RegisterScreen } from '@/components/register-screen';
import { ThemedView } from '@/components/themed-view';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { CartProvider } from '@/context/cart-context';
import { ThemeModeProvider, useThemeMode } from '@/context/theme-context';
import { ToastProvider, useToast } from '@/context/toast-context';

SplashScreen.preventAutoHideAsync();

// Unauthenticated flow: Login <-> Register, switched locally (no route change
// needed — nobody is logged in yet, so there's nothing on the URL worth
// bookmarking here). Register never logs the user in itself; it hands back to
// Login with the new username prefilled, per the "register, then sign in"
// flow the brief asks for.
function UnauthenticatedGate() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [prefillUsername, setPrefillUsername] = useState('');
  const { showToast } = useToast();

  if (mode === 'register') {
    return (
      <RegisterScreen
        onRegistered={(username) => {
          setPrefillUsername(username);
          setMode('login');
          showToast('สมัครสมาชิกสำเร็จ! เข้าสู่ระบบเพื่อเริ่มช้อปปิ้ง');
        }}
        onBackToLogin={() => setMode('login')}
      />
    );
  }

  return <LoginScreen prefillUsername={prefillUsername} onSwitchToRegister={() => setMode('register')} />;
}

// Gate: while we're checking a persisted token, show a loading state; once we
// know, either the real app (role-appropriate tabs) or the Login/Register
// flow is rendered — never both, so an unauthenticated visitor can never see
// Dashboard/Products/Shop/etc., and role decides which tab set mounts:
//   - role === 'admin' -> AppTabs (Dashboard, Products, Categories, Orders, Profile)
//   - role === 'user'  -> UserTabs (Shop, Cart, My Orders, Account)
// This is the one place that decision is made — nowhere else guesses at it.
function AuthGate() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (!user) {
    return <UnauthenticatedGate />;
  }

  const isAdmin = user.role === 'admin';

  return (
    <CartProvider>
      <ThemedView style={{ flex: 1 }}>
        <BrandHeader />
        <ThemedView style={{ flex: 1 }}>{isAdmin ? <AppTabs /> : <UserTabs />}</ThemedView>
        <ChatFab />
      </ThemedView>
    </CartProvider>
  );
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
