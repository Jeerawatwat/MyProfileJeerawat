import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { RequireStock } from '@/components/role-guard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, stockApi, type StockLog } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

function StockHistoryContent() {
  const theme = useTheme();
  const router = useRouter();

  const [logs, setLogs] = useState<StockLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setError(null);
    try {
      const data = await stockApi.logs();
      setLogs(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ไม่สามารถโหลดประวัติการปรับสต็อกได้');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await loadLogs();
      setIsLoading(false);
    })();
  }, [loadLogs]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadLogs();
    setIsRefreshing(false);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.push('/stock/inventory')} style={styles.backBtn}>
              <ThemedText type="smallBold" themeColor="primary">
                ← กลับไปคลังสินค้า
              </ThemedText>
            </Pressable>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
              STOCK ADJUSTMENT HISTORY
            </ThemedText>
            <ThemedText type="subtitle">ประวัติการปรับยอดสต็อก</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              บันทึกรายการเคลื่อนไหว รับเข้า ตัดจ่าย และตรวจนับสินค้าคงคลัง
            </ThemedText>
          </View>

          {isLoading ? (
            <ActivityIndicator size="large" style={styles.loading} />
          ) : error ? (
            <ThemedView type="cardBackground" style={styles.errorBanner}>
              <ThemedText themeColor="danger">{error}</ThemedText>
            </ThemedView>
          ) : logs.length === 0 ? (
            <EmptyState title="ยังไม่มีประวัติการปรับสต็อก" hint="เมื่อมีการปรับยอดสต็อกสินค้า รายการจะปรากฏที่นี่" />
          ) : (
            <View style={styles.logList}>
              {logs.map((log) => {
                const isIncrease = log.change_amount > 0;
                const isDecrease = log.change_amount < 0;

                return (
                  <ThemedView
                    key={log.id}
                    type="cardBackground"
                    style={[styles.logCard, { borderColor: theme.border }]}
                  >
                    <View style={styles.logHeader}>
                      <View style={{ flex: 1 }}>
                        <ThemedText type="defaultSemiBold">
                          {log.product_name || `สินค้า #${log.product_id}`}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {formatDateTime(log.created_at)} • โดย {log.created_by}
                        </ThemedText>
                      </View>

                      {/* Badge Change */}
                      <View
                        style={[
                          styles.changeBadge,
                          {
                            backgroundColor: isIncrease
                              ? '#D1FAE5'
                              : isDecrease
                              ? '#FEE2E2'
                              : '#E5E7EB',
                          },
                        ]}
                      >
                        <ThemedText
                          type="smallBold"
                          style={{
                            color: isIncrease ? '#059669' : isDecrease ? '#EF4444' : '#374151',
                          }}
                        >
                          {isIncrease ? `+${log.change_amount}` : log.change_amount} ชิ้น
                        </ThemedText>
                      </View>
                    </View>

                    <View style={[styles.detailBlock, { backgroundColor: theme.backgroundElement }]}>
                      <View style={styles.detailRow}>
                        <ThemedText type="small" themeColor="textSecondary">เหตุผล:</ThemedText>
                        <ThemedText type="smallBold">{log.reason}</ThemedText>
                      </View>
                      <View style={styles.detailRow}>
                        <ThemedText type="small" themeColor="textSecondary">การเปลี่ยนแปลง:</ThemedText>
                        <ThemedText type="small">
                          {log.previous_stock} ชิ้น ➔{' '}
                          <ThemedText type="smallBold" themeColor="primary">
                            {log.new_stock} ชิ้น
                          </ThemedText>
                        </ThemedText>
                      </View>
                      {log.note ? (
                        <View style={styles.detailRow}>
                          <ThemedText type="small" themeColor="textSecondary">หมายเหตุ:</ThemedText>
                          <ThemedText type="small">{log.note}</ThemedText>
                        </View>
                      ) : null}
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

export default function StockHistoryScreen() {
  return (
    <RequireStock>
      <StockHistoryContent />
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
  backBtn: {
    marginBottom: Spacing.one,
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
  logList: {
    gap: Spacing.two,
  },
  logCard: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  changeBadge: {
    paddingVertical: 3,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
  },
  detailBlock: {
    padding: Spacing.two,
    borderRadius: Spacing.one,
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
