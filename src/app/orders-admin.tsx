// src/app/orders-admin.tsx — Admin Order Management
// GET /api/orders returns every order (with the buyer's username) when the
// caller's role is admin — enforced server-side, not just by which screen is
// shown. Status changes go through PATCH /api/orders/:id/status, which is
// admin-only on the backend too (requireRole('admin')) — a "user" JWT hitting
// that endpoint gets a 403 no matter what the frontend does.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { RequireAdmin } from '@/components/role-guard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useToast } from '@/context/toast-context';
import { ApiError, formatBaht, ordersApi, ORDER_STATUSES, type Order } from '@/lib/api';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const CANCEL_STATUS = 'ยกเลิก';

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function OrdersAdminScreenContent() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // Cancelling an order requires a reason (shown to the buyer), so clicking
  // the "ยกเลิก" chip opens this modal instead of firing the update right
  // away. Every other status chip stays a single click, same as before.
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await ordersApi.list();
      setOrders(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load orders');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await load();
      setIsLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  const handleStatusChange = async (order: Order, status: string) => {
    if (status === order.status) return;
    // Cancelling needs a reason from the admin first — open the modal and
    // let handleConfirmCancel actually call the API once they type one.
    if (status === CANCEL_STATUS) {
      setCancelTarget(order);
      setCancelReason('');
      setCancelError(null);
      return;
    }
    setUpdatingId(order.order_id);
    try {
      const result = await ordersApi.updateStatus(order.order_id, status);
      setOrders((current) =>
        current.map((o) =>
          o.order_id === order.order_id ? { ...o, status, cancel_reason: result.cancel_reason } : o
        )
      );
      showToast(`Order #${order.order_id} → ${status}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to update status', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    const reason = cancelReason.trim();
    if (!reason) {
      setCancelError('กรุณาระบุเหตุผลที่ยกเลิกคำสั่งซื้อ');
      return;
    }
    setCancelSubmitting(true);
    setCancelError(null);
    setUpdatingId(cancelTarget.order_id);
    try {
      const result = await ordersApi.updateStatus(cancelTarget.order_id, CANCEL_STATUS, reason);
      setOrders((current) =>
        current.map((o) =>
          o.order_id === cancelTarget.order_id
            ? { ...o, status: CANCEL_STATUS, cancel_reason: result.cancel_reason }
            : o
        )
      );
      showToast(`Order #${cancelTarget.order_id} → ${CANCEL_STATUS}`);
      setCancelTarget(null);
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : 'ยกเลิกคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setCancelSubmitting(false);
      setUpdatingId(null);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
            ORDER MANAGEMENT
          </ThemedText>
          <ThemedText type="title" style={styles.pageTitle}>
            Orders
          </ThemedText>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" style={styles.loading} />
        ) : error ? (
          <ThemedView type="cardBackground" style={styles.errorBanner}>
            <ThemedText themeColor="danger">{error}</ThemedText>
          </ThemedView>
        ) : orders.length === 0 ? (
          <EmptyState title="No orders yet" hint="Orders placed by shoppers will show up here" />
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}>
            {orders.map((order) => (
              <ThemedView key={order.order_id} type="cardBackground" style={[styles.card, { borderColor: theme.border }]}>
                <View style={styles.cardHeader}>
                  <View>
                    <ThemedText type="defaultSemiBold">
                      Order #{order.order_id} · {order.username}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatDate(order.order_date)}
                    </ThemedText>
                  </View>
                  <OrderStatusBadge status={order.status} />
                </View>

                {order.status === CANCEL_STATUS && order.cancel_reason ? (
                  <View style={[styles.cancelReasonBox, { borderColor: '#D33A3F55' }]}>
                    <ThemedText type="small" themeColor="danger">
                      เหตุผลที่ยกเลิก: {order.cancel_reason}
                    </ThemedText>
                  </View>
                ) : null}

                <View style={[styles.itemsBox, { borderTopColor: theme.border }]}>
                  {order.items.map((item) => (
                    <View key={item.product_id} style={styles.itemRow}>
                      <ThemedText type="small" style={styles.itemName} numberOfLines={1}>
                        {item.name} × {item.quantity}
                      </ThemedText>
                      <ThemedText type="small">{formatBaht(item.subtotal)}</ThemedText>
                    </View>
                  ))}
                </View>

                <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
                  <ThemedText type="smallBold">Total</ThemedText>
                  <ThemedText type="defaultSemiBold">{formatBaht(order.total_amount)}</ThemedText>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusRow}>
                  {ORDER_STATUSES.map((status) => {
                    const isActive = order.status === status;
                    const isBusy = updatingId === order.order_id;
                    return (
                      <Pressable
                        key={status}
                        disabled={isBusy}
                        onPress={() => handleStatusChange(order, status)}
                        style={[
                          styles.statusChip,
                          {
                            backgroundColor: isActive ? theme.text : theme.backgroundElement,
                            opacity: isBusy && !isActive ? 0.5 : 1,
                          },
                        ]}>
                        <ThemedText type="small" style={{ color: isActive ? theme.background : theme.textSecondary, fontWeight: '700' }}>
                          {status}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </ThemedView>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>

      <Modal visible={cancelTarget !== null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <ThemedView type="cardBackground" style={styles.modalCard}>
            <ThemedText type="subtitle">ยกเลิกคำสั่งซื้อ #{cancelTarget?.order_id}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              กรุณาระบุเหตุผล — ข้อความนี้จะแสดงให้ลูกค้าเห็นในหน้าคำสั่งซื้อของเขา
            </ThemedText>
            <TextInput
              value={cancelReason}
              onChangeText={(text) => {
                setCancelReason(text);
                if (cancelError) setCancelError(null);
              }}
              placeholder="เช่น สินค้าหมดสต๊อกกะทันหัน"
              placeholderTextColor={theme.textSecondary}
              multiline
              numberOfLines={3}
              style={[styles.reasonInput, { borderColor: theme.border, color: theme.text }]}
              editable={!cancelSubmitting}
            />
            {cancelError && (
              <ThemedText type="small" themeColor="danger">
                {cancelError}
              </ThemedText>
            )}
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: theme.backgroundElement }]}
                disabled={cancelSubmitting}
                onPress={() => {
                  setCancelTarget(null);
                  setCancelError(null);
                }}>
                <ThemedText type="smallBold">ย้อนกลับ</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.modalButton, { backgroundColor: theme.primary }, cancelSubmitting && styles.checkoutButtonDisabled]}
                disabled={cancelSubmitting}
                onPress={handleConfirmCancel}>
                {cancelSubmitting ? (
                  <ActivityIndicator color={theme.primaryText} />
                ) : (
                  <ThemedText type="smallBold" themeColor="primaryText">
                    ยืนยันยกเลิก
                  </ThemedText>
                )}
              </Pressable>
            </View>
          </ThemedView>
        </View>
      </Modal>
    </ThemedView>
  );
}

export default function OrdersAdminScreen() {
  return (
    <RequireAdmin>
      <OrdersAdminScreenContent />
    </RequireAdmin>
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
  eyebrow: {
    letterSpacing: 1.5,
    fontWeight: '700',
    marginBottom: 2,
    marginTop: Spacing.three,
  },
  pageTitle: {
    fontSize: 30,
    lineHeight: 34,
  },
  loading: {
    marginTop: Spacing.six,
  },
  errorBanner: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#D33A3F55',
  },
  listContent: {
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  card: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cancelReasonBox: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    padding: Spacing.two,
  },
  itemsBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    gap: Spacing.half,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  itemName: {
    flex: 1,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  statusRow: {
    gap: Spacing.one,
    paddingTop: Spacing.one,
  },
  statusChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.four,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Spacing.four,
    padding: Spacing.five,
    gap: Spacing.two,
  },
  reasonInput: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  modalButton: {
    flex: 1,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutButtonDisabled: {
    opacity: 0.7,
  },
});
