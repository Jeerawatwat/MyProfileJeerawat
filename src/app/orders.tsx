// src/app/orders.tsx — "คำสั่งซื้อของฉัน" (My Orders)
// GET /api/orders is scoped server-side to the logged-in user's own rows when
// the role is "user" (see backend/routes/orders.routes.js) — this screen never
// filters client-side, and a user account can never see anyone else's orders
// even if they tried to guess an order id (GET /api/orders/:id 404s for that).
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { RequireUser } from '@/components/role-guard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ApiError, formatBaht, ordersApi, type Order } from '@/lib/api';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function OrdersScreenContent() {
  const theme = useTheme();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
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
                  <OrderStatusBadge status={order.status} />
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

                <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
                  <ThemedText type="smallBold">ยอดรวม</ThemedText>
                  <ThemedText type="defaultSemiBold">{formatBaht(order.total_amount)}</ThemedText>
                </View>
              </ThemedView>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
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
