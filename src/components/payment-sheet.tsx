// src/components/payment-sheet.tsx
// Buyer's "ชำระเงิน" flow for one order: amount due -> shop QR -> transfer in
// their banking app -> attach slip -> submit. Submitting only ever creates a
// payment that is PAID_PENDING_VERIFICATION; the order becomes PAID only when
// accounting confirms it on the server. The amount shown is the order's own
// total from the API — the client never sends an amount.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AuthedImage } from './authed-image';
import { FilePickButton } from './file-pick-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, formatBaht, paymentsApi, type Order } from '@/lib/api';
import { toYmd } from '@/lib/format';

function nowLocalDateTime() {
  const d = new Date();
  return `${toYmd(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function PaymentSheet({
  order,
  onClose,
  onSubmitted,
}: {
  order: Order | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const theme = useTheme();
  const [qr, setQr] = useState<{ configured: boolean; account_name: string | null } | null>(null);
  const [slip, setSlip] = useState<File | null>(null);
  const [paidAt, setPaidAt] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!order) return;
    setSlip(null);
    setPaidAt(nowLocalDateTime());
    setReference('');
    setError(null);
    paymentsApi
      .qrInfo()
      .then(setQr)
      .catch(() => setQr({ configured: false, account_name: null }));
  }, [order]);

  const submit = async () => {
    if (!order) return;
    if (!slip) {
      setError('กรุณาแนบรูปสลิปการโอนเงิน');
      return;
    }
    const trimmedPaidAt = paidAt.trim();
    if (trimmedPaidAt && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trimmedPaidAt)) {
      setError('วันเวลาที่โอนต้องอยู่ในรูปแบบ YYYY-MM-DD HH:mm');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await paymentsApi.submit({
        order_id: order.order_id,
        slip,
        paid_at: trimmedPaidAt || undefined,
        transaction_reference: reference.trim() || undefined,
      });
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ส่งหลักฐานการชำระเงินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  };

  const rejectedReason = order?.payment_status === 'PAYMENT_REJECTED' ? order.payment?.rejected_reason : null;

  return (
    <Modal visible={order !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView type="cardBackground" style={styles.card}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="subtitle">ชำระเงิน Order #{order?.order_id}</ThemedText>

            {rejectedReason ? (
              <View style={[styles.notice, { borderColor: '#D33A3F55' }]}>
                <ThemedText type="small" themeColor="danger">
                  สลิปก่อนหน้าถูกปฏิเสธ: {rejectedReason} — กรุณาแนบสลิปใหม่
                </ThemedText>
              </View>
            ) : null}

            {order ? (
              <View style={[styles.amountBox, { backgroundColor: theme.backgroundElement }]}>
                <Row label="ยอดสินค้า" value={formatBaht(order.product_amount)} />
                <Row label="ค่าส่ง" value={formatBaht(order.shipping_fee)} />
                <Row label="ส่วนลด" value={order.discount > 0 ? `-${formatBaht(order.discount)}` : formatBaht(0)} />
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <View style={styles.row}>
                  <ThemedText type="defaultSemiBold">ยอดที่ต้องชำระ</ThemedText>
                  <ThemedText type="title" style={styles.total}>
                    {formatBaht(order.total_amount)}
                  </ThemedText>
                </View>
              </View>
            ) : null}

            <View style={styles.qrSection}>
              <ThemedText type="smallBold">1. สแกน QR ด้วยแอปธนาคาร</ThemedText>
              {qr === null ? (
                <ActivityIndicator />
              ) : qr.configured ? (
                <>
                  <AuthedImage path={paymentsApi.qrImagePath} style={styles.qr} />
                  {qr.account_name ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      ชื่อบัญชี: {qr.account_name}
                    </ThemedText>
                  ) : null}
                </>
              ) : (
                <ThemedText type="small" themeColor="danger">
                  ร้านค้ายังไม่ได้ตั้งค่า QR สำหรับชำระเงิน กรุณาติดต่อร้านค้า
                </ThemedText>
              )}
              <ThemedText type="small" themeColor="textSecondary">
                2. โอนเงินให้ตรงกับยอด {order ? formatBaht(order.total_amount) : ''}
              </ThemedText>
            </View>

            <View style={styles.field}>
              <ThemedText type="smallBold">3. แนบสลิปการโอนเงิน</ThemedText>
              <FilePickButton
                label="เลือกรูปสลิป (PNG, JPEG, WEBP)"
                accept="image/png,image/jpeg,image/webp"
                file={slip}
                onPick={(file) => {
                  setSlip(file);
                  if (error) setError(null);
                }}
                disabled={submitting}
              />
            </View>

            <View style={styles.field}>
              <ThemedText type="small" themeColor="textSecondary">
                วันเวลาที่โอน (YYYY-MM-DD HH:mm)
              </ThemedText>
              <TextInput
                value={paidAt}
                onChangeText={setPaidAt}
                placeholder="2026-09-25 14:30"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { borderColor: theme.border, color: theme.text }]}
                editable={!submitting}
              />
              <ThemedText type="small" themeColor="textSecondary">
                เลขอ้างอิงการโอน (ถ้ามี)
              </ThemedText>
              <TextInput
                value={reference}
                onChangeText={setReference}
                placeholder="เช่น 2026092514301234"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { borderColor: theme.border, color: theme.text }]}
                editable={!submitting}
                maxLength={100}
              />
            </View>

            {error ? (
              <ThemedText type="small" themeColor="danger">
                {error}
              </ThemedText>
            ) : null}

            <View style={styles.actions}>
              <Pressable style={[styles.button, { backgroundColor: theme.backgroundElement }]} onPress={onClose} disabled={submitting}>
                <ThemedText type="smallBold">ไว้ทีหลัง</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: theme.primary }, submitting && styles.disabled]}
                onPress={submit}
                disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color={theme.primaryText} />
                ) : (
                  <ThemedText type="smallBold" themeColor="primaryText">
                    ส่งหลักฐานการชำระเงิน
                  </ThemedText>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '92%',
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  notice: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    padding: Spacing.two,
  },
  amountBox: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.one,
  },
  total: {
    fontSize: 24,
    lineHeight: 30,
  },
  qrSection: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  qr: {
    width: 240,
    height: 240,
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  button: {
    flex: 1,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.7,
  },
});
