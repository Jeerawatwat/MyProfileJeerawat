// src/components/refund-request-sheet.tsx
// Buyer's refund request for a PAID order. The max shown here is only a hint
// (paid amount minus refunds already requested/approved); the server
// re-checks the same cap under a row lock and rejects anything over it.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { FilePickButton } from './file-pick-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, formatBaht, refundsApi, type Order } from '@/lib/api';

const RESERVING = ['REFUND_REQUESTED', 'REFUND_APPROVED', 'REFUNDED'];

export function refundableAmount(order: Order): number {
  if (order.payment_status !== 'PAID' || !order.payment || order.payment.payment_status !== 'PAID') return 0;
  const usedSatang = order.refunds
    .filter((r) => RESERVING.includes(r.status))
    .reduce((sum, r) => sum + Math.round(r.refund_amount * 100), 0);
  return Math.max(Math.round(order.payment.amount * 100) - usedSatang, 0) / 100;
}

export function RefundRequestSheet({
  order,
  onClose,
  onSubmitted,
}: {
  order: Order | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const theme = useTheme();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const max = order ? refundableAmount(order) : 0;

  useEffect(() => {
    if (!order) return;
    setAmount(String(refundableAmount(order)));
    setReason('');
    setEvidence(null);
    setError(null);
  }, [order]);

  const submit = async () => {
    if (!order) return;
    const trimmed = amount.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed) || Number(trimmed) <= 0) {
      setError('จำนวนเงินต้องเป็นตัวเลขมากกว่า 0 (ทศนิยมไม่เกิน 2 ตำแหน่ง)');
      return;
    }
    if (Number(trimmed) > max) {
      setError(`ขอคืนได้ไม่เกิน ${formatBaht(max)}`);
      return;
    }
    if (!reason.trim()) {
      setError('กรุณาระบุเหตุผลที่ขอคืนเงิน');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await refundsApi.request({ order_id: order.order_id, refund_amount: trimmed, reason: reason.trim(), evidence });
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ส่งคำขอคืนเงินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={order !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView type="cardBackground" style={styles.card}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="subtitle">ขอคืนเงิน Order #{order?.order_id}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              ยอดที่ขอคืนได้สูงสุด {formatBaht(max)} · ฝ่ายบัญชีจะตรวจสอบและแจ้งผลในหน้าคำสั่งซื้อ
            </ThemedText>

            <View style={styles.field}>
              <ThemedText type="smallBold">จำนวนเงินที่ขอคืน (บาท)</ThemedText>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                style={[styles.input, { borderColor: theme.border, color: theme.text }]}
                editable={!submitting}
              />
            </View>

            <View style={styles.field}>
              <ThemedText type="smallBold">เหตุผล</ThemedText>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="เช่น ได้รับสินค้าไม่ครบ"
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={3}
                style={[styles.input, styles.textArea, { borderColor: theme.border, color: theme.text }]}
                editable={!submitting}
              />
            </View>

            <View style={styles.field}>
              <ThemedText type="smallBold">หลักฐาน (ถ้ามี)</ThemedText>
              <FilePickButton
                label="แนบรูปหลักฐาน"
                accept="image/png,image/jpeg,image/webp"
                file={evidence}
                onPick={setEvidence}
                disabled={submitting}
              />
            </View>

            {error ? (
              <ThemedText type="small" themeColor="danger">
                {error}
              </ThemedText>
            ) : null}

            <View style={styles.actions}>
              <Pressable style={[styles.button, { backgroundColor: theme.backgroundElement }]} onPress={onClose} disabled={submitting}>
                <ThemedText type="smallBold">ย้อนกลับ</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: theme.primary }, submitting && styles.disabled]}
                onPress={submit}
                disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color={theme.primaryText} />
                ) : (
                  <ThemedText type="smallBold" themeColor="primaryText">
                    ส่งคำขอคืนเงิน
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
  field: {
    gap: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
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
