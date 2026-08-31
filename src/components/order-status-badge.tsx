// src/components/order-status-badge.tsx
// Renders one of the 5 real order statuses with a distinct color per stage:
// รอดำเนินการ (pending) -> กำลังจัดเตรียมสินค้า (preparing) -> จัดส่งแล้ว (shipped)
// -> สำเร็จ (completed), or ยกเลิก (cancelled). These are exactly the values
// backend/routes/orders.routes.js accepts/returns — never invented here.
import { StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  'รอดำเนินการ': { bg: '#96700A26', fg: '#96700A' },
  'กำลังจัดเตรียมสินค้า': { bg: '#2563EB22', fg: '#2563EB' },
  'จัดส่งแล้ว': { bg: '#7C3AED22', fg: '#7C3AED' },
  'สำเร็จ': { bg: '#1F7A4622', fg: '#1F7A46' },
  'ยกเลิก': { bg: '#D33A3F22', fg: '#D33A3F' },
};

const FALLBACK_STYLE = { bg: '#88888822', fg: '#888888' };

export function OrderStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? FALLBACK_STYLE;
  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <ThemedText type="small" style={[styles.text, { color: style.fg }]}>
        {status}
      </ThemedText>
    </View>
  );
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
