// src/app/orders.tsx — "คำสั่งซื้อของฉัน" (My Orders)
// GET /api/orders is scoped server-side to the logged-in user's own rows when
// the role is "user" (see backend/routes/orders.routes.js) — this screen never
// filters client-side, and a user account can never see anyone else's orders
// even if they tried to guess an order id (GET /api/orders/:id 404s for that).
// Payment: each unpaid order has a "ชำระเงิน" button (QR + slip, see
// PaymentSheet). Opening /orders?pay=<id> — which the cart does right after
// checkout — opens that order's payment sheet straight away. Once accounting
// confirms the payment the receipt can be downloaded here, and a refund can
// be requested.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { PaymentSheet } from '@/components/payment-sheet';
import { PaymentStatusBadge, RefundStatusBadge } from '@/components/payment-status-badge';
import { RefundRequestSheet, refundableAmount } from '@/components/refund-request-sheet';
import { RequireUser } from '@/components/role-guard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useToast } from '@/context/toast-context';
import { ApiError, downloadAuthedFile, formatBaht, ordersApi, paymentsApi, type Order } from '@/lib/api';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

const PAYABLE = ['PENDING_PAYMENT', 'PAYMENT_REJECTED'];

function canPay(order: Order) {
  return order.status !== 'ยกเลิก' && PAYABLE.includes(order.payment_status);
}

