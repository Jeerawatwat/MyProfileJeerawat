// src/lib/storage.ts
// Thin wrapper so the rest of the app doesn't care whether it's running on web
// (falls back to localStorage automatically inside AsyncStorage's web shim) or
// on a native device. Only ever stores the JWT + the logged-in user's public
// profile (id/username/role) — never a password or DB credential.
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'inventory_auth_token';
const USER_KEY = 'inventory_auth_user';

export type StoredUser = { id: number; username: string; role: string };

export async function getStoredAuth(): Promise<{ token: string; user: StoredUser } | null> {
  try {
    const [token, userRaw] = await Promise.all([
      AsyncStorage.getItem(TOKEN_KEY),
      AsyncStorage.getItem(USER_KEY),
    ]);
    if (!token || !userRaw) return null;
    return { token, user: JSON.parse(userRaw) as StoredUser };
  } catch {
    return null;
  }
}

export async function setStoredAuth(token: string, user: StoredUser): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, token),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
    ]);
  } catch {
    // Storage can legitimately fail (private browsing, quota); the session just
    // won't persist across reloads, which is a degraded-but-safe outcome.
  }
}

export async function clearStoredAuth(): Promise<void> {
  try {
    await Promise.all([AsyncStorage.removeItem(TOKEN_KEY), AsyncStorage.removeItem(USER_KEY)]);
  } catch {
    // Ignore — nothing meaningful to recover from here.
  }
}
