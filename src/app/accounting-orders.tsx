// src/app/accounting-orders.tsx — Accounting: Orders (READ-ONLY)
// Every order with its money breakdown, for checking against payments. There
// is deliberately no control here that changes an order: the backend's only
// order-mutating route (PATCH /api/orders/:id/status) is admin-only, so an
// accounting JWT gets a 403 there regardless of this screen.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterChips, MoneyRow, PageHeader, accountingStyles as s } from '@/components/accounting-ui';
import { EmptyState } from '@/components/empty-state';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { PaymentStatusBadge } from '@/components/payment-status-badge';
import { RequireAccounting } from '@/components/role-guard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, formatBaht, ordersApi, PAYMENT_STATUS_LABELS, type Order } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

type Filter = 'ALL' | keyof typeof PAYMENT_STATUS_LABELS;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'ทั้งหมด' },
  ...Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

function AccountingOrdersContent() {
  const theme = useTheme();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrders(await ordersApi.list());
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

  const visible = useMemo(
    () => (filter === 'ALL' ? orders : orders.filter((o) => o.payment_status === filter)),
    [orders, filter]
  );

  return (
    <ThemedView style={s.container}>
      <SafeAreaView style={s.safeArea} edges={['top']}>
        <PageHeader eyebrow="ACCOUNTING · READ ONLY" title="ออเดอร์" />
        <FilterChips options={FILTERS} value={filter} onChange={setFilter} />

        {isLoading ? (
          <ActivityIndicator size="large" style={s.loading} />
        ) : error ? (
          <ThemedView type="cardBackground" style={s.errorBanner}>
            <ThemedText themeColor="danger">{error}</ThemedText>
          </ThemedView>
        ) : visible.length === 0 ? (
          <EmptyState title="ไม่มีคำสั่งซื้อ" hint="ยังไม่มีคำสั่งซื้อในสถานะนี้" />
        ) : (
          <ScrollView
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={async () => {
                  setIsRefreshing(true);
                  await load();
                  setIsRefreshing(false);
                }}
              />
            }>
            {visible.map((order) => (
              <ThemedView key={order.order_id} type="cardBackground" style={[s.card, { borderColor: theme.border }]}>
                <View style={s.cardHeader}>
                  <View style={styles.flex}>
                    <ThemedText type="defaultSemiBold">
                      Order #{order.order_id} · {order.username}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatDateTime(order.order_date)}
                    </ThemedText>
                  </View>
                  <View style={s.badges}>
                    <OrderStatusBadge status={order.status} />
                    <PaymentStatusBadge status={order.payment_status} />
                  </View>
                </View>

                <View style={[s.divided, { borderTopColor: theme.border }]}>
                  {order.items.map((item) => (
                    <View key={item.product_id} style={styles.itemRow}>
                      <ThemedText type="small" style={styles.flex} numberOfLines={2}>
                        {item.name}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.qty}>
                        {item.quantity} × {formatBaht(item.price)}
                      </ThemedText>
                      <ThemedText type="small" style={styles.amount}>
                        {formatBaht(item.subtotal)}
                      </ThemedText>
                    </View>
                  ))}
                </View>

                <View style={[s.divided, { borderTopColor: theme.border }]}>
                  <MoneyRow label="ราคาสินค้า" value={formatBaht(order.product_amount)} />
                  <MoneyRow label="ค่าส่ง" value={formatBaht(order.shipping_fee)} />
                  <MoneyRow label="ส่วนลด" value={order.discount > 0 ? `-${formatBaht(order.discount)}` : formatBaht(0)} />
                  <MoneyRow label="ยอดรวม" value={formatBaht(order.total_amount)} bold />
                </View>

                {order.payment?.receipt_no ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    ใบเสร็จ {order.payment.receipt_no}
                  </ThemedText>
                ) : null}
              </ThemedView>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

export default function AccountingOrdersScreen() {
  return (
    <RequireAccounting>
      <AccountingOrdersContent />
    </RequireAccounting>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  flex: {
    flex: 1,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  qty: {
    minWidth: 80,
    textAlign: 'right',
  },
  amount: {
    minWidth: 70,
    textAlign: 'right',
  },
});