function OrdersScreenContent() {
  const theme = useTheme();
  const router = useRouter();
  const { showToast } = useToast();
  const { pay } = useLocalSearchParams<{ pay?: string }>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<Order | null>(null);
  const [refundTarget, setRefundTarget] = useState<Order | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await ordersApi.list();
      setOrders(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดคำสั่งซื้อไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await load();
      setIsLoading(false);
    })();
  }, [load]);

  // /orders?pay=<id> (from the cart's post-checkout "ชำระเงินเลย" button)
  // opens that order's payment sheet once the list has loaded, then clears
  // the param so a later refresh doesn't reopen it.
  useEffect(() => {
    if (!pay || isLoading) return;
    const target = orders.find((o) => o.order_id === Number(pay));
    if (target && canPay(target)) setPayTarget(target);
    router.setParams({ pay: undefined });
  }, [pay, isLoading, orders, router]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  const downloadReceipt = async (order: Order) => {
    if (!order.payment) return;
    setDownloadingId(order.order_id);
    try {
      await downloadAuthedFile(
        paymentsApi.receiptPath(order.payment.payment_id),
        `receipt-${order.payment.receipt_no ?? order.order_id}.pdf`
      );
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'ดาวน์โหลดใบเสร็จไม่สำเร็จ', 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="title" style={styles.title}>
          คำสั่งซื้อของฉัน
        </ThemedText>

        {isLoading ? (
          <ActivityIndicator size="large" style={styles.loading} />
        ) : error ? (
          <ThemedView type="cardBackground" style={styles.errorBanner}>
            <ThemedText themeColor="danger">{error}</ThemedText>
          </ThemedView>
        ) : orders.length === 0 ? (
          <EmptyState title="ยังไม่มีคำสั่งซื้อ" hint="เมื่อคุณสั่งซื้อสินค้า รายการจะแสดงที่นี่" />
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}>
            {orders.map((order) => (
              <ThemedView key={order.order_id} type="cardBackground" style={[styles.card, { borderColor: theme.border }]}>
                <View style={styles.cardHeader}>
                  <View>
                    <ThemedText type="defaultSemiBold">Order #{order.order_id}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatDate(order.order_date)}
                    </ThemedText>
                  </View>
                  <View style={styles.badges}>
                    <OrderStatusBadge status={order.status} />
                    <PaymentStatusBadge status={order.payment_status} />
                  </View>
                </View>

                {order.status === 'ยกเลิก' && order.cancel_reason ? (
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

                {order.shipping_fee > 0 || order.discount > 0 ? (
                  <View style={styles.itemsBox}>
                    <View style={styles.itemRow}>
                      <ThemedText type="small" themeColor="textSecondary">
                        ค่าส่ง
                      </ThemedText>
                      <ThemedText type="small">{formatBaht(order.shipping_fee)}</ThemedText>
                    </View>
                    <View style={styles.itemRow}>
                      <ThemedText type="small" themeColor="textSecondary">
                        ส่วนลด
                      </ThemedText>
                      <ThemedText type="small">-{formatBaht(order.discount)}</ThemedText>
                    </View>
                  </View>
                ) : null}

                <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
                  <ThemedText type="smallBold">ยอดรวม</ThemedText>
                  <ThemedText type="defaultSemiBold">{formatBaht(order.total_amount)}</ThemedText>
                </View>

                {order.payment_status === 'PAYMENT_REJECTED' && order.payment?.rejected_reason ? (
                  <View style={[styles.cancelReasonBox, { borderColor: '#D33A3F55' }]}>
                    <ThemedText type="small" themeColor="danger">
                      การชำระเงินถูกปฏิเสธ: {order.payment.rejected_reason}
                    </ThemedText>
                  </View>
                ) : null}

                {order.payment_status === 'PAID_PENDING_VERIFICATION' ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    ส่งสลิปแล้ว — รอฝ่ายบัญชีตรวจสอบการชำระเงิน
                  </ThemedText>
                ) : null}

                {order.refunds.length > 0 ? (
                  <View style={[styles.itemsBox, { borderTopColor: theme.border }]}>
                    {order.refunds.map((r) => (
                      <View key={r.refund_id} style={styles.refundRow}>
                        <View style={styles.itemRow}>
                          <ThemedText type="small">คำขอคืนเงิน {formatBaht(r.refund_amount)}</ThemedText>
                          <RefundStatusBadge status={r.status} />
                        </View>
                        {r.status === 'REFUND_REJECTED' && r.rejected_reason ? (
                          <ThemedText type="small" themeColor="danger">
                            เหตุผล: {r.rejected_reason}
                          </ThemedText>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.actions}>
                  {canPay(order) ? (
                    <Pressable
                      style={[styles.actionButton, { backgroundColor: theme.primary }]}
                      onPress={() => setPayTarget(order)}>
                      <ThemedText type="smallBold" themeColor="primaryText">
                        {order.payment_status === 'PAYMENT_REJECTED' ? 'ส่งสลิปใหม่' : 'ชำระเงิน'}
                      </ThemedText>
                    </Pressable>
                  ) : null}
                  {order.payment?.payment_status === 'PAID' ? (
                    <Pressable
                      style={[styles.actionButton, { backgroundColor: theme.backgroundElement }]}
                      disabled={downloadingId === order.order_id}
                      onPress={() => downloadReceipt(order)}>
                      {downloadingId === order.order_id ? (
                        <ActivityIndicator />
                      ) : (
                        <ThemedText type="smallBold">ดาวน์โหลดใบเสร็จ</ThemedText>
                      )}
                    </Pressable>
                  ) : null}
                  {refundableAmount(order) > 0 ? (
                    <Pressable
                      style={[styles.actionButton, { backgroundColor: theme.backgroundElement }]}
                      onPress={() => setRefundTarget(order)}>
                      <ThemedText type="smallBold">ขอคืนเงิน</ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              </ThemedView>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>

      <PaymentSheet
        order={payTarget}
        onClose={() => setPayTarget(null)}
        onSubmitted={() => {
          setPayTarget(null);
          showToast('ส่งหลักฐานการชำระเงินแล้ว รอฝ่ายบัญชีตรวจสอบ');
          load();
        }}
      />
      <RefundRequestSheet
        order={refundTarget}
        onClose={() => setRefundTarget(null)}
        onSubmitted={() => {
          setRefundTarget(null);
          showToast('ส่งคำขอคืนเงินแล้ว รอฝ่ายบัญชีพิจารณา');
          load();
        }}
      />
    </ThemedView>
  );
}

export default function OrdersScreen() {
  return (
    <RequireUser>
      <OrdersScreenContent />
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
  badges: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  refundRow: {
    gap: 2,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  actionButton: {
    flexGrow: 1,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
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
});
