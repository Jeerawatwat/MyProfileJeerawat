// src/components/role-guard.tsx
// Frontend route guards — the UX layer of role separation. If a "user" role
// types an Admin URL directly into the browser's address bar (web), this
// redirects them away before the screen renders anything. The real security
// boundary is server-side (every mutating/admin API route checks the JWT's
// role — see backend/middleware/auth.js's requireRole) — this component only
// stops a signed-in user from *seeing* a screen they have no business on; it
// is not what keeps their data safe.
import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { useAuth } from '@/context/auth-context';

// Where each role lands when it hits a screen that isn't theirs.
function homeFor(role: string) {
  if (role === 'admin') return '/' as const;
  if (role === 'accounting') return '/accounting' as const;
  return '/shop' as const;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // AuthGate above this in the tree already guarantees `user` is set before
  // any tab screen mounts, but we guard defensively anyway.
  if (!user) return null;
  if (user.role !== 'admin') return <Redirect href={homeFor(user.role)} />;
  return <>{children}</>;
}

export function RequireUser({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  // Admins (and accounting) aren't routed into User-only screens — they land
  // on their own home instead, keeping "which app am I in" unambiguous.
  if (user.role !== 'user') return <Redirect href={homeFor(user.role)} />;
  return <>{children}</>;
}

export function RequireAccounting({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== 'accounting') return <Redirect href={homeFor(user.role)} />;
  return <>{children}</>;
}
