import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { EmptyState } from '@/components/empty-state';
import { RequireStock } from '@/components/role-guard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useToast } from '@/context/toast-context';
import { useTheme } from '@/hooks/use-theme';
import {
  ApiError,
  formatBaht,
  resolveImageUrl,
  stockApi,
  type StockInventoryData,
  type StockProduct,
} from '@/lib/api';

type FilterType = 'all' | 'low' | 'out';

function StockInventoryContent() {
  const theme = useTheme();
  const router = useRouter();
  const { showToast } = useToast();

  const [data, setData] = useState<StockInventoryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Stock Adjustment Modal
  const [selectedProduct, setSelectedProduct] = useState<StockProduct | null>(null);
  const [adjustMode, setAdjustMode] = useState<'add' | 'sub' | 'set'>('add');
  const [adjustAmount, setAdjustAmount] = useState<string>('1');
  const [adjustReason, setAdjustReason] = useState<string>('รับสินค้าเข้าคลัง (PO Inbound)');
  const [adjustNote, setAdjustNote] = useState<string>('');
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const res = await stockApi.inventory();
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ไม่สามารถโหลดข้อมูลคลังสินค้าได้');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await loadData();
      setIsLoading(false);
    })();
  }, [loadData]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  // Open adjustment modal
  const openAdjustModal = (product: StockProduct) => {
    setSelectedProduct(product);
    setAdjustMode('add');
    setAdjustAmount('1');
    setAdjustReason('รับสินค้าเข้าคลัง (PO Inbound)');
    setAdjustNote('');
  };

  // Submit stock adjustment
  const handleSaveAdjustment = async () => {
    if (!selectedProduct) return;
    const qty = parseInt(adjustAmount, 10);
    if (isNaN(qty) || qty < 0) {
      showToast('กรุณาระบุจำนวนสินค้าที่ถูกต้อง', 'error');
      return;
    }

    let payload: { changeAmount?: number; newStock?: number; reason: string; note?: string };
    if (adjustMode === 'add') {
      payload = { changeAmount: qty, reason: adjustReason, note: adjustNote };
    } else if (adjustMode === 'sub') {
      payload = { changeAmount: -qty, reason: adjustReason, note: adjustNote };
    } else {
      payload = { newStock: qty, reason: adjustReason, note: adjustNote };
    }

    setIsSubmittingAdjust(true);
    try {
      await stockApi.adjustStock(selectedProduct.id, {
        ...payload,
        productName: selectedProduct.name,
      });
      showToast(`ปรับสต็อกสินค้า "${selectedProduct.name}" สำเร็จ`);
      setSelectedProduct(null);
      await loadData();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'ปรับยอดสต็อกไม่สำเร็จ', 'error');
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!data?.products || data.products.length === 0) {
      showToast('ไม่มีข้อมูลสินค้าสำหรับ Export', 'error');
      return;
    }

    const headers = ['รหัสสินค้า (ID)', 'รหัส SKU', 'ชื่อสินค้า', 'หมวดหมู่', 'ตำแหน่งชั้นวาง', 'ราคาขาย', 'ราคาต้นทุน', 'คงเหลือ', 'ขั้นต่ำ', 'สถานะ'];
    const rows = data.products.map((p) => [
      p.id,
      `"${p.sku}"`,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.category}"`,
      `"${p.location}"`,
      p.price,
      p.cost_price,
      p.stock,
      p.min_stock,
      `"${p.status === 'OUT_OF_STOCK' ? 'สินค้าหมด' : p.status === 'LOW_STOCK' ? 'ใกล้หมด' : 'พร้อมจำหน่าย'}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `inventory_stock_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Export ไฟล์ CSV สำเร็จ');
    } else {
      showToast('ส่งออก CSV เรียบร้อยแล้ว');
    }
  };

  // Filtered Products
  const filteredProducts = useMemo(() => {
    if (!data?.products) return [];
    return data.products.filter((p) => {
      // Filter tab
      if (activeFilter === 'low' && p.status !== 'LOW_STOCK') return false;
      if (activeFilter === 'out' && p.status !== 'OUT_OF_STOCK') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (p.name || '').toLowerCase().includes(q);
        const matchSku = (p.sku || '').toLowerCase().includes(q);
        const matchLoc = (p.location || '').toLowerCase().includes(q);
        const matchCat = (p.category || '').toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchLoc && !matchCat) return false;
      }
      return true;
    });
  }, [data, activeFilter, searchQuery]);

  const summary = data?.summary;
  const lowItems = summary?.lowStockProducts ?? [];

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
              INVENTORY & STOCK MANAGEMENT
            </ThemedText>
            <ThemedText type="subtitle">คลังสินค้า & สต็อกสินค้า</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              ระบบบริหารร้านค้า / ตรวจสอบสินค้าคงคลัง ตำแหน่งชั้นวาง และปรับยอดสต็อก
            </ThemedText>
          </View>

          {isLoading ? (
            <ActivityIndicator size="large" style={styles.loading} />
          ) : error ? (
            <ThemedView type="cardBackground" style={styles.errorBanner}>
              <ThemedText themeColor="danger">{error}</ThemedText>
              <Pressable
                style={{ marginTop: 10, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: theme.primary, borderRadius: 8, alignSelf: 'flex-start' }}
                onPress={() => {
                  setIsLoading(true);
                  loadData().finally(() => setIsLoading(false));
                }}
              >
                <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>🔄 ลองใหม่อีกครั้ง</ThemedText>
              </Pressable>
            </ThemedView>
          ) : (
            <>
              {/* Alert Banner: Low Stock Warning */}
              {lowItems.length > 0 && (
                <View style={styles.alertBanner}>
                  <View style={styles.alertLeft}>
                    <ThemedText style={styles.alertIcon}>⚠️</ThemedText>
                    <View style={styles.alertTextGroup}>
                      <ThemedText style={styles.alertTitle}>
                        แจ้งเตือน: มีสินค้า {lowItems.length} รายการที่ใกล้หมดสต็อก (≤ 5 ชิ้น)
                      </ThemedText>
                      <ThemedText style={styles.alertSub} numberOfLines={2}>
                        {lowItems.map((item) => `${item.name} (${item.stock} ชิ้น)`).join(', ')}
                      </ThemedText>
                    </View>
                  </View>
                  <Pressable
                    style={styles.alertFilterBtn}
                    onPress={() => setActiveFilter('low')}
                  >
                    <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
                      กรองเฉพาะของใกล้หมด
                    </ThemedText>
                  </Pressable>
                </View>
              )}

              {/* 3 Summary Stat Cards */}
              <View style={styles.statsRow}>
                {/* Card 1 */}
                <ThemedView type="cardBackground" style={[styles.statCard, { borderColor: theme.border }]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    จำนวนสินค้าคงคลังรวม
                  </ThemedText>
                  <ThemedText type="title" style={styles.statNumber}>
                    {summary?.totalItems.toLocaleString() ?? 0}{' '}
                    <ThemedText type="small" themeColor="textSecondary">ชิ้น</ThemedText>
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    ครอบคลุม {summary?.totalProducts ?? 0} SKU ในระบบ
                  </ThemedText>
                </ThemedView>

                {/* Card 2 */}
                <ThemedView type="cardBackground" style={[styles.statCard, { borderColor: theme.border }]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    มูลค่าต้นทุนสินค้าคงคลังรวม (Cost Value)
                  </ThemedText>
                  <ThemedText type="title" themeColor="primary" style={styles.statNumber}>
                    {formatBaht(summary?.totalCostValue ?? 0)}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    มูลค่าราคาขายหน้าร้าน: {formatBaht(summary?.totalRetailValue ?? 0)}
                  </ThemedText>
                </ThemedView>

                {/* Card 3 */}
                <ThemedView type="cardBackground" style={[styles.statCard, { borderColor: theme.border }]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    รายการแจ้งเตือนสต็อกขั้นต่ำ
                  </ThemedText>
                  <ThemedText type="title" style={[styles.statNumber, { color: '#EF4444' }]}>
                    {summary?.lowStockCount ?? 0}{' '}
                    <ThemedText type="small" themeColor="textSecondary">SKU</ThemedText>
                  </ThemedText>
                  <ThemedText type="small" style={{ color: '#EF4444' }}>
                    {summary && summary.lowStockCount > 0 ? '⚠️ ต้องรีบออกใบสั่งซื้อ (PO Inbound)' : '✓ สต็อกสินค้าเพียงพอ'}
                  </ThemedText>
                </ThemedView>
              </View>

              {/* Action & Filter Toolbar */}
              <View style={styles.toolbar}>
                {/* Search */}
                <View style={[styles.searchBox, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                  <ThemedText style={styles.searchIcon}>🔍</ThemedText>
                  <TextInput
                    placeholder="ค้นหาชื่อสินค้า, SKU, ชั้นวาง..."
                    placeholderTextColor={theme.textSecondary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    style={[styles.searchInput, { color: theme.text }]}
                    autoCapitalize="none"
                    clearButtonMode="while-editing"
                  />
                </View>

                {/* Filter Chips */}
                <View style={styles.filterChips}>
                  <Pressable
                    style={[
                      styles.chip,
                      activeFilter === 'all' && { backgroundColor: theme.text, borderColor: theme.text },
                    ]}
                    onPress={() => setActiveFilter('all')}
                  >
                    <ThemedText
                      type="smallBold"
                      style={{ color: activeFilter === 'all' ? theme.background : theme.textSecondary }}
                    >
                      ทั้งหมด ({summary?.totalProducts ?? 0})
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.chip,
                      activeFilter === 'low' && { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
                    ]}
                    onPress={() => setActiveFilter('low')}
                  >
                    <ThemedText
                      type="smallBold"
                      style={{ color: activeFilter === 'low' ? '#FFFFFF' : theme.textSecondary }}
                    >
                      ใกล้หมด ({summary?.lowStockCount ?? 0})
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.chip,
                      activeFilter === 'out' && { backgroundColor: '#EF4444', borderColor: '#EF4444' },
                    ]}
                    onPress={() => setActiveFilter('out')}
                  >
                    <ThemedText
                      type="smallBold"
                      style={{ color: activeFilter === 'out' ? '#FFFFFF' : theme.textSecondary }}
                    >
                      หมดสต็อก ({summary?.outOfStockCount ?? 0})
                    </ThemedText>
                  </Pressable>
                </View>

                {/* Right Action Buttons */}
                <View style={styles.actionButtonsRow}>
                  <Pressable
                    style={[styles.btnOutline, { borderColor: theme.border }]}
                    onPress={() => router.push('/stock/history')}
                  >
                    <ThemedText type="smallBold">🕒 ดูประวัติปรับสต็อก</ThemedText>
                  </Pressable>

                  <Pressable style={styles.btnExport} onPress={handleExportCSV}>
                    <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
                      📥 Export สต็อก Excel (.CSV)
                    </ThemedText>
                  </Pressable>
                </View>
              </View>

              {/* Inventory Table / Items */}
              {filteredProducts.length === 0 ? (
                <EmptyState title="ไม่พบรายการสินค้า" hint="ไม่มีรายการสินค้าที่ตรงกับเงื่อนไขการค้นหา" />
              ) : (
                <View style={styles.tableContainer}>
                  {/* Table Column Headers (Web view) */}
                  <ThemedView type="backgroundElement" style={styles.tableHeaderRow}>
                    <ThemedText type="smallBold" style={[styles.colHeader, { flex: 3 }]}>
                      รูป & ข้อมูลสินค้า
                    </ThemedText>
                    <ThemedText type="smallBold" style={[styles.colHeader, { flex: 1.8 }]}>
                      รหัส SKU / หมวดหมู่
                    </ThemedText>
                    <ThemedText type="smallBold" style={[styles.colHeader, { flex: 1.5 }]}>
                      ตำแหน่งชั้นวาง
                    </ThemedText>
                    <ThemedText type="smallBold" style={[styles.colHeader, { flex: 1.6 }]}>
                      ราคาขาย / ต้นทุน
                    </ThemedText>
                    <ThemedText type="smallBold" style={[styles.colHeader, { flex: 1.4 }]}>
                      คงเหลือในคลัง
                    </ThemedText>
                    <ThemedText type="smallBold" style={[styles.colHeader, { flex: 1.5 }]}>
                      สถานะสต็อก
                    </ThemedText>
                    <ThemedText type="smallBold" style={[styles.colHeader, { flex: 1.2, textAlign: 'center' }]}>
                      ปรับยอด
                    </ThemedText>
                  </ThemedView>

                  {/* Table Rows */}
                  {filteredProducts.map((p) => {
                    const isLow = p.status === 'LOW_STOCK';
                    const isOut = p.status === 'OUT_OF_STOCK';

                    return (
                      <ThemedView
                        key={p.id}
                        type="cardBackground"
                        style={[
                          styles.tableRow,
                          { borderColor: theme.border },
                          isOut && styles.rowOutOfStock,
                        ]}
                      >
                        {/* 1. รูป & ข้อมูลสินค้า */}
                        <View style={[styles.colCell, { flex: 3, flexDirection: 'row', gap: Spacing.two }]}>
                          {resolveImageUrl(p.image_url) ? (
                            <Image
                              source={{ uri: resolveImageUrl(p.image_url) as string }}
                              style={styles.productThumb}
                              contentFit="cover"
                            />
                          ) : (
                            <View style={[styles.productThumbPlaceholder, { backgroundColor: theme.backgroundElement }]}>
                              <ThemedText style={{ fontSize: 20 }}>📦</ThemedText>
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <ThemedText type="defaultSemiBold" numberOfLines={1}>
                              {p.name}
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                              {p.description || 'ไม่มีรายละเอียดสินค้า'}
                            </ThemedText>
                          </View>
                        </View>

                        {/* 2. รหัส SKU / หมวดหมู่ */}
                        <View style={[styles.colCell, { flex: 1.8 }]}>
                          <ThemedText type="smallBold" themeColor="primary">
                            {p.sku}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {p.category}
                          </ThemedText>
                        </View>

                        {/* 3. ตำแหน่งชั้นวาง */}
                        <View style={[styles.colCell, { flex: 1.5, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                          <ThemedText style={{ fontSize: 13 }}>📍</ThemedText>
                          <ThemedText type="smallBold">{p.location}</ThemedText>
                        </View>

                        {/* 4. ราคาขาย / ต้นทุน */}
                        <View style={[styles.colCell, { flex: 1.6 }]}>
                          <ThemedText type="smallBold">{formatBaht(p.price)}</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            ทุน: {formatBaht(p.cost_price)}
                          </ThemedText>
                        </View>

                        {/* 5. คงเหลือในคลัง */}
                        <View style={[styles.colCell, { flex: 1.4 }]}>
                          <ThemedText
                            type="defaultSemiBold"
                            style={[
                              styles.stockNumber,
                              isOut ? { color: '#EF4444' } : isLow ? { color: '#F59E0B' } : {},
                            ]}
                          >
                            {p.stock}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            ขั้นต่ำ: {p.min_stock} ชิ้น
                          </ThemedText>
                        </View>

                        {/* 6. สถานะสต็อก */}
                        <View style={[styles.colCell, { flex: 1.5 }]}>
                          {isOut ? (
                            <View style={[styles.statusBadge, { backgroundColor: '#FEE2E2' }]}>
                              <ThemedText type="smallBold" style={{ color: '#EF4444' }}>
                                ✕ สินค้าหมด
                              </ThemedText>
                            </View>
                          ) : isLow ? (
                            <View style={[styles.statusBadge, { backgroundColor: '#FEF3C7' }]}>
                              <ThemedText type="smallBold" style={{ color: '#D97706' }}>
                                ⚠️ ใกล้หมด
                              </ThemedText>
                            </View>
                          ) : (
                            <View style={[styles.statusBadge, { backgroundColor: '#D1FAE5' }]}>
                              <ThemedText type="smallBold" style={{ color: '#059669' }}>
                                ✓ พร้อมจำหน่าย
                              </ThemedText>
                            </View>
                          )}
                        </View>

                        {/* 7. ปรับยอด */}
                        <View style={[styles.colCell, { flex: 1.2, alignItems: 'center' }]}>
                          <Pressable
                            style={[styles.btnAdjust, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
                            onPress={() => openAdjustModal(p)}
                          >
                            <ThemedText style={{ fontSize: 13 }}>🎚️</ThemedText>
                            <ThemedText type="smallBold">ปรับสต็อก</ThemedText>
                          </Pressable>
                        </View>
                      </ThemedView>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Stock Adjustment Modal */}
      {selectedProduct && (
        <Modal
          visible={!!selectedProduct}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedProduct(null)}
        >
          <View style={styles.modalOverlay}>
            <ThemedView type="cardBackground" style={[styles.modalCard, { borderColor: theme.border }]}>
              <View style={styles.modalHeader}>
                <View>
                  <ThemedText type="subtitle">ปรับสต็อกสินค้า</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {selectedProduct.sku} • {selectedProduct.name}
                  </ThemedText>
                </View>
                <Pressable onPress={() => setSelectedProduct(null)} style={styles.modalCloseBtn}>
                  <ThemedText style={{ fontSize: 18 }}>✕</ThemedText>
                </Pressable>
              </View>

              <View style={[styles.currentStockRow, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="small" themeColor="textSecondary">คงเหลือปัจจุบัน:</ThemedText>
                <ThemedText type="subtitle" themeColor="primary">
                  {selectedProduct.stock} ชิ้น
                </ThemedText>
              </View>

              {/* Mode Tabs */}
              <View style={styles.modeTabs}>
                <Pressable
                  style={[
                    styles.modeTab,
                    adjustMode === 'add' && { backgroundColor: '#10B981', borderColor: '#10B981' },
                  ]}
                  onPress={() => {
                    setAdjustMode('add');
                    setAdjustReason('รับสินค้าเข้าคลัง (PO Inbound)');
                  }}
                >
                  <ThemedText type="smallBold" style={{ color: adjustMode === 'add' ? '#FFFFFF' : theme.textSecondary }}>
                    + เพิ่มสต็อก
                  </ThemedText>
                </Pressable>

                <Pressable
                  style={[
                    styles.modeTab,
                    adjustMode === 'sub' && { backgroundColor: '#EF4444', borderColor: '#EF4444' },
                  ]}
                  onPress={() => {
                    setAdjustMode('sub');
                    setAdjustReason('ตัดจ่าย/เบิกออกคลัง');
                  }}
                >
                  <ThemedText type="smallBold" style={{ color: adjustMode === 'sub' ? '#FFFFFF' : theme.textSecondary }}>
                    - ลดสต็อก
                  </ThemedText>
                </Pressable>

                <Pressable
                  style={[
                    styles.modeTab,
                    adjustMode === 'set' && { backgroundColor: theme.primary, borderColor: theme.primary },
                  ]}
                  onPress={() => {
                    setAdjustMode('set');
                    setAdjustAmount(String(selectedProduct.stock));
                    setAdjustReason('ปรับยอดตรวจนับ (Count Adjustment)');
                  }}
                >
                  <ThemedText type="smallBold" style={{ color: adjustMode === 'set' ? '#FFFFFF' : theme.textSecondary }}>
                    = กำหนดจำนวน
                  </ThemedText>
                </Pressable>
              </View>

              {/* Amount Input */}
              <View style={styles.inputGroup}>
                <ThemedText type="smallBold">
                  {adjustMode === 'set' ? 'จำนวนคงเหลือใหม่' : 'จำนวนที่ต้องการปรับ'}
                </ThemedText>
                <TextInput
                  keyboardType="numeric"
                  value={adjustAmount}
                  onChangeText={setAdjustAmount}
                  style={[styles.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
                />
              </View>

              {/* Reason Input / Presets */}
              <View style={styles.inputGroup}>
                <ThemedText type="smallBold">เหตุผลในการปรับยอด</ThemedText>
                <TextInput
                  value={adjustReason}
                  onChangeText={setAdjustReason}
                  style={[styles.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
                />
              </View>

              {/* Note (Optional) */}
              <View style={styles.inputGroup}>
                <ThemedText type="smallBold">หมายเหตุเพิ่มเติม (ถ้ามี)</ThemedText>
                <TextInput
                  placeholder="เช่น เลขที่เอกสารอ้างอิง..."
                  placeholderTextColor={theme.textSecondary}
                  value={adjustNote}
                  onChangeText={setAdjustNote}
                  style={[styles.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
                />
              </View>

              {/* Result Preview */}
              <View style={[styles.previewRow, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="small" themeColor="textSecondary">ยอดที่จะเป็นหลังปรับ:</ThemedText>
                <ThemedText type="subtitle">
                  {adjustMode === 'add'
                    ? selectedProduct.stock + (parseInt(adjustAmount, 10) || 0)
                    : adjustMode === 'sub'
                    ? Math.max(0, selectedProduct.stock - (parseInt(adjustAmount, 10) || 0))
                    : Math.max(0, parseInt(adjustAmount, 10) || 0)}{' '}
                  ชิ้น
                </ThemedText>
              </View>

              {/* Modal Buttons */}
              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                  onPress={() => setSelectedProduct(null)}
                >
                  <ThemedText type="smallBold">ยกเลิก</ThemedText>
                </Pressable>

                <Pressable
                  style={[styles.modalSaveBtn, { backgroundColor: theme.primary }]}
                  onPress={handleSaveAdjustment}
                  disabled={isSubmittingAdjust}
                >
                  {isSubmittingAdjust ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
                      บันทึกการปรับยอด
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            </ThemedView>
          </View>
        </Modal>
      )}
    </ThemedView>
  );
}

export default function StockInventoryScreen() {
  return (
    <RequireStock>
      <StockInventoryContent />
    </RequireStock>
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
  alertBanner: {
    backgroundColor: '#831843',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  alertLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
    minWidth: 260,
  },
  alertIcon: {
    fontSize: 22,
  },
  alertTextGroup: {
    flex: 1,
  },
  alertTitle: {
    color: '#FCE7F3',
    fontWeight: '700',
    fontSize: 14,
  },
  alertSub: {
    color: '#FBCFE8',
    fontSize: 12,
    marginTop: 2,
  },
  alertFilterBtn: {
    backgroundColor: '#BE185D',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  statCard: {
    flex: 1,
    minWidth: 200,
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.half,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
  },
  toolbar: {
    gap: Spacing.two,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
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
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#88888840',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  btnOutline: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnExport: {
    backgroundColor: '#059669',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableContainer: {
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
  },
  colHeader: {
    fontSize: 12,
    color: '#888888',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.one,
  },
  rowOutOfStock: {
    opacity: 0.8,
  },
  colCell: {
    justifyContent: 'center',
  },
  productThumb: {
    width: 44,
    height: 44,
    borderRadius: Spacing.one,
  },
  productThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockNumber: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.three,
  },
  btnAdjust: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  modalCloseBtn: {
    padding: Spacing.one,
  },
  currentStockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: Spacing.one,
  },
  modeTabs: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  modeTab: {
    flex: 1,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#88888840',
    alignItems: 'center',
  },
  inputGroup: {
    gap: 4,
  },
  modalInput: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 14,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: Spacing.one,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  modalCancelBtn: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalSaveBtn: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
