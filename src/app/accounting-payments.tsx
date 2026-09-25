// src/app/accounting-payments.tsx — Accounting: Payment verification
// Queue of submitted slips. "ตรวจสอบ" opens the full detail (order, items,
// amounts, slip image) with confirm / reject. Confirm and reject are enforced
// server-side (accounting-only, only from PAID_PENDING_VERIFICATION, row-
// locked so a double submit can't confirm twice) — this screen just calls them.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterChips, MoneyRow, PageHeader, accountingStyles as s } from '@/components/accounting-ui';
import { AuthedImage } from '@/components/authed-image';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { PaymentStatusBadge } from '@/components/payment-status-badge';
import { ReasonDialog } from '@/components/reason-dialog';
import { RequireAccounting } from '@/components/role-guard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useToast } from '@/context/toast-context';
import { useTheme } from '@/hooks/use-theme';
import {
  ApiError,
  downloadAuthedFile,
  formatBaht,
  openAuthedFile,
  PAYMENT_METHOD_LABELS,
  paymentsApi,
  type Payment,
  type PaymentDetail,
} from '@/lib/api';
import { formatDateTime } from '@/lib/format';

type Filter = 'PAID_PENDING_VERIFICATION' | 'PAID' | 'PAYMENT_REJECTED' | 'ALL';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'PAID_PENDING_VERIFICATION', label: 'รอตรวจสอบ' },
  { value: 'PAID', label: 'ยืนยันแล้ว' },
  { value: 'PAYMENT_REJECTED', label: 'ปฏิเสธแล้ว' },
  { value: 'ALL', label: 'ทั้งหมด' },
];

