// src/components/payment-status-badge.tsx
// Badges for the money side of an order — payment status and refund status.
// Same pill look as order-status-badge.tsx (the fulfilment status); labels
// come from PAYMENT_STATUS_LABELS / REFUND_STATUS_LABELS in lib/api.ts, which
// mirror exactly the values the backend stores.
import { StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { PAYMENT_STATUS_LABELS, REFUND_STATUS_LABELS } from '@/lib/api';

const TONES = {
  pending: { bg: '#96700A26', fg: '#96700A' },
  review: { bg: '#2563EB22', fg: '#2563EB' },
  success: { bg: '#1F7A4622', fg: '#1F7A46' },
  danger: { bg: '#D33A3F22', fg: '#D33A3F' },
  neutral: { bg: '#7C3AED22', fg: '#7C3AED' },
};

const PAYMENT_TONE: Record<string, keyof typeof TONES> = {
  PENDING_PAYMENT: 'pending',
  PAID_PENDING_VERIFICATION: 'review',
  PAID: 'success',
  PAYMENT_REJECTED: 'danger',
  REFUNDED: 'neutral',
};

const REFUND_TONE: Record<string, keyof typeof TONES> = {
  REFUND_REQUESTED: 'review',
  REFUND_APPROVED: 'pending',
  REFUND_REJECTED: 'danger',
  REFUNDED: 'success',
};

function Pill({ label, tone }: { label: string; tone: keyof typeof TONES }) {
  const style = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <ThemedText type="small" style={[styles.text, { color: style.fg }]}>
        {label}
      </ThemedText>
    </View>
  );
}

export function PaymentStatusBadge({ status }: { status: string }) {
  return <Pill label={PAYMENT_STATUS_LABELS[status] ?? status} tone={PAYMENT_TONE[status] ?? 'pending'} />;
}

export function RefundStatusBadge({ status }: { status: string }) {
  return <Pill label={REFUND_STATUS_LABELS[status] ?? status} tone={REFUND_TONE[status] ?? 'pending'} />;
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.four,
  },
  text: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
});
