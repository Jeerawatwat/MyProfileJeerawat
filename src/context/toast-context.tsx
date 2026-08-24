// src/context/toast-context.tsx
// App-wide success/error notifications ("Product added successfully", etc.)
// Kept intentionally simple: one toast on screen at a time, auto-dismiss.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

type ToastTone = 'success' | 'error';
type ToastState = { id: number; message: string; tone: ToastTone } | null;

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const id = Date.now();
    setToast({ id, message, tone });
    timeoutRef.current = setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 3000);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <Animated.View
          key={toast.id}
          entering={FadeInUp.duration(220)}
          exiting={FadeOutDown.duration(180)}
          style={styles.toastWrapper}>
          <ThemedView
            type="cardBackground"
            style={[styles.toast, toast.tone === 'error' ? styles.toastError : styles.toastSuccess]}>
            <ThemedText type="smallBold" themeColor={toast.tone === 'error' ? 'danger' : 'success'}>
              {toast.message}
            </ThemedText>
          </ThemedView>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  toastWrapper: {
    position: 'absolute',
    bottom: Spacing.six,
    left: Spacing.three,
    right: Spacing.three,
    alignItems: 'center',
  },
  toast: {
    maxWidth: MaxContentWidth - Spacing.six,
    alignSelf: 'center',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastSuccess: {
    borderColor: '#1F7A4655',
  },
  toastError: {
    borderColor: '#D33A3F55',
  },
});
