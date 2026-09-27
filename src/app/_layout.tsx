import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import AccountingTabs from '@/components/accounting-tabs';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { BrandHeader } from '@/components/brand-header';
import { ChatFab } from '@/components/chat-fab';
import { LoginScreen } from '@/components/login-screen';
import ManagerTabs from '@/components/manager-tabs';
import { RegisterScreen } from '@/components/register-screen';
import { ThemedView } from '@/components/themed-view';
import UserTabs from '@/components/user-tabs';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { CartProvider } from '@/context/cart-context';
import { ReportRangeProvider } from '@/context/report-range-context';
import { ThemeModeProvider, useThemeMode } from '@/context/theme-context';
import { ToastProvider, useToast } from '@/context/toast-context';

import DeliveryTabs from '@/components/delivery-tabs';
import StockTabs from '@/components/stock-tabs';

SplashScreen.preventAutoHideAsync();

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

  const role = (user.role || '').trim().toLowerCase();
  let tabs = <UserTabs />;
  if (role === 'admin') {
    tabs = <AppTabs />;
  } else if (role === 'accounting') {
    tabs = (
      <ReportRangeProvider>
        <AccountingTabs />
      </ReportRangeProvider>
    );
  } else if (role === 'manager') {
    tabs = <ManagerTabs />;
  } else if (role === 'delivery') {
    tabs = <DeliveryTabs />;
  } else if (role === 'stock') {
    tabs = <StockTabs />;
  }

  return (
    <CartProvider>
      <ThemedView style={{ flex: 1 }}>
        <BrandHeader />
        <ThemedView style={{ flex: 1 }}>{tabs}</ThemedView>
        <ChatFab />
      </ThemedView>
    </CartProvider>
  );
}

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