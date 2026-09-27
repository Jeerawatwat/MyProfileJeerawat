// src/app/manager/reports.tsx
// Comprehensive Manager Reports Screen with rich analytical breakdowns and
// dedicated multi-section Excel (.CSV) export.
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RequireManager } from '@/components/role-guard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useToast } from '@/context/toast-context';
import { useTheme } from '@/hooks/use-theme';
import {
  ApiError,
  formatBaht,
  managerApi,
  ordersApi,
  type ManagerDashboard,
  type Order,
} from '@/lib/api';
import { exportManagerReportToExcel } from '@/lib/manager-excel';

type ActiveTab = 'overview' | 'orders' | 'categories' | 'products';

function ManagerReportsContent() {
  const theme = useTheme();
  const router = useRouter();
  const { showToast } = useToast();

  const [data, setData] = useState<ManagerDashboard | null>(null);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [dash, orders] = await Promise.all([
        managerApi.dashboard('all'),
        ordersApi.list().catch(() => [] as Order[]),
      ]);
      setData(dash);
      setAllOrders(orders);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดข้อมูลรายงานไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await loadData();
      setIsLoading(false);
    })();
  }, [loadData]);

  const refresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  // Export full executive report
  const handleExportFull = () => {
    if (!data) {
      showToast('ไม่มีข้อมูลสำหรับส่งออก', 'error');
      return;
    }
    exportManagerReportToExcel(data, 'manager_executive_summary');
    showToast('Export รายงานสรุปผู้บริหาร Excel (.CSV) สำเร็จ');
  };

  // Export raw orders CSV
  const handleExportOrders = () => {
    if (allOrders.length === 0) {
      showToast('ไม่มีรายการออเดอร์สำหรับส่งออก', 'error');
      return;
    }
    const headers = ['รหัสคำสั่งซื้อ', 'วันเวลาที่สั่งซื้อ', 'ลูกค้า', 'ยอดรวม (บาท)', 'ค่าจัดส่ง', 'ส่วนลด', 'สถานะจัดส่ง', 'สถานะการชำระเงิน'];
    const rows = allOrders.map((o) => [
      o.order_id,
      `"${o.order_date}"`,
      `"${o.username || o.user_id}"`,
      o.total_amount,
      o.shipping_fee ?? 0,
      o.discount ?? 0,
      `"${o.status}"`,
      `"${o.payment_status === 'PAID' ? 'ชำระเงินแล้ว' : o.payment_status === 'PAID_PENDING_VERIFICATION' ? 'รอตรวจสอบสลิป' : 'รอชำระเงิน'}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `manager_orders_all_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Export รายการคำสั่งซื้อทั้งหมด สำเร็จ');
    }
  };

  // Filtered orders
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return allOrders;
    const q = searchQuery.toLowerCase().trim();
    return allOrders.filter(
      (o) =>
        String(o.order_id).includes(q) ||
        (o.username || '').toLowerCase().includes(q) ||
        (o.status || '').toLowerCase().includes(q) ||
        (o.payment_status || '').toLowerCase().includes(q)
    );
  }, [allOrders, searchQuery]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        >
          {/* Header Row */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Pressable onPress={() => router.push('/manager/dashboard')} style={styles.backLink}>
                <ThemedText type="smallBold" themeColor="primary">← กลับไปหน้าภาพรวม (Dashboard)</ThemedText>
              </Pressable>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
                EXECUTIVE ANALYTICS & REPORTS
              </ThemedText>
              <ThemedText type="subtitle">ศูนย์รายงานข้อมูลผู้บริหาร</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                วิเคราะห์เชิงลึก สรุปสถานะแผนก และส่งออกไฟล์รายงาน Excel ครบวงจร
              </ThemedText>
            </View>

            {/* Export Buttons Group */}
            <View style={styles.exportButtonGroup}>
              <Pressable style={styles.btnExportPrimary} onPress={handleExportFull}>
                <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
                  📥 Export สรุปผู้บริหาร (.CSV)
                </ThemedText>
              </Pressable>
              <Pressable style={styles.btnExportSecondary} onPress={handleExportOrders}>
                <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
                  📊 Export ออเดอร์ทั้งหมด (.CSV)
                </ThemedText>
              </Pressable>
            </View>
          </View>

          {/* Navigation Tabs */}
          <View style={styles.tabsRow}>
            {[
              { key: 'overview', label: '📊 สรุปผู้บริหาร' },
              { key: 'orders', label: `🧾 คำสั่งซื้อ (${allOrders.length})` },
              { key: 'categories', label: `📁 หมวดหมู่ (${data?.categories.length ?? 0})` },
              { key: 'products', label: `🏆 สินค้าขายดี (${data?.topProducts.length ?? 0})` },
            ].map((tab) => {
              const active = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  style={[
                    styles.tabButton,
                    active && { backgroundColor: theme.primary, borderColor: theme.primary },
                  ]}
                  onPress={() => setActiveTab(tab.key as ActiveTab)}
                >
                  <ThemedText
                    type="smallBold"
                    style={{ color: active ? '#FFFFFF' : theme.textSecondary }}
                  >
                    {tab.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {isLoading ? (
            <ActivityIndicator size="large" style={styles.loading} />
          ) : error ? (
            <ThemedView type="cardBackground" style={styles.errorBanner}>
              <ThemedText themeColor="danger">{error}</ThemedText>
            </ThemedView>
          ) : (
            <>
              {/* TAB 1: สรุปผู้บริหาร */}
              {activeTab === 'overview' && data && (
                <View style={{ gap: Spacing.two }}>
                  {/* Summary Cards */}
                  <View style={styles.kpiRow}>
                    <ThemedView type="cardBackground" style={[styles.kpiCard, { borderColor: theme.border }]}>
                      <ThemedText type="small" themeColor="textSecondary">ยอดขายรวมสะสม (Paid Revenue)</ThemedText>
                      <ThemedText type="subtitle" style={{ color: '#059669', fontSize: 22 }}>
                        {formatBaht(data.summary.totalRevenue)}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        เฉลี่ย {formatBaht(data.summary.avgOrderValue)} / ออเดอร์
                      </ThemedText>
                    </ThemedView>

                    <ThemedView type="cardBackground" style={[styles.kpiCard, { borderColor: theme.border }]}>
                      <ThemedText type="small" themeColor="textSecondary">คำสั่งซื้อทั้งหมด (Orders)</ThemedText>
                      <ThemedText type="subtitle" style={{ fontSize: 22 }}>
                        {data.summary.totalOrders} รายการ
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        ชำระแล้ว: {data.summary.paidOrdersCount} · อัตราสำเร็จ {data.summary.fulfillmentRate}%
                      </ThemedText>
                    </ThemedView>

                    <ThemedView type="cardBackground" style={[styles.kpiCard, { borderColor: theme.border }]}>
                      <ThemedText type="small" themeColor="textSecondary">มูลค่าคลังสินค้า (Stock Value)</ThemedText>
                      <ThemedText type="subtitle" style={{ color: '#2563EB', fontSize: 22 }}>
                        {formatBaht(data.departments.warehouse.totalRetailValue)}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        จำนวน {data.departments.warehouse.totalItems} ชิ้น ({data.departments.warehouse.totalProducts} SKU)
                      </ThemedText>
                    </ThemedView>
                  </View>

                  {/* Status Breakdown Table */}
                  <ThemedView type="cardBackground" style={[styles.card, { borderColor: theme.border }]}>
                    <ThemedText type="defaultSemiBold">📊 สรุปสัดส่วนสถานะการจัดส่ง</ThemedText>
                    <View style={styles.statusTable}>
                      {data.statusSummary.map((s) => (
                        <View key={s.status} style={[styles.statusTableRow, { borderTopColor: theme.border }]}>
                          <ThemedText type="small">{s.status}</ThemedText>
                          <ThemedText type="smallBold">{s.count} รายการ</ThemedText>
                        </View>
                      ))}
                    </View>
                  </ThemedView>
                </View>
              )}

              {/* TAB 2: รายการคำสั่งซื้อทั้งหมด */}
              {activeTab === 'orders' && (
                <ThemedView type="cardBackground" style={[styles.card, { borderColor: theme.border }]}>
                  <View style={styles.ordersHeaderRow}>
                    <ThemedText type="defaultSemiBold">🧾 รายการคำสั่งซื้อทั้งหมด ({filteredOrders.length} รายการ)</ThemedText>
                    {/* Search box */}
                    <View style={[styles.searchBox, { borderColor: theme.border }]}>
                      <ThemedText style={{ fontSize: 13 }}>🔍</ThemedText>
                      <TextInput
                        placeholder="ค้นหาออเดอร์, ชื่อลูกค้า, สถานะ..."
                        placeholderTextColor={theme.textSecondary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        style={[styles.searchInput, { color: theme.text }]}
                      />
                    </View>
                  </View>

                  {filteredOrders.length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary" style={{ paddingVertical: 16, textAlign: 'center' }}>
                      ไม่พบคำสั่งซื้อที่ตรงกับเงื่อนไขการค้นหา
                    </ThemedText>
                  ) : (
                    <View style={styles.ordersTable}>
                      <View style={[styles.ordersTableHeader, { borderBottomColor: theme.border }]}>
                        <ThemedText type="smallBold" style={{ flex: 1 }}>รหัส</ThemedText>
                        <ThemedText type="smallBold" style={{ flex: 2 }}>วันเวลา</ThemedText>
                        <ThemedText type="smallBold" style={{ flex: 2 }}>ลูกค้า</ThemedText>
                        <ThemedText type="smallBold" style={{ flex: 1.5 }}>ยอดเงิน</ThemedText>
                        <ThemedText type="smallBold" style={{ flex: 1.5 }}>การชำระเงิน</ThemedText>
                        <ThemedText type="smallBold" style={{ flex: 1.5, textAlign: 'right' }}>สถานะจัดส่ง</ThemedText>
                      </View>

                      {filteredOrders.map((o) => (
                        <View key={o.order_id} style={[styles.ordersTableRow, { borderBottomColor: theme.border }]}>
                          <ThemedText type="smallBold" style={{ flex: 1 }}>#{o.order_id}</ThemedText>
                          <ThemedText type="small" numberOfLines={1} style={{ flex: 2 }}>{o.order_date}</ThemedText>
                          <ThemedText type="small" numberOfLines={1} style={{ flex: 2 }}>{o.username || `ลูกค้า #${o.user_id}`}</ThemedText>
                          <ThemedText type="smallBold" style={{ flex: 1.5 }}>{formatBaht(o.total_amount)}</ThemedText>
                          <View style={{ flex: 1.5 }}>
                            <View
                              style={[
                                styles.pill,
                                { backgroundColor: o.payment_status === 'PAID' ? '#D1FAE5' : '#FEF3C7' },
                              ]}
                            >
                              <ThemedText
                                type="smallBold"
                                style={{ color: o.payment_status === 'PAID' ? '#059669' : '#D97706', fontSize: 10 }}
                              >
                                {o.payment_status === 'PAID' ? 'ชำระแล้ว' : 'รอชำระ'}
                              </ThemedText>
                            </View>
                          </View>
                          <ThemedText type="smallBold" style={{ flex: 1.5, textAlign: 'right', color: theme.primary }}>
                            {o.status}
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                  )}
                </ThemedView>
              )}

              {/* TAB 3: หมวดหมู่สินค้า */}
              {activeTab === 'categories' && data && (
                <ThemedView type="cardBackground" style={[styles.card, { borderColor: theme.border }]}>
                  <ThemedText type="defaultSemiBold">📁 สรุปยอดขายแยกตามหมวดหมู่</ThemedText>
                  {data.categories.length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary" style={{ paddingVertical: 12 }}>
                      ยังไม่มีข้อมูลหมวดหมู่สินค้า
                    </ThemedText>
                  ) : (
                    <View style={{ gap: 10, marginTop: 8 }}>
                      {data.categories.map((c) => (
                        <View key={c.category} style={[styles.categoryItem, { borderTopColor: theme.border }]}>
                          <View style={styles.catHeader}>
                            <ThemedText type="defaultSemiBold">{c.category}</ThemedText>
                            <ThemedText type="smallBold">{formatBaht(c.revenue)} ({c.percentage}%)</ThemedText>
                          </View>
                          <View style={styles.barTrack}>
                            <View
                              style={[
                                styles.barFill,
                                { width: `${Math.min(100, Math.max(5, c.percentage))}%`, backgroundColor: theme.primary },
                              ]}
                            />
                          </View>
                          <ThemedText type="small" themeColor="textSecondary">
                            จำนวนที่ขายได้: {c.itemsSold} ชิ้น
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                  )}
                </ThemedView>
              )}

              {/* TAB 4: สินค้าขายดี */}
              {activeTab === 'products' && data && (
                <ThemedView type="cardBackground" style={[styles.card, { borderColor: theme.border }]}>
                  <ThemedText type="defaultSemiBold">🏆 อันดับสินค้าขายดี (Best Sellers Ranking)</ThemedText>
                  {data.topProducts.length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary" style={{ paddingVertical: 12 }}>
                      ยังไม่มีข้อมูลสินค้าขายดี
                    </ThemedText>
                  ) : (
                    <View style={styles.rankingTable}>
                      <View style={[styles.rankingHeader, { borderBottomColor: theme.border }]}>
                        <ThemedText type="smallBold" style={{ width: 40 }}>อันดับ</ThemedText>
                        <ThemedText type="smallBold" style={{ flex: 3 }}>ชื่อสินค้า / หมวดหมู่</ThemedText>
                        <ThemedText type="smallBold" style={{ flex: 1.5, textAlign: 'center' }}>ขายได้ (ชิ้น)</ThemedText>
                        <ThemedText type="smallBold" style={{ flex: 2, textAlign: 'right' }}>ยอดขายรวม</ThemedText>
                        <ThemedText type="smallBold" style={{ flex: 1.5, textAlign: 'right' }}>สต็อกคงเหลือ</ThemedText>
                      </View>

                      {data.topProducts.map((p, idx) => (
                        <View key={p.id} style={[styles.rankingRow, { borderBottomColor: theme.border }]}>
                          <ThemedText type="smallBold" style={{ width: 40 }}>
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                          </ThemedText>
                          <View style={{ flex: 3 }}>
                            <ThemedText type="defaultSemiBold">{p.name}</ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">{p.category || 'ทั่วไป'}</ThemedText>
                          </View>
                          <ThemedText type="smallBold" style={{ flex: 1.5, textAlign: 'center' }}>
                            {p.quantity} ชิ้น
                          </ThemedText>
                          <ThemedText type="smallBold" style={{ flex: 2, textAlign: 'right', color: '#059669' }}>
                            {formatBaht(p.revenue)}
                          </ThemedText>
                          <ThemedText type="smallBold" style={{ flex: 1.5, textAlign: 'right' }}>
                            {p.stockRemaining ?? '-'} ชิ้น
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                  )}
                </ThemedView>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

export default function ManagerReports() {
  return (
    <RequireManager>
      <ManagerReportsContent />
    </RequireManager>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.six + 48,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  backLink: {
    marginBottom: 4,
  },
  eyebrow: { letterSpacing: 1.2 },
  exportButtonGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  btnExportPrimary: {
    backgroundColor: '#059669',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: Spacing.two,
  },
  btnExportSecondary: {
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: Spacing.two,
  },
  tabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#88888830',
  },
  loading: { marginTop: Spacing.six },
  errorBanner: { borderRadius: Spacing.three, borderWidth: 1, borderColor: '#D33A3F55', padding: Spacing.three },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  kpiCard: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 180,
    borderRadius: Spacing.two,
    borderWidth: 1,
    padding: Spacing.three,
    gap: 4,
  },
  card: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  statusTable: {
    gap: 4,
    marginTop: 6,
  },
  statusTableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ordersHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
    minWidth: 220,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  ordersTable: {
    marginTop: 6,
  },
  ordersTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  ordersTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pill: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  categoryItem: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    gap: 4,
  },
  catHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#88888820',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  rankingTable: {
    marginTop: 6,
  },
  rankingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
