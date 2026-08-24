// src/context/auth-context.tsx
// Owns the logged-in state for the whole app. On mount it re-hydrates a
// persisted token and validates it against the real backend (/api/auth/me)
// before trusting it — an expired/tampered token just falls back to the
// Login screen rather than granting access.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ApiError, authApi, type AuthUser } from '@/lib/api';
import { clearStoredAuth, getStoredAuth, setStoredAuth } from '@/lib/storage';

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await getStoredAuth();
      if (!stored) {
        setIsLoading(false);
        return;
      }
      try {
        const { user: freshUser } = await authApi.me();
        setUser(freshUser);
      } catch {
        // Token missing/expired/invalid — clear it and send the user back to Login.
        await clearStoredAuth();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { token, user: loggedInUser } = await authApi.login(username, password);
    await setStoredAuth(token, loggedInUser);
    setUser(loggedInUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (err) {
      // Best-effort — a network failure shouldn't trap the user in a "logged
      // in" state. ApiError is expected here on flaky connections.
      if (!(err instanceof ApiError)) throw err;
    }
    await clearStoredAuth();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, isLoading, login, logout }), [user, isLoading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
