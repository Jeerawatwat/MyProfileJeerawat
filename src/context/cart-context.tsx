// src/context/cart-context.tsx
// Shopping cart for the User side. Kept client-side in AsyncStorage — per the
// project's own "Cart -> Database/Session as appropriate" note, this fits a
// session/local concept, not a full DB entity: the cart is just a draft, and
// the only thing that ever becomes real, durable data is the Order created at
// checkout (Orders + Order_Details in MySQL, via /api/orders). Stock itself is
// re-verified against the live database on every add/quantity-change AND
// again, authoritatively, on the server inside the checkout transaction — the
// cart never trusts a stale stock number for longer than it has to.
//
// The cart is keyed per logged-in user id (cart_<userId>) so two different
// accounts signing in on the same device/browser never see each other's cart.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from './auth-context';
import type { Product } from '@/lib/api';

export type CartItem = {
  product: Product;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  totalItems: number;
  totalAmount: number;
  isReady: boolean;
  addItem: (product: Product, quantity?: number) => { ok: boolean; message?: string };
  setQuantity: (productId: number, quantity: number) => { ok: boolean; message?: string };
  removeItem: (productId: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | undefined>(undefined);

function cartKey(userId: number) {
  return `shop_cart_${userId}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isReady, setIsReady] = useState(false);

  // Load (or reset) the cart whenever the logged-in user changes.
  useEffect(() => {
    let cancelled = false;
    setIsReady(false);
    if (!user) {
      setItems([]);
      setIsReady(true);
      return;
    }
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(cartKey(user.id));
        if (!cancelled) setItems(raw ? (JSON.parse(raw) as CartItem[]) : []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Persist on every change (once the initial load has finished, so we never
  // overwrite a saved cart with an empty one before it's actually loaded).
  useEffect(() => {
    if (!user || !isReady) return;
    AsyncStorage.setItem(cartKey(user.id), JSON.stringify(items)).catch(() => {
      // Best-effort — a storage failure just means the cart won't survive a reload.
    });
  }, [items, user, isReady]);

  const addItem = useCallback((product: Product, quantity = 1) => {
    let outcome: { ok: boolean; message?: string } = { ok: true };
    setItems((current) => {
      const existing = current.find((i) => i.product.id === product.id);
      const currentQty = existing?.quantity ?? 0;
      const desiredQty = currentQty + quantity;

      if (product.stock <= 0) {
        outcome = { ok: false, message: 'สินค้าหมด ไม่สามารถเพิ่มลงตะกร้าได้' };
        return current;
      }
      if (desiredQty > product.stock) {
        outcome = { ok: false, message: `มีสินค้าในสต๊อกเพียง ${product.stock} ชิ้น` };
        return current;
      }

      if (existing) {
        return current.map((i) => (i.product.id === product.id ? { ...i, quantity: desiredQty, product } : i));
      }
      return [...current, { product, quantity: desiredQty }];
    });
    return outcome;
  }, []);

  const setQuantity = useCallback((productId: number, quantity: number) => {
    let outcome: { ok: boolean; message?: string } = { ok: true };
    setItems((current) => {
      const existing = current.find((i) => i.product.id === productId);
      if (!existing) return current;

      if (quantity <= 0) {
        return current.filter((i) => i.product.id !== productId);
      }
      if (quantity > existing.product.stock) {
        outcome = { ok: false, message: `มีสินค้าในสต๊อกเพียง ${existing.product.stock} ชิ้น` };
        return current;
      }
      return current.map((i) => (i.product.id === productId ? { ...i, quantity } : i));
    });
    return outcome;
  }, []);

  const removeItem = useCallback((productId: number) => {
    setItems((current) => current.filter((i) => i.product.id !== productId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const totalItems = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);
  const totalAmount = useMemo(
    () => items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),
    [items]
  );

  const value = useMemo(
    () => ({ items, totalItems, totalAmount, isReady, addItem, setQuantity, removeItem, clear }),
    [items, totalItems, totalAmount, isReady, addItem, setQuantity, removeItem, clear]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
