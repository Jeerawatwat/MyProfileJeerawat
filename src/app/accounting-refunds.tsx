// src/app/accounting-refunds.tsx — Accounting: Refunds
// Refund requests from buyers. Approve / reject / "โอนคืนแล้ว" each move a
// request forward exactly once; the backend re-checks that approved refunds
// never exceed what the customer paid, and writes an audit log row for every
// action.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterChips, MoneyRow, PageHeader, accountingStyles as s } from '@/components/accounting-ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { RefundStatusBadge } from '@/components/payment-status-badge';
import { ReasonDialog } from '@/components/reason-dialog';
import { RequireAccounting } from '@/components/role-guard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useToast } from '@/context/toast-context';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, formatBaht, openAuthedFile, refundsApi, type Refund } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

type Filter = 'REFUND_REQUESTED' | 'REFUND_APPROVED' | 'REFUNDED' | 'REFUND_REJECTED' | 'ALL';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'REFUND_REQUESTED', label: 'รอพิจารณา' },
  { value: 'REFUND_APPROVED', label: 'อนุมัติแล้ว (รอโอน)' },
  { value: 'REFUNDED', label: 'โอนคืนแล้ว' },
  { value: 'REFUND_REJECTED', label: 'ปฏิเสธ' },
  { value: 'ALL', label: 'ทั้งหมด' },
];

type PendingAction = { refund: Refund; kind: 'approve' | 'refunded' } | null;

