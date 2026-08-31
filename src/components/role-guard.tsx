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

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // AuthGate above this in the tree already guarantees `user` is set before
  // any tab screen mounts, but we guard defensively anyway.
  if (!user) return null;
  if (user.role !== 'admin') return <Redirect href="/shop" />;
  return <>{children}</>;
}

export function RequireUser({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  // Admins aren't forbidden from the concept of the shop, but they land on
  // their own dashboard by default rather than being routed into User-only
  // screens — keeps "which app am I in" unambiguous.
  if (user.role === 'admin') return <Redirect href="/" />;
  return <>{children}</>;
}
