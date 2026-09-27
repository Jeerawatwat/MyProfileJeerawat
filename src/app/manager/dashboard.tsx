// src/app/manager/dashboard.tsx
// Comprehensive Executive Business Intelligence Dashboard for the Manager department.
// Includes KPIs, Department breakdowns (Delivery, Warehouse, Finance), Category share,
// Top selling products, and Excel / CSV export capability.
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RequireManager } from '@/components/role-guard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/context/toast-context';
import { useTheme } from '@/hooks/use-theme';
import {
  ApiError,
  formatBaht,
  managerApi,
  type ManagerDashboard as ManagerDashboardData,
} from '@/lib/api';
import { exportManagerReportToExcel } from '@/lib/manager-excel';

type RangeFilter = 'today' | '7days' | '30days' | 'all';

function ManagerDashboardContent() {
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const { showToast } = useToast();

  const [data, setData] = useState<ManagerDashboardData | null>(null);
  const [range, setRange] = useState<RangeFilter>('30days');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectedRange: RangeFilter) => {
    setError(null);
    try {
      const res = await managerApi.dashboard(selectedRange);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดข้อมูลผู้จัดการไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await load(range);
      setIsLoading(false);
    })();
  }, [load, range]);

  const refresh = async () => {
    setIsRefreshing(true);
    await load(range);
    setIsRefreshing(false);
  };

  const handleExport = () => {
    if (!data) {
      showToast('ไม่มีข้อมูลสำหรับ Export', 'error');
      return;
    }
    exportManagerReportToExcel(data, `manager_report_${range}`);
    showToast('Export รายงาน Excel (.CSV) สำเร็จเรียบร้อย');
  };

  const summary = data?.summary;
  const depts = data?.departments;

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
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
                EXECUTIVE BUSINESS INTELLIGENCE
              </ThemedText>
              <ThemedText type="subtitle">ภาพรวมธุรกิจ & การบริหารงาน</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                สวัสดีคุณ {user?.username} · ระบบสารสนเทศสำหรับผู้บริหาร (Executive Dashboard)
              </ThemedText>
            </View>

            {/* Export Excel Button */}
            <Pressable style={styles.btnExport} onPress={handleExport}>
              <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
                📥 Export สรุป Excel (.CSV)
              </ThemedText>
            </Pressable>
          </View>

          {/* Time Range Selector */}
          <View style={styles.rangeRow}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={{ alignSelf: 'center', marginRight: 4 }}>
              ช่วงเวลา:
            </ThemedText>
            {(
              [
                { key: 'today', label: 'วันนี้' },
                { key: '7days', label: '7 วันล่าสุด' },
                { key: '30days', label: '30 วันล่าสุด' },
                { key: 'all', label: 'ทั้งหมด' },
              ] as const
            ).map((item) => {
              const active = range === item.key;
              return (
                <Pressable
                  key={item.key}
                  style={[
                    styles.rangeChip,
                    active && { backgroundColor: theme.primary, borderColor: theme.primary },
                  ]}
                  onPress={() => setRange(item.key)}
                >
                  <ThemedText
                    type="smallBold"
                    style={{ color: active ? '#FFFFFF' : theme.textSecondary }}
                  >
                    {item.label}
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
          ) : data ? (
            <>
              {/* 1. Main Executive KPIs */}
              <View style={styles.metricsGrid}>
                {/* KPI 1: ยอดขายรวม */}
                <ThemedView type="cardBackground" style={[styles.kpiCard, { borderColor: theme.border }]}>
                  <View style={styles.kpiHeader}>
                    <ThemedText style={{ fontSize: 24 }}>💰</ThemedText>
                    <View style={[styles.badge, { backgroundColor: '#D1FAE5' }]}>
                      <ThemedText type="smallBold" style={{ color: '#059669', fontSize: 11 }}>
                        รายรับจริง
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText type="subtitle" style={[styles.kpiValue, { color: '#059669' }]}>
                    {formatBaht(summary?.totalRevenue ?? 0)}
                  </ThemedText>
                  <ThemedText type="smallBold">ยอดขายรวมสุทธิ</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    วันนี้รับชำระแล้ว: {formatBaht(data.today.revenue)}
                  </ThemedText>
                </ThemedView>

                {/* KPI 2: ออเดอร์ทั้งหมด */}
                <ThemedView type="cardBackground" style={[styles.kpiCard, { borderColor: theme.border }]}>
                  <View style={styles.kpiHeader}>
                    <ThemedText style={{ fontSize: 24 }}>🧾</ThemedText>
                    <View style={[styles.badge, { backgroundColor: '#DBEAFE' }]}>
                      <ThemedText type="smallBold" style={{ color: '#2563EB', fontSize: 11 }}>
                        คำสั่งซื้อ
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText type="subtitle" style={styles.kpiValue}>
                    {summary?.totalOrders ?? 0} รายการ
                  </ThemedText>
                  <ThemedText type="smallBold">จำนวนออเดอร์ทั้งหมด</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    ชำระแล้ว: {summary?.paidOrdersCount ?? 0} · รอชำระ: {summary?.pendingPaymentCount ?? 0}
                  </ThemedText>
                </ThemedView>

                {/* KPI 3: อัตราการจัดส่งสำเร็จ */}
                <ThemedView type="cardBackground" style={[styles.kpiCard, { borderColor: theme.border }]}>
                  <View style={styles.kpiHeader}>
                    <ThemedText style={{ fontSize: 24 }}>🚚</ThemedText>
                    <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}>
                      <ThemedText type="smallBold" style={{ color: '#D97706', fontSize: 11 }}>
                        Fulfillment
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText type="subtitle" style={[styles.kpiValue, { color: '#D97706' }]}>
                    {summary?.fulfillmentRate ?? 100}%
                  </ThemedText>
                  <ThemedText type="smallBold">อัตราจัดส่งสำเร็จ</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    ส่งสำเร็จ: {depts?.delivery.completed ?? 0} · อยู่ระหว่างส่ง: {depts?.delivery.inTransit ?? 0}
                  </ThemedText>
                </ThemedView>

                {/* KPI 4: ยอดเฉลี่ยต่อออเดอร์ */}
                <ThemedView type="cardBackground" style={[styles.kpiCard, { borderColor: theme.border }]}>
                  <View style={styles.kpiHeader}>
                    <ThemedText style={{ fontSize: 24 }}>📈</ThemedText>
                    <View style={[styles.badge, { backgroundColor: '#EDE9FE' }]}>
                      <ThemedText type="smallBold" style={{ color: '#7C3AED', fontSize: 11 }}>
                        AOV
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText type="subtitle" style={[styles.kpiValue, { color: '#7C3AED' }]}>
                    {formatBaht(summary?.avgOrderValue ?? 0)}
                  </ThemedText>
                  <ThemedText type="smallBold">ยอดเฉลี่ยต่อออเดอร์</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    มูลค่าคำสั่งซื้อเฉลี่ย (Average Order Value)
                  </ThemedText>
                </ThemedView>
              </View>

              {/* 2. Department Operations Status (3 แผนก) */}
              <View style={styles.sectionHeader}>
                <ThemedText type="defaultSemiBold">🏢 การดำเนินงานแยกตามแผนก (Department Operations)</ThemedText>
              </View>

              <View style={styles.deptGrid}>
                {/* แผนกจัดส่ง */}
                <ThemedView type="cardBackground" style={[styles.deptCard, { borderColor: theme.border }]}>
                  <View style={styles.deptCardHeader}>
                    <ThemedText style={{ fontSize: 20 }}>🚚</ThemedText>
                    <ThemedText type="defaultSemiBold">แผนกจัดส่ง (Delivery)</ThemedText>
                  </View>
                  <View style={styles.deptRow}>
                    <ThemedText type="small" themeColor="textSecondary">รอจัดเตรียม/จัดส่ง:</ThemedText>
                    <ThemedText type="smallBold" style={{ color: '#F59E0B' }}>
                      {depts?.delivery.pending ?? 0} รายการ
                    </ThemedText>
                  </View>
                  <View style={styles.deptRow}>
                    <ThemedText type="small" themeColor="textSecondary">อยู่ระหว่างจัดส่ง:</ThemedText>
                    <ThemedText type="smallBold" style={{ color: '#3B82F6' }}>
                      {depts?.delivery.inTransit ?? 0} รายการ
                    </ThemedText>
                  </View>
                  <View style={styles.deptRow}>
                    <ThemedText type="small" themeColor="textSecondary">จัดส่งสำเร็จแล้ว:</ThemedText>
                    <ThemedText type="smallBold" style={{ color: '#10B981' }}>
                      {depts?.delivery.completed ?? 0} รายการ
                    </ThemedText>
                  </View>
                  <View style={styles.deptRow}>
                    <ThemedText type="small" themeColor="textSecondary">ยกเลิก/มีปัญหา:</ThemedText>
                    <ThemedText type="smallBold" style={{ color: '#EF4444' }}>
                      {depts?.delivery.cancelled ?? 0} รายการ
                    </ThemedText>
                  </View>
                </ThemedView>

                {/* แผนกคลังสินค้า */}
                <ThemedView type="cardBackground" style={[styles.deptCard, { borderColor: theme.border }]}>
                  <View style={styles.deptCardHeader}>
                    <ThemedText style={{ fontSize: 20 }}>📦</ThemedText>
                    <ThemedText type="defaultSemiBold">แผนกคลังสินค้า (Stock)</ThemedText>
                  </View>
                  <View style={styles.deptRow}>
                    <ThemedText type="small" themeColor="textSecondary">รายการสินค้าทั้งหมด:</ThemedText>
                    <ThemedText type="smallBold">{depts?.warehouse.totalProducts ?? 0} SKU</ThemedText>
                  </View>
                  <View style={styles.deptRow}>
                    <ThemedText type="small" themeColor="textSecondary">สต็อกรวมในคลัง:</ThemedText>
                    <ThemedText type="smallBold">{depts?.warehouse.totalItems ?? 0} ชิ้น</ThemedText>
                  </View>
                  <View style={styles.deptRow}>
                    <ThemedText type="small" themeColor="textSecondary">มูลค่าสต็อก (ราคาขาย):</ThemedText>
                    <ThemedText type="smallBold">{formatBaht(depts?.warehouse.totalRetailValue ?? 0)}</ThemedText>
                  </View>
                  <View style={styles.deptRow}>
                    <ThemedText type="small" themeColor="textSecondary">ใกล้หมด / หมดสต็อก:</ThemedText>
                    <ThemedText type="smallBold" style={{ color: depts?.warehouse.lowStock ? '#F59E0B' : '#10B981' }}>
                      {depts?.warehouse.lowStock ?? 0} / {depts?.warehouse.outOfStock ?? 0} รายการ
                    </ThemedText>
                  </View>
                </ThemedView>

                {/* แผนกการเงิน/บัญชี */}
                <ThemedView type="cardBackground" style={[styles.deptCard, { borderColor: theme.border }]}>
                  <View style={styles.deptCardHeader}>
                    <ThemedText style={{ fontSize: 20 }}>💳</ThemedText>
                    <ThemedText type="defaultSemiBold">แผนกการเงิน (Finance)</ThemedText>
                  </View>
                  <View style={styles.deptRow}>
                    <ThemedText type="small" themeColor="textSecondary">รายรับรวมสุทธิ:</ThemedText>
                    <ThemedText type="smallBold" style={{ color: '#059669' }}>
                      {formatBaht(depts?.finance.totalIncome ?? 0)}
                    </ThemedText>
                  </View>
                  <View style={styles.deptRow}>
                    <ThemedText type="small" themeColor="textSecondary">ออเดอร์ชำระสำเร็จ:</ThemedText>
                    <ThemedText type="smallBold">{depts?.finance.paidOrders ?? 0} รายการ</ThemedText>
                  </View>
                  <View style={styles.deptRow}>
                    <ThemedText type="small" themeColor="textSecondary">ออเดอร์รอชำระเงิน:</ThemedText>
                    <ThemedText type="smallBold" style={{ color: '#F59E0B' }}>
                      {depts?.finance.pendingPayments ?? 0} รายการ
                    </ThemedText>
                  </View>
                  <View style={styles.deptRow}>
                    <ThemedText type="small" themeColor="textSecondary">สถานะการเงิน:</ThemedText>
                    <ThemedText type="smallBold" style={{ color: '#059669' }}>
                      ✓ ตรวจสอบแล้ว
                    </ThemedText>
                  </View>
                </ThemedView>
              </View>

              {/* 3. Sales By Category & Top Best Sellers */}
              <View style={styles.twoColumnGrid}>
                {/* 3.1 อันดับสินค้าขายดี (Top 10) */}
                <ThemedView type="cardBackground" style={[styles.card, { flex: 1.2, borderColor: theme.border }]}>
                  <View style={styles.cardTitleRow}>
                    <ThemedText type="defaultSemiBold">🏆 อันดับสินค้าขายดี (Top 10)</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      เรียงตามจำนวนที่ขายได้
                    </ThemedText>
                  </View>

                  {data.topProducts.length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary" style={{ paddingVertical: 12 }}>
                      ยังไม่มีข้อมูลรายการขายในช่วงเวลานี้
                    </ThemedText>
                  ) : (
                    data.topProducts.map((p, idx) => (
                      <View key={p.id} style={[styles.topProductRow, { borderTopColor: theme.border }]}>
                        <View style={[styles.rankBadge, idx === 0 && { backgroundColor: '#FEF3C7' }]}>
                          <ThemedText type="smallBold" style={{ color: idx === 0 ? '#D97706' : theme.textSecondary }}>
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                          </ThemedText>
                        </View>
                        <View style={{ flex: 1 }}>
                          <ThemedText type="defaultSemiBold" numberOfLines={1}>
                            {p.name}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {p.category || 'ทั่วไป'} · สต็อกคงเหลือ: {p.stockRemaining ?? '-'} ชิ้น
                          </ThemedText>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <ThemedText type="smallBold" themeColor="primary">
                            {p.quantity} ชิ้น
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {formatBaht(p.revenue)}
                          </ThemedText>
                        </View>
                      </View>
                    ))
                  )}
                </ThemedView>

                {/* 3.2 ยอดขายแยกตามหมวดหมู่ (Sales by Category) */}
                <ThemedView type="cardBackground" style={[styles.card, { flex: 1, borderColor: theme.border }]}>
                  <View style={styles.cardTitleRow}>
                    <ThemedText type="defaultSemiBold">📊 ยอดขายแยกตามหมวดหมู่</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      สัดส่วน %
                    </ThemedText>
                  </View>

                  {data.categories.length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary" style={{ paddingVertical: 12 }}>
                      ยังไม่มีข้อมูลหมวดหมู่
                    </ThemedText>
                  ) : (
                    data.categories.map((c) => (
                      <View key={c.category} style={[styles.categoryRow, { borderTopColor: theme.border }]}>
                        <View style={styles.catLabelRow}>
                          <ThemedText type="defaultSemiBold">{c.category}</ThemedText>
                          <ThemedText type="smallBold">{formatBaht(c.revenue)} ({c.percentage}%)</ThemedText>
                        </View>
                        <View style={styles.progressBarTrack}>
                          <View
                            style={[
                              styles.progressBarFill,
                              { width: `${Math.min(100, Math.max(8, c.percentage))}%`, backgroundColor: theme.primary },
                            ]}
                          />
                        </View>
                        <ThemedText type="small" themeColor="textSecondary">
                          ขายแล้ว {c.itemsSold} ชิ้น
                        </ThemedText>
                      </View>
                    ))
                  )}

                  {/* Order Status Pill List */}
                  <View style={[styles.statusSummaryBox, { backgroundColor: theme.backgroundElement }]}>
                    <ThemedText type="smallBold" style={{ marginBottom: 4 }}>
                      สรุปสถานะออเดอร์ทั้งหมด:
                    </ThemedText>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {data.statusSummary.map((s) => (
                        <View key={s.status} style={[styles.statusChip, { backgroundColor: theme.cardBackground }]}>
                          <ThemedText type="small">
                            {s.status}: <ThemedText type="smallBold">{s.count}</ThemedText>
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                  </View>
                </ThemedView>
              </View>

              {/* 4. Recent Executive Orders Table */}
              <ThemedView type="cardBackground" style={[styles.card, { borderColor: theme.border }]}>
                <View style={styles.cardTitleRow}>
                  <View>
                    <ThemedText type="defaultSemiBold">🧾 รายการคำสั่งซื้อล่าสุด (Recent Orders)</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      15 รายการล่าสุดในระบบ
                    </ThemedText>
                  </View>
                  <Pressable
                    style={[styles.btnOutline, { borderColor: theme.border }]}
                    onPress={() => router.push('/manager/reports')}
                  >
                    <ThemedText type="smallBold">📑 ดูรายงานเต็ม</ThemedText>
                  </Pressable>
                </View>

                {data.recentOrders.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={{ paddingVertical: 12 }}>
                    ยังไม่มีรายการคำสั่งซื้อ
                  </ThemedText>
                ) : (
                  <View style={styles.table}>
                    <View style={[styles.tableHeader, { borderBottomColor: theme.border }]}>
                      <ThemedText type="smallBold" style={{ flex: 1 }}>รหัสออเดอร์</ThemedText>
                      <ThemedText type="smallBold" style={{ flex: 2 }}>ลูกค้า</ThemedText>
                      <ThemedText type="smallBold" style={{ flex: 1.5 }}>ยอดเงิน</ThemedText>
                      <ThemedText type="smallBold" style={{ flex: 1.5 }}>การชำระเงิน</ThemedText>
                      <ThemedText type="smallBold" style={{ flex: 1.5, textAlign: 'right' }}>สถานะจัดส่ง</ThemedText>
                    </View>

                    {data.recentOrders.map((o) => (
                      <View key={o.order_id} style={[styles.tableRow, { borderBottomColor: theme.border }]}>
                        <ThemedText type="smallBold" style={{ flex: 1 }}>#{o.order_id}</ThemedText>
                        <ThemedText type="small" numberOfLines={1} style={{ flex: 2 }}>{o.customer}</ThemedText>
                        <ThemedText type="smallBold" style={{ flex: 1.5 }}>{formatBaht(o.total_amount)}</ThemedText>
                        <View style={{ flex: 1.5 }}>
                          <View
                            style={[
                              styles.miniBadge,
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
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

export default function ManagerDashboard() {
  return (
    <RequireManager>
      <ManagerDashboardContent />
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
  eyebrow: { letterSpacing: 1.2 },
  btnExport: {
    backgroundColor: '#059669',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: Spacing.two,
    shadowColor: '#059669',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  btnOutline: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rangeChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#88888830',
  },
  loading: { marginTop: Spacing.six },
  errorBanner: { borderRadius: Spacing.three, borderWidth: 1, borderColor: '#D33A3F55', padding: Spacing.three },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  kpiCard: {
    flexGrow: 1,
    flexBasis: '48%',
    minWidth: 160,
    borderRadius: Spacing.two,
    borderWidth: 1,
    padding: Spacing.three,
    gap: 4,
  },
  kpiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  sectionHeader: {
    marginTop: Spacing.one,
  },
  deptGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  deptCard: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 200,
    borderRadius: Spacing.two,
    borderWidth: 1,
    padding: Spacing.three,
    gap: 8,
  },
  deptCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#88888830',
    paddingBottom: 6,
  },
  deptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  twoColumnGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  card: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  topProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#88888820',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    gap: 4,
  },
  catLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#88888820',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  statusSummaryBox: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    marginTop: Spacing.one,
  },
  statusChip: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  table: {
    gap: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  miniBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
});
