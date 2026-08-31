// src/app/cart.tsx — Shopping Cart + Checkout
// Quantities are validated against the live stock captured when the item was
// added; the real, authoritative check happens again on the server inside the
// checkout transaction (see backend/routes/orders.routes.js) — this screen's
// own clamping is just fast feedback, never the actual guarantee.
// Checkout creates a real Order + Order_Details row set in MySQL and decrements
// Inventory.stock — nothing here is faked or mocked.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { EmptyState } from '@/components/empty-state';
import { RequireUser } from '@/components/role-guard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useCart } from '@/context/cart-context';
import { useToast } from '@/context/toast-context';
import { ApiError, formatBaht, ordersApi, resolveImageUrl } from '@/lib/api';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function CartScreenContent() {
  const theme = useTheme();
  const router = useRouter();
  const { items, totalAmount, setQuantity, removeItem, clear } = useCart();
  const { showToast } = useToast();

  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [successOrderId, setSuccessOrderId] = useState<number | null>(null);

  const handleQuantityChange = (productId: number, next: number) => {
    const result = setQuantity(productId, next);
    if (!result.ok) showToast(result.message ?? 'ไม่สามารถปรับจำนวนได้', 'error');
  };

  const handleCheckout = async () => {
    if (items.length === 0) return;
    setCheckoutError(null);
    setIsCheckingOut(true);
    try {
      const result = await ordersApi.create({
        items: items.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
      });
      clear();
      setSuccessOrderId(result.order_id);
    } catch (err) {
      setCheckoutError(err instanceof ApiError ? err.message : 'สั่งซื้อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="title" style={styles.title}>
          ตะกร้าสินค้า
        </ThemedText>

        {items.length === 0 ? (
          <EmptyState title="ตะกร้าของคุณว่างเปล่า" hint="เลือกซื้อสินค้าจากหน้าร้านค้าได้เลย" />
        ) : (
          // Everything — item rows, error banner, total, and the checkout
          // button — lives inside ONE scroll view now. Previously the
          // summary/checkout card sat as a fixed sibling below the list; on
          // web the floating bottom tab bar (position: absolute) rendered on
          // top of it, hiding the checkout button entirely. Putting it inside
          // the scrollable content — with generous bottom padding — guarantees
          // it can always be scrolled into view above the tab bar.
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.itemsList}>
              {items.map(({ product, quantity }) => {
                const photoUrl = resolveImageUrl(product.image_url);
                const subtotal = product.price * quantity;
                return (
                  <ThemedView key={product.id} type="cardBackground" style={[styles.row, { borderColor: theme.border }]}>
                    <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
                      {photoUrl ? (
                        <Image source={{ uri: photoUrl }} style={styles.thumbImage} contentFit="cover" />
                      ) : (
                        <ThemedText type="small" themeColor="textSecondary">
                          {product.name.slice(0, 1).toUpperCase()}
                        </ThemedText>
                      )}
                    </View>

                    <View style={styles.rowInfo}>
                      <ThemedText type="defaultSemiBold" numberOfLines={2}>
                        {product.name}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatBaht(product.price)} / ชิ้น · เหลือ {product.stock} ชิ้น
                      </ThemedText>

                      <View style={styles.rowFooter}>
                        <View style={styles.stepper}>
                          <Pressable
                            onPress={() => handleQuantityChange(product.id, quantity - 1)}
                            style={[styles.stepButton, { backgroundColor: theme.backgroundElement }]}>
                            <ThemedText type="defaultSemiBold">−</ThemedText>
                          </Pressable>
                          <ThemedText type="defaultSemiBold" style={styles.stepValue}>
                            {quantity}
                          </ThemedText>
                          <Pressable
                            onPress={() => handleQuantityChange(product.id, quantity + 1)}
                            style={[styles.stepButton, { backgroundColor: theme.backgroundElement }]}>
                            <ThemedText type="defaultSemiBold">+</ThemedText>
                          </Pressable>
                        </View>
                        <ThemedText type="smallBold">{formatBaht(subtotal)}</ThemedText>
                      </View>
                    </View>

                    <Pressable onPress={() => removeItem(product.id)} hitSlop={8} style={styles.removeButton}>
                      <ThemedText type="small" themeColor="danger">
                        ลบ
                      </ThemedText>
                    </Pressable>
                  </ThemedView>
                );
              })}
            </View>

            {checkoutError && (
              <ThemedView type="cardBackground" style={styles.errorBanner}>
                <ThemedText type="small" themeColor="danger">
                  {checkoutError}
                </ThemedText>
              </ThemedView>
            )}

            <ThemedView type="cardBackground" style={[styles.summary, { borderColor: theme.border }]}>
              <View style={styles.summaryRow}>
                <ThemedText type="defaultSemiBold">ยอดรวม</ThemedText>
                <ThemedText type="title" style={styles.totalValue}>
                  {formatBaht(totalAmount)}
                </ThemedText>
              </View>
              <Pressable
                style={[styles.checkoutButton, { backgroundColor: theme.primary }, isCheckingOut && styles.checkoutButtonDisabled]}
                onPress={handleCheckout}
                disabled={isCheckingOut}>
                {isCheckingOut ? (
                  <ActivityIndicator color={theme.primaryText} />
                ) : (
                  <ThemedText type="smallBold" themeColor="primaryText">
                    ดำเนินการสั่งซื้อ
                  </ThemedText>
                )}
              </Pressable>
            </ThemedView>
          </ScrollView>
        )}
      </SafeAreaView>

      <Modal visible={successOrderId !== null} transparent animationType="fade">
        <View style={styles.successBackdrop}>
          <ThemedView type="cardBackground" style={styles.successCard}>
            <ThemedText style={styles.successIcon}>🎉</ThemedText>
            <ThemedText type="subtitle" style={styles.successTitle}>
              สั่งซื้อสำเร็จ!
            </ThemedText>
            <ThemedText themeColor="textSecondary">Order ID: #{successOrderId}</ThemedText>
            <Pressable
              style={[styles.button, { backgroundColor: theme.primary }]}
              onPress={() => {
                setSuccessOrderId(null);
                router.push('/orders');
              }}>
              <ThemedText type="smallBold" themeColor="primaryText">
                ดูคำสั่งซื้อ
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.button, { backgroundColor: theme.backgroundElement }]}
              onPress={() => {
                setSuccessOrderId(null);
                router.push('/shop');
              }}>
              <ThemedText type="smallBold">เลือกซื้อสินค้าต่อ</ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>
    </ThemedView>
  );
}

export default function CartScreen() {
  return (
    <RequireUser>
      <CartScreenContent />
    </RequireUser>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  title: {
    marginTop: Spacing.three,
  },
  scrollContent: {
    gap: Spacing.three,
    // Generous clearance so the checkout button can always be scrolled above
    // the floating bottom tab bar (position: absolute on web) instead of
    // ending up hidden underneath it.
    paddingBottom: BottomTabInset + Spacing.six + 48,
  },
  itemsList: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.two,
    alignItems: 'flex-start',
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.one,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    minWidth: 20,
    textAlign: 'center',
  },
  removeButton: {
    padding: Spacing.one,
  },
  errorBanner: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#D33A3F55',
  },
  summary: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalValue: {
    fontSize: 22,
  },
  checkoutButton: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutButtonDisabled: {
    opacity: 0.7,
  },
  successBackdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  successCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Spacing.four,
    padding: Spacing.five,
    alignItems: 'center',
    gap: Spacing.two,
  },
  successIcon: {
    fontSize: 48,
  },
  successTitle: {
    marginTop: Spacing.one,
  },
  button: {
    width: '100%',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
});