function AccountingPaymentsContent() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<Filter>('PAID_PENDING_VERIFICATION');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPayments(await paymentsApi.list(filter === 'ALL' ? undefined : filter));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดรายการชำระเงินไม่สำเร็จ');
    }
  }, [filter]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await load();
      setIsLoading(false);
    })();
  }, [load]);

  const openDetail = async (id: number) => {
    setDetailLoadingId(id);
    try {
      setDetail(await paymentsApi.get(id));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'โหลดรายละเอียดไม่สำเร็จ', 'error');
    } finally {
      setDetailLoadingId(null);
    }
  };

  const viewSlip = async (id: number) => {
    try {
      await openAuthedFile(paymentsApi.slipPath(id));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'เปิดสลิปไม่สำเร็จ', 'error');
    }
  };

  const handleConfirm = async () => {
    if (!detail) return;
    setConfirming(true);
    try {
      const result = await paymentsApi.confirm(detail.payment_id);
      showToast(`ยืนยันการชำระเงิน Order #${detail.order_id} แล้ว · ใบเสร็จ ${result.receipt_no}`);
      setConfirmOpen(false);
      setDetail(null);
      await load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'ยืนยันการชำระเงินไม่สำเร็จ', 'error');
      setConfirmOpen(false);
    } finally {
      setConfirming(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!detail) return;
    try {
      await paymentsApi.reject(detail.payment_id, reason);
      showToast(`ปฏิเสธการชำระเงิน Order #${detail.order_id} แล้ว`);
      setRejectOpen(false);
      setDetail(null);
      await load();
    } catch (err) {
      return err instanceof ApiError ? err.message : 'ปฏิเสธการชำระเงินไม่สำเร็จ';
    }
  };

  const downloadReceipt = async () => {
    if (!detail) return;
    setDownloading(true);
    try {
      await downloadAuthedFile(paymentsApi.receiptPath(detail.payment_id), `receipt-${detail.receipt_no}.pdf`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'ดาวน์โหลดใบเสร็จไม่สำเร็จ', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const isPending = detail?.payment_status === 'PAID_PENDING_VERIFICATION';

  return (
    <ThemedView style={s.container}>
      <SafeAreaView style={s.safeArea} edges={['top']}>
        <PageHeader eyebrow="ACCOUNTING" title="การชำระเงิน" />
        <FilterChips options={FILTERS} value={filter} onChange={setFilter} />

        {isLoading ? (
          <ActivityIndicator size="large" style={s.loading} />
        ) : error ? (
          <ThemedView type="cardBackground" style={s.errorBanner}>
            <ThemedText themeColor="danger">{error}</ThemedText>
          </ThemedView>
        ) : payments.length === 0 ? (
          <EmptyState title="ไม่มีรายการ" hint="ยังไม่มีการชำระเงินในสถานะนี้" />
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
            {payments.map((p) => (
              <ThemedView key={p.payment_id} type="cardBackground" style={[s.card, { borderColor: theme.border }]}>
                <View style={s.cardHeader}>
                  <View style={styles.flex}>
                    <ThemedText type="defaultSemiBold">
                      Order #{p.order_id} · {p.username}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      ส่งเมื่อ {formatDateTime(p.created_at)} · {PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method}
                    </ThemedText>
                  </View>
                  <PaymentStatusBadge status={p.payment_status} />
                </View>
                <MoneyRow label="ยอดเงิน" value={formatBaht(p.amount)} bold />
                {p.payment_status === 'PAYMENT_REJECTED' && p.rejected_reason ? (
                  <ThemedText type="small" themeColor="danger">
                    เหตุผลที่ปฏิเสธ: {p.rejected_reason}
                  </ThemedText>
                ) : null}
                {p.verified_by_name ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    โดย {p.verified_by_name} · {formatDateTime(p.verified_at)}
                  </ThemedText>
                ) : null}
                <View style={s.actions}>
                  <Pressable style={[s.button, { backgroundColor: theme.backgroundElement }]} onPress={() => viewSlip(p.payment_id)}>
                    <ThemedText type="smallBold">ดู Slip</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[s.button, { backgroundColor: p.payment_status === 'PAID_PENDING_VERIFICATION' ? theme.primary : theme.backgroundElement }]}
                    disabled={detailLoadingId !== null}
                    onPress={() => openDetail(p.payment_id)}>
                    {detailLoadingId === p.payment_id ? (
                      <ActivityIndicator />
                    ) : (
                      <ThemedText type="smallBold" themeColor={p.payment_status === 'PAID_PENDING_VERIFICATION' ? 'primaryText' : 'text'}>
                        {p.payment_status === 'PAID_PENDING_VERIFICATION' ? 'ตรวจสอบ' : 'ดู'}
                      </ThemedText>
                    )}
                  </Pressable>
                </View>
              </ThemedView>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>

      <Modal visible={detail !== null} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={s.modalBackdrop}>
          <ThemedView type="cardBackground" style={s.modalCard}>
            {detail ? (
              <ScrollView contentContainerStyle={s.modalContent}>
                <View style={s.cardHeader}>
                  <View style={styles.flex}>
                    <ThemedText type="subtitle">Order #{detail.order_id}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      ลูกค้า {detail.username} · สั่งเมื่อ {formatDateTime(detail.order.order_date)}
                    </ThemedText>
                  </View>
                  <View style={s.badges}>
                    <PaymentStatusBadge status={detail.payment_status} />
                    <OrderStatusBadge status={detail.order.status} />
                  </View>
                </View>

                <View style={[s.divided, { borderTopColor: theme.border }]}>
                  {detail.order.items.map((item) => (
                    <MoneyRow
                      key={item.product_id}
                      label={`${item.name} × ${item.quantity} (${formatBaht(item.price)})`}
                      value={formatBaht(item.subtotal)}
                    />
                  ))}
                </View>

                <View style={[s.divided, { borderTopColor: theme.border }]}>
                  <MoneyRow label="ยอดสินค้า" value={formatBaht(detail.order.product_amount)} />
                  <MoneyRow label="ค่าส่ง" value={formatBaht(detail.order.shipping_fee)} />
                  <MoneyRow
                    label="ส่วนลด"
                    value={detail.order.discount > 0 ? `-${formatBaht(detail.order.discount)}` : formatBaht(0)}
                  />
                  <MoneyRow label="ยอดสุทธิที่ต้องได้รับ" value={formatBaht(detail.amount)} bold />
                </View>

                <View style={[s.divided, { borderTopColor: theme.border }]}>
                  <MoneyRow label="วิธีชำระเงิน" value={PAYMENT_METHOD_LABELS[detail.payment_method] ?? detail.payment_method} />
                  <MoneyRow label="วันเวลาที่ลูกค้าแจ้งโอน" value={detail.paid_at ? formatDateTime(detail.paid_at) : '-'} />
                  <MoneyRow label="เลขอ้างอิง" value={detail.transaction_reference || '-'} />
                  <MoneyRow label="ส่งสลิปเมื่อ" value={formatDateTime(detail.created_at)} />
                  {detail.receipt_no ? <MoneyRow label="เลขที่ใบเสร็จ" value={detail.receipt_no} /> : null}
                </View>

                <ThemedText type="smallBold">Slip</ThemedText>
                <Pressable onPress={() => viewSlip(detail.payment_id)}>
                  <AuthedImage path={paymentsApi.slipPath(detail.payment_id)} style={styles.slip} />
                </Pressable>
                <ThemedText type="small" themeColor="textSecondary">
                  ตรวจยอดเงิน ชื่อผู้รับ และวันเวลาในสลิปให้ตรงกับข้อมูลด้านบนก่อนยืนยัน · แตะรูปเพื่อเปิดขนาดเต็ม
                </ThemedText>

                {detail.rejected_reason ? (
                  <ThemedText type="small" themeColor="danger">
                    เหตุผลที่ปฏิเสธ: {detail.rejected_reason}
                  </ThemedText>
                ) : null}

                <View style={s.actions}>
                  {isPending ? (
                    <>
                      <Pressable style={[s.button, { backgroundColor: theme.danger }]} onPress={() => setRejectOpen(true)}>
                        <ThemedText type="smallBold" style={styles.onColor}>
                          ปฏิเสธการชำระเงิน
                        </ThemedText>
                      </Pressable>
                      <Pressable style={[s.button, { backgroundColor: theme.success }]} onPress={() => setConfirmOpen(true)}>
                        <ThemedText type="smallBold" style={styles.onColor}>
                          ยืนยันการชำระเงิน
                        </ThemedText>
                      </Pressable>
                    </>
                  ) : null}
                  {detail.payment_status === 'PAID' ? (
                    <Pressable
                      style={[s.button, { backgroundColor: theme.primary }, downloading && s.disabled]}
                      disabled={downloading}
                      onPress={downloadReceipt}>
                      {downloading ? (
                        <ActivityIndicator color={theme.primaryText} />
                      ) : (
                        <ThemedText type="smallBold" themeColor="primaryText">
                          ดาวน์โหลดใบเสร็จ PDF
                        </ThemedText>
                      )}
                    </Pressable>
                  ) : null}
                </View>
                <Pressable style={[s.button, { backgroundColor: theme.backgroundElement }]} onPress={() => setDetail(null)}>
                  <ThemedText type="smallBold">ปิด</ThemedText>
                </Pressable>
              </ScrollView>
            ) : null}
          </ThemedView>
        </View>
      </Modal>

      <ConfirmDialog
        visible={confirmOpen}
        title="ยืนยันการชำระเงิน?"
        message={
          detail
            ? `ยืนยันว่าได้รับเงิน ${formatBaht(detail.amount)} สำหรับ Order #${detail.order_id} แล้ว ระบบจะออกใบเสร็จและปล่อยให้ร้านดำเนินการคำสั่งซื้อต่อ`
            : ''
        }
        confirmLabel="ยืนยัน"
        destructive={false}
        busy={confirming}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
      <ReasonDialog
        visible={rejectOpen}
        title={`ปฏิเสธการชำระเงิน Order #${detail?.order_id ?? ''}`}
        hint="ลูกค้าจะเห็นเหตุผลนี้และสามารถส่งสลิปใหม่ได้"
        placeholder="เช่น ยอดเงินในสลิปไม่ตรงกับยอดคำสั่งซื้อ"
        confirmLabel="ปฏิเสธ"
        onCancel={() => setRejectOpen(false)}
        onConfirm={handleReject}
      />
    </ThemedView>
  );
}

export default function AccountingPaymentsScreen() {
  return (
    <RequireAccounting>
      <AccountingPaymentsContent />
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
  slip: {
    width: '100%',
    height: 420,
  },
  onColor: {
    color: '#FFFFFF',
  },
});
