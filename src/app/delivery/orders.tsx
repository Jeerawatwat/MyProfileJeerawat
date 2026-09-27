import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { RequireDelivery } from '@/components/role-guard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useToast } from '@/context/toast-context';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, deliveryApi, formatBaht, type DeliveryOrder } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

type FilterTab = 'all' | 'preparing' | 'shipping' | 'completed';

const FILTER_TABS: Array<{ key: FilterTab; label: string }> = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'preparing', label: 'รอจัดเตรียม/รอส่ง' },
  { key: 'shipping', label: 'กำลังจัดส่ง' },
  { key: 'completed', label: 'สำเร็จ' },
];

function DeliveryOrdersContent() {
  const theme = useTheme();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadOrders = useCallback(async () => {
    setError(null);
    try {
      const data = await deliveryApi.orders();
      setOrders(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ไม่สามารถโหลดรายการจัดส่งได้');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await loadOrders();
      setIsLoading(false);
    })();
  }, [loadOrders]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadOrders();
    setIsRefreshing(false);
  };

  const handleUpdateStatus = async (orderId: number, nextStatus: string) => {
    setUpdatingId(orderId);
    try {
      await deliveryApi.updateStatus(orderId, nextStatus);
      showToast(`อัปเดตคำสั่งซื้อ #${orderId} เป็น "${nextStatus}" สำเร็จ`);
      await loadOrders();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'อัปเดตสถานะไม่สำเร็จ', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Filter by tab
      if (activeTab === 'preparing') {
        if (order.status !== 'รอดำเนินการ' && order.status !== 'กำลังจัดเตรียมสินค้า') return false;
      } else if (activeTab === 'shipping') {
        if (order.status !== 'จัดส่งแล้ว') return false;
      } else if (activeTab === 'completed') {
        if (order.status !== 'สำเร็จ') return false;
      }

      // Filter by search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = String(order.order_id).includes(q);
        const matchesUser = (order.username || '').toLowerCase().includes(q);
        if (!matchesId && !matchesUser) return false;
      }

      return true;
    });
  }, [orders, activeTab, searchQuery]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        >
          {/* Header */}
          <View style={styles.header}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
              DELIVERY ORDERS
            </ThemedText>
            <ThemedText type="subtitle">รายการจัดส่งสินค้า</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              ตรวจสอบที่อยู่ อัปเดตสถานะการขนส่ง และยืนยันการจัดส่ง
            </ThemedText>
          </View>

          {/* Search bar */}
          <View style={[styles.searchBox, { borderColor: theme.border }]}>
            <ThemedText style={styles.searchIcon}>🔍</ThemedText>
            <TextInput
              placeholder="ค้นหาตามเลขออเดอร์ หรือชื่อลูกค้า..."
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={[styles.searchInput, { color: theme.text }]}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>

          {/* Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
            {FILTER_TABS.map((tab) => {
              const isSelected = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={[
                    styles.tabChip,
                    {
                      backgroundColor: isSelected ? theme.primary : theme.backgroundElement,
                      borderColor: isSelected ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <ThemedText
                    type="smallBold"
                    style={{ color: isSelected ? '#FFFFFF' : theme.textSecondary }}
                  >
                    {tab.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Content */}
          {isLoading ? (
            <ActivityIndicator size="large" style={styles.loading} />
          ) : error ? (
            <ThemedView type="cardBackground" style={styles.errorBanner}>
              <ThemedText themeColor="danger">{error}</ThemedText>
            </ThemedView>
          ) : filteredOrders.length === 0 ? (
            <EmptyState
              title="ไม่พบคำสั่งซื้อ"
              hint="ไม่มีคำสั่งซื้อที่ตรงกับเงื่อนไขการค้นหาของคุณ"
            />
          ) : (
            <View style={styles.orderList}>
              {filteredOrders.map((order) => {
                const isUpdating = updatingId === order.order_id;
                const isPaid = order.payment_status === 'PAID';

                return (
                  <ThemedView
                    key={order.order_id}
                    type="cardBackground"
                    style={[styles.orderCard, { borderColor: theme.border }]}
                  >
                    {/* Header: ID + Status */}
                    <View style={styles.orderHeader}>
                      <View>
                        <ThemedText type="subtitle">คำสั่งซื้อ #{order.order_id}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          วันที่สั่ง: {formatDateTime(order.order_date)}
                        </ThemedText>
                      </View>
                      <OrderStatusBadge status={order.status} />
                    </View>

                    {/* Customer & Payment Info */}
                    <View style={[styles.infoBlock, { backgroundColor: theme.backgroundElement }]}>
                      <View style={styles.infoRow}>
                        <ThemedText type="small" themeColor="textSecondary">
                          ลูกค้า:
                        </ThemedText>
                        <ThemedText type="smallBold">{order.username}</ThemedText>
                      </View>
                      <View style={styles.infoRow}>
                        <ThemedText type="small" themeColor="textSecondary">
                          สถานะชำระเงิน:
                        </ThemedText>
                        <ThemedText
                          type="smallBold"
                          style={{ color: isPaid ? '#10B981' : '#F59E0B' }}
                        >
                          {isPaid ? '✓ ชำระเงินเรียบร้อย' : '⏳ รอตรวจสอบการชำระเงิน'}
                        </ThemedText>
                      </View>
                    </View>

                    {/* Items List */}
                    {order.items && order.items.length > 0 && (
                      <View style={styles.itemsSection}>
                        <ThemedText type="smallBold" themeColor="textSecondary">
                          รายการสินค้า ({order.items.length} รายการ):
                        </ThemedText>
                        {order.items.map((item, idx) => (
                          <View key={idx} style={styles.itemRow}>
                            <ThemedText type="small" style={styles.itemName}>
                              • {item.name} × {item.quantity}
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {formatBaht(item.subtotal)}
                            </ThemedText>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Pricing summary */}
                    <View style={styles.summaryRow}>
                      <View>
                        {order.shipping_fee ? (
                          <ThemedText type="small" themeColor="textSecondary">
                            ค่าจัดส่ง: {formatBaht(order.shipping_fee)}
                          </ThemedText>
                        ) : null}
                      </View>
                      <View style={styles.totalRow}>
                        <ThemedText type="small" themeColor="textSecondary">
                          ยอดรวม:
                        </ThemedText>
                        <ThemedText type="subtitle" themeColor="primary">
                          {formatBaht(order.total_amount)}
                        </ThemedText>
                      </View>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.actionsContainer}>
                      {(order.status === 'รอดำเนินการ' || order.status === 'กำลังจัดเตรียมสินค้า') && (
                        <Pressable
                          style={[
                            styles.btnAction,
                            { backgroundColor: isPaid ? '#2563EB' : '#9CA3AF' },
                            isUpdating && styles.btnDisabled,
                          ]}
                          disabled={!isPaid || isUpdating}
                          onPress={() => handleUpdateStatus(order.order_id, 'จัดส่งแล้ว')}
                        >
                          {isUpdating ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
                              🚚 เริ่มจัดส่งสินค้า (เปลี่ยนเป็น "จัดส่งแล้ว")
                            </ThemedText>
                          )}
                        </Pressable>
                      )}

                      {order.status === 'จัดส่งแล้ว' && (
                        <Pressable
                          style={[
                            styles.btnAction,
                            { backgroundColor: '#059669' },
                            isUpdating && styles.btnDisabled,
                          ]}
                          disabled={isUpdating}
                          onPress={() => handleUpdateStatus(order.order_id, 'สำเร็จ')}
                        >
                          {isUpdating ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
                              ✅ ยืนยันจัดส่งสำเร็จ (เปลี่ยนเป็น "สำเร็จ")
                            </ThemedText>
                          )}
                        </Pressable>
                      )}

                      {order.status === 'สำเร็จ' && (
                        <ThemedView
                          type="backgroundElement"
                          style={styles.completedBadge}
                        >
                          <ThemedText type="smallBold" style={{ color: '#059669' }}>
                            ✓ คำสั่งซื้อนี้จัดส่งเสร็จสิ้นแล้ว
                          </ThemedText>
                        </ThemedView>
                      )}
                    </View>
                  </ThemedView>
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

export default function DeliveryOrdersScreen() {
  return (
    <RequireDelivery>
      <DeliveryOrdersContent />
    </RequireDelivery>
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
  },
  scrollContent: {
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  header: {
    marginTop: Spacing.two,
    gap: Spacing.half,
  },
  eyebrow: {
    letterSpacing: 1,
    fontSize: 12,
  },
  loading: {
    marginTop: Spacing.six,
  },
  errorBanner: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  searchIcon: {
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingVertical: Spacing.half,
  },
  tabChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
  },
  orderList: {
    gap: Spacing.three,
  },
  orderCard: {
    padding: Spacing.four,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  infoBlock: {
    padding: Spacing.two,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemsSection: {
    gap: Spacing.one,
    paddingTop: Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#00000010',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    flex: 1,
    marginRight: Spacing.two,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#00000010',
    paddingTop: Spacing.two,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  actionsContainer: {
    paddingTop: Spacing.one,
  },
  btnAction: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  completedBadge: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
});