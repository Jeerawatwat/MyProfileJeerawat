// src/app/claim-tracking.tsx — "ติดตามการเคลม" (Track my claims)
// Lists the signed-in buyer's own claims (server-side scoped — see
// claims.routes.js's GET /, same pattern as GET /api/orders) with a search box
// by claim number or Serial Number, and a Timeline for whichever claim is
// expanded. Login is required to see this page at all (see the design note in
// sql/009_product_claims.sql) — never a public, unauthenticated lookup.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClaimStatusBadge } from '@/components/payment-status-badge';
import { EmptyState } from '@/components/empty-state';
import { RequireUser } from '@/components/role-guard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useToast } from '@/context/toast-context';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/format';
import {
  ApiError,
  CLAIM_COMPONENT_LABELS,
  CLAIM_ISSUE_LABELS,
  CLAIM_RESOLUTION_LABELS,
  CLAIM_STATUS_LABELS,
  CLAIM_STATUS_TIMELINE,
  claimsApi,
  downloadAuthedFile,
  type Claim,
  type ClaimDetail,
} from '@/lib/api';

function ClaimTimeline({ status }: { status: string }) {
  const theme = useTheme();
  if (status === 'REJECTED') {
    return (
      <View style={styles.timelineRow}>
        <ThemedText type="small" themeColor="danger">
          ✕ ไม่อนุมัติการเคลม
        </ThemedText>
      </View>
    );
  }
  const currentIndex = CLAIM_STATUS_TIMELINE.indexOf(status as (typeof CLAIM_STATUS_TIMELINE)[number]);
  return (
    <View style={styles.timeline}>
      {CLAIM_STATUS_TIMELINE.map((step, index) => {
        const done = index <= currentIndex;
        return (
          <View key={step} style={styles.timelineStep}>
            <View style={[styles.timelineDot, { backgroundColor: done ? theme.primary : theme.border }]} />
            <ThemedText type="small" themeColor={done ? 'text' : 'textSecondary'} style={styles.timelineLabel}>
              {CLAIM_STATUS_LABELS[step]}
            </ThemedText>
            {index < CLAIM_STATUS_TIMELINE.length - 1 ? (
              <View style={[styles.timelineLine, { backgroundColor: index < currentIndex ? theme.primary : theme.border }]} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function ClaimTrackingContent() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ClaimDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async (query?: string) => {
    setError(null);
    try {
      const trimmed = (query ?? '').trim();
      const list = await claimsApi.list(trimmed ? { q: trimmed } : undefined);
      setClaims(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดข้อมูลการเคลมไม่สำเร็จ');
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
    await load(search);
    setIsRefreshing(false);
  };

  const toggleExpand = async (claim: Claim) => {
    if (expandedId === claim.claim_id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(claim.claim_id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const full = await claimsApi.get(claim.claim_id);
      setDetail(full);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'โหลดรายละเอียดไม่สำเร็จ', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const downloadPdf = async (claimId: number, claimNo: string) => {
    try {
      await downloadAuthedFile(claimsApi.pdfPath(claimId), `claim-${claimNo}.pdf`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'ดาวน์โหลดใบเคลมไม่สำเร็จ', 'error');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="title" style={styles.title}>
          ติดตามการเคลม
        </ThemedText>

        <ThemedText type="small" themeColor="textSecondary">
          ค้นหาใบเคลม<ThemedText type="smallBold">ที่เคยแจ้งไปแล้ว</ThemedText>เท่านั้น — จะแจ้งเคลมใหม่ ไปที่แท็บ "คำสั่งซื้อ" แล้วกดปุ่ม "แจ้งเคลม" ใต้สินค้าที่จัดส่งแล้ว
        </ThemedText>
        <View style={styles.searchRow}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="เลขที่ใบเคลม (CLM-...) หรือ Serial Number"
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { borderColor: theme.border, color: theme.text }]}
            onSubmitEditing={() => load(search)}
          />
          <Pressable style={[styles.searchButton, { backgroundColor: theme.backgroundElement }]} onPress={() => load(search)}>
            <ThemedText type="smallBold">ค้นหา</ThemedText>
          </Pressable>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" style={styles.loading} />
        ) : error ? (
          <ThemedView type="cardBackground" style={styles.errorBanner}>
            <ThemedText themeColor="danger">{error}</ThemedText>
          </ThemedView>
        ) : claims.length === 0 ? (
          <EmptyState title="ยังไม่มีการเคลม" hint="เมื่อคุณแจ้งเคลมสินค้า รายการจะแสดงที่นี่" />
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}>
            {claims.map((claim) => {
              const expanded = expandedId === claim.claim_id;
              return (
                <ThemedView key={claim.claim_id} type="cardBackground" style={[styles.card, { borderColor: theme.border }]}>
                  <Pressable onPress={() => toggleExpand(claim)}>
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <ThemedText type="defaultSemiBold">{claim.claim_no}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {claim.product_name_snapshot} · {formatDateTime(claim.created_at)}
                        </ThemedText>
                      </View>
                      <ClaimStatusBadge status={claim.status} />
                    </View>
                  </Pressable>

                  {expanded ? (
                    detailLoading || !detail ? (
                      <ActivityIndicator style={{ marginTop: Spacing.two }} />
                    ) : (
                      <View style={[styles.detailBox, { borderTopColor: theme.border }]}>
                        <ThemedText type="small">Serial: {detail.serial_no_snapshot}</ThemedText>
                        <ThemedText type="small">
                          อุปกรณ์: {CLAIM_COMPONENT_LABELS[detail.claim_component] ?? detail.claim_component} · อาการ:{' '}
                          {CLAIM_ISSUE_LABELS[detail.issue_type] ?? detail.issue_type}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {detail.issue_detail}
                        </ThemedText>
                        {detail.status === 'REJECTED' && detail.rejected_reason ? (
                          <ThemedText type="small" themeColor="danger">
                            เหตุผลที่ไม่อนุมัติ: {detail.rejected_reason}
                          </ThemedText>
                        ) : null}
                        {detail.resolution_type ? (
                          <ThemedText type="small">ผลการเคลม: {CLAIM_RESOLUTION_LABELS[detail.resolution_type] ?? detail.resolution_type}</ThemedText>
                        ) : null}
                        {detail.staff_note ? (
                          <ThemedText type="small" themeColor="textSecondary">
                            หมายเหตุจากเจ้าหน้าที่: {detail.staff_note}
                          </ThemedText>
                        ) : null}

                        <ClaimTimeline status={detail.status} />

                        <Pressable
                          style={[styles.pdfButton, { backgroundColor: theme.backgroundElement }]}
                          onPress={() => downloadPdf(detail.claim_id, detail.claim_no)}>
                          <ThemedText type="smallBold">ดาวน์โหลดใบเคลม PDF</ThemedText>
                        </Pressable>
                      </View>
                    )
                  ) : null}
                </ThemedView>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

export default function ClaimTrackingScreen() {
  return (
    <RequireUser>
      <ClaimTrackingContent />
    </RequireUser>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  title: { marginTop: Spacing.three },
  searchRow: { flexDirection: 'row', gap: Spacing.two },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  searchButton: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
  loading: { marginTop: Spacing.six },
  errorBanner: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#D33A3F55',
  },
  listContent: { gap: Spacing.three, paddingBottom: BottomTabInset + Spacing.six },
  card: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three, gap: Spacing.two },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  detailBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, gap: Spacing.one },
  timeline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: Spacing.one, gap: 2 },
  timelineStep: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timelineLabel: { marginRight: 4 },
  timelineLine: { width: 14, height: 2 },
  timelineRow: { marginTop: Spacing.one },
  pdfButton: {
    marginTop: Spacing.one,
    alignSelf: 'flex-start',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
});
