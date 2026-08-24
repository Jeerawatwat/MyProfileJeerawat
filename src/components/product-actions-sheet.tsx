// src/components/product-actions-sheet.tsx
// Bottom sheet opened from the "···" button on a product card — Edit / Delete /
// Cancel. Purely a UI convenience wrapper around the same onEdit/onDelete
// callbacks products.tsx already wires to the real API.
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import type { Product } from '@/lib/api';
import { formatBaht } from '@/lib/api';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ProductActionsSheetProps = {
  product: Product | null;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
};

export function ProductActionsSheet({ product, onEdit, onDelete, onClose }: ProductActionsSheetProps) {
  const theme = useTheme();
  return (
    <Modal visible={!!product} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ThemedView type="cardBackground" style={styles.sheet}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          {product && (
            <View style={styles.header}>
              <ThemedText type="defaultSemiBold" numberOfLines={1}>
                {product.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {product.category} · {formatBaht(product.price)} · stock {product.stock}
              </ThemedText>
            </View>
          )}
          <Pressable
            onPress={onEdit}
            style={[styles.action, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">Edit product</ThemedText>
          </Pressable>
          <Pressable onPress={onDelete} style={[styles.action, styles.deleteAction]}>
            <ThemedText type="smallBold" themeColor="danger">
              Delete product
            </ThemedText>
          </Pressable>
          <Pressable onPress={onClose} style={styles.cancelAction}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Cancel
            </ThemedText>
          </Pressable>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26,26,23,.38)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: Spacing.three,
    paddingBottom: Spacing.five,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.three,
  },
  header: {
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.three,
    gap: 2,
  },
  action: {
    width: '100%',
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: 16,
    marginBottom: Spacing.two,
  },
  deleteAction: {
    backgroundColor: '#D33A3F18',
  },
  cancelAction: {
    width: '100%',
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