function AccountingRefundsContent() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<Filter>('REFUND_REQUESTED');
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Refund | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRefunds(await refundsApi.list(filter === 'ALL' ? undefined : filter));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดคำขอคืนเงินไม่สำเร็จ');
    }
  }, [filter]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await load();
      setIsLoading(false);
    })();
  }, [load]);

  const runPending = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'approve') {
        await refundsApi.approve(pending.refund.refund_id);
        showToast(`อนุมัติคืนเงิน REF-${pending.refund.refund_id} แล้ว`);
      } else {
        await refundsApi.markRefunded(pending.refund.refund_id);
        showToast(`บันทึกการโอนคืน REF-${pending.refund.refund_id} แล้ว`);
      }
      setPending(null);
      await load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'ดำเนินการไม่สำเร็จ', 'error');
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!rejectTarget) return;
    try {
      await refundsApi.reject(rejectTarget.refund_id, reason);
      showToast(`ปฏิเสธคำขอคืนเงิน REF-${rejectTarget.refund_id} แล้ว`);
      setRejectTarget(null);
      await load();
    } catch (err) {
      return err instanceof ApiError ? err.message : 'ปฏิเสธคำขอไม่สำเร็จ';
    }
  };

  const viewEvidence = async (id: number) => {
    try {
      await openAuthedFile(refundsApi.evidencePath(id));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'เปิดหลักฐานไม่สำเร็จ', 'error');
    }
  };

  return (
    <ThemedView style={s.container}>
      <SafeAreaView style={s.safeArea} edges={['top']}>
        <PageHeader eyebrow="ACCOUNTING" title="การคืนเงิน" />
        <FilterChips options={FILTERS} value={filter} onChange={setFilter} />

        {isLoading ? (
          <ActivityIndicator size="large" style={s.loading} />
        ) : error ? (
          <ThemedView type="cardBackground" style={s.errorBanner}>
            <ThemedText themeColor="danger">{error}</ThemedText>
          </ThemedView>
        ) : refunds.length === 0 ? (
          <EmptyState title="ไม่มีคำขอคืนเงิน" hint="ยังไม่มีคำขอในสถานะนี้" />
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
            {refunds.map((r) => (
              <ThemedView key={r.refund_id} type="cardBackground" style={[s.card, { borderColor: theme.border }]}>
                <View style={s.cardHeader}>
                  <View style={styles.flex}>
                    <ThemedText type="defaultSemiBold">
                      REF-{r.refund_id} · Order #{r.order_id}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {r.username} · ขอเมื่อ {formatDateTime(r.created_at)}
                    </ThemedText>
                  </View>
                  <RefundStatusBadge status={r.status} />
                </View>

                <MoneyRow label="จำนวนเงินที่ขอคืน" value={formatBaht(r.refund_amount)} bold />
                <MoneyRow label="ยอดที่ลูกค้าชำระ" value={formatBaht(r.paid_amount)} />
                <View style={[s.noteBox, { borderColor: theme.border }]}>
                  <ThemedText type="small">เหตุผล: {r.reason}</ThemedText>
                </View>
                {r.status === 'REFUND_REJECTED' && r.rejected_reason ? (
                  <ThemedText type="small" themeColor="danger">
                    เหตุผลที่ปฏิเสธ: {r.rejected_reason}
                  </ThemedText>
                ) : null}
                {r.approved_by_name ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    อนุมัติโดย {r.approved_by_name} · {formatDateTime(r.approved_at)}
                    {r.refunded_at ? ` · โอนคืนเมื่อ ${formatDateTime(r.refunded_at)}` : ''}
                  </ThemedText>
                ) : null}

                <View style={s.actions}>
                  {r.has_evidence ? (
                    <Pressable style={[s.button, { backgroundColor: theme.backgroundElement }]} onPress={() => viewEvidence(r.refund_id)}>
                      <ThemedText type="smallBold">ดูหลักฐาน</ThemedText>
                    </Pressable>
                  ) : null}
                  {r.status === 'REFUND_REQUESTED' ? (
                    <>
                      <Pressable style={[s.button, { backgroundColor: theme.danger }]} onPress={() => setRejectTarget(r)}>
                        <ThemedText type="smallBold" style={styles.onColor}>
                          ปฏิเสธการคืนเงิน
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        style={[s.button, { backgroundColor: theme.success }]}
                        onPress={() => setPending({ refund: r, kind: 'approve' })}>
                        <ThemedText type="smallBold" style={styles.onColor}>
                          อนุมัติคืนเงิน
                        </ThemedText>
                      </Pressable>
                    </>
                  ) : null}
                  {r.status === 'REFUND_APPROVED' ? (
                    <Pressable
                      style={[s.button, { backgroundColor: theme.primary }]}
                      onPress={() => setPending({ refund: r, kind: 'refunded' })}>
                      <ThemedText type="smallBold" themeColor="primaryText">
                        บันทึกว่าโอนคืนแล้ว
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              </ThemedView>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>

      <ConfirmDialog
        visible={pending !== null}
        title={pending?.kind === 'approve' ? 'อนุมัติคืนเงิน?' : 'บันทึกว่าโอนคืนแล้ว?'}
        message={
          pending
            ? pending.kind === 'approve'
              ? `อนุมัติคืนเงิน ${formatBaht(pending.refund.refund_amount)} ให้ ${pending.refund.username} (Order #${pending.refund.order_id}) ยอดนี้จะถูกหักจากรายรับในรายงานการเงิน`
              : `ยืนยันว่าได้โอนเงิน ${formatBaht(pending.refund.refund_amount)} คืนให้ ${pending.refund.username} แล้ว`
            : ''
        }
        confirmLabel="ยืนยัน"
        destructive={false}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={runPending}
      />
      <ReasonDialog
        visible={rejectTarget !== null}
        title={`ปฏิเสธการคืนเงิน REF-${rejectTarget?.refund_id ?? ''}`}
        hint="ลูกค้าจะเห็นเหตุผลนี้ในหน้าคำสั่งซื้อ"
        placeholder="เช่น เกินระยะเวลาการขอคืนเงิน"
        confirmLabel="ปฏิเสธ"
        onCancel={() => setRejectTarget(null)}
        onConfirm={handleReject}
      />
    </ThemedView>
  );
}

export default function AccountingRefundsScreen() {
  return (
    <RequireAccounting>
      <AccountingRefundsContent />
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
  onColor: {
    color: '#FFFFFF',
  },
});
