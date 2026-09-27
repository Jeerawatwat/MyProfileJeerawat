// src/components/role-guard.tsx
// Frontend route guards — the UX layer of role separation.
// Uses router.replace in a safe useEffect hook to prevent infinite redirect loops
// in React 19 / Expo Router.
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';

import { useAuth } from '@/context/auth-context';

// Where each role lands when it hits a screen that isn't theirs.
export function homeFor(role?: string | null) {
  const r = (role || '').trim().toLowerCase();
  if (r === 'admin') return '/' as const;
  if (r === 'accounting') return '/accounting' as const;
  if (r === 'manager') return '/manager/dashboard' as const;
  if (r === 'delivery') return '/delivery/orders' as const;
  if (r === 'stock') return '/stock/inventory' as const;
  return '/shop' as const;
}

function useRoleRedirect(isAllowed: boolean) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const redirectedRef = useRef(false);

  const role = (user?.role || '').trim().toLowerCase();
  const target = homeFor(role);

  useEffect(() => {
    if (!user || isAllowed || redirectedRef.current) return;
    if (pathname !== target) {
      redirectedRef.current = true;
      router.replace(target);
    }
  }, [user, isAllowed, pathname, target, router]);

  return { isAllowed: !!user && isAllowed };
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = (user?.role || '').trim().toLowerCase();
  const { isAllowed } = useRoleRedirect(role === 'admin');

  if (!isAllowed) return null;
  return <>{children}</>;
}

export function RequireUser({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = (user?.role || '').trim().toLowerCase();
  const { isAllowed } = useRoleRedirect(role === 'user');

  if (!isAllowed) return null;
  return <>{children}</>;
}

export function RequireAccounting({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = (user?.role || '').trim().toLowerCase();
  const { isAllowed } = useRoleRedirect(role === 'accounting');

  if (!isAllowed) return null;
  return <>{children}</>;
}

export function RequireManager({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = (user?.role || '').trim().toLowerCase();
  const { isAllowed } = useRoleRedirect(role === 'manager');

  if (!isAllowed) return null;
  return <>{children}</>;
}

export function RequireDelivery({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = (user?.role || '').trim().toLowerCase();
  const { isAllowed } = useRoleRedirect(role === 'delivery');

  if (!isAllowed) return null;
  return <>{children}</>;
}

export function RequireStock({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = (user?.role || '').trim().toLowerCase();
  const { isAllowed } = useRoleRedirect(role === 'stock' || role === 'admin');

  if (!isAllowed) return null;
  return <>{children}</>;
}
