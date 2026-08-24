import { StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { getStockStatus } from '@/lib/api';
import { Spacing, ThemeColor } from '@/constants/theme';

const toneBackground: Record<'success' | 'warning' | 'danger', string> = {
  success: '#1F7A4622',
  warning: '#96700A26',
  danger: '#D33A3F22',
};

export function StockBadge({ stock }: { stock: number }) {
  const { label, tone } = getStockStatus(stock);
  return (
    <View style={[styles.badge, { backgroundColor: toneBackground[tone] }]}>
      <ThemedText type="small" themeColor={tone as ThemeColor} style={styles.text}>
        {label}
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
