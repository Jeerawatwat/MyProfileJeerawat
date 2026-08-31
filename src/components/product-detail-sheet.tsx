// src/components/product-detail-sheet.tsx
// Full product detail — image, name, price, live stock, description, a
// quantity stepper (clamped to stock), and the required Add to Cart / Buy Now
// actions. Opened by tapping a card on the Shop screen.
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { StockBadge } from './stock-badge';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import type { Product } from '@/lib/api';
import { formatBaht, resolveImageUrl } from '@/lib/api';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ProductDetailSheetProps = {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (quantity: number) => void;
  onBuyNow: (quantity: number) => void;
};

export function ProductDetailSheet({ product, onClose, onAddToCart, onBuyNow }: ProductDetailSheetProps) {
  const theme = useTheme();
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (product) setQuantity(1);
  }, [product]);

  if (!product) {
    return <Modal visible={false} transparent />;
  }

  const photoUrl = resolveImageUrl(product.image_url);
  const isOut = product.stock <= 0;
  const clampedQuantity = Math.min(Math.max(quantity, 1), Math.max(product.stock, 1));

  return (
    <Modal visible={!!product} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ThemedView type="cardBackground" style={styles.card}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={[styles.imageWrapper, { backgroundColor: theme.backgroundElement }]}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.image} contentFit="cover" />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <ThemedText type="title" themeColor="textSecondary">
                    {product.name.slice(0, 1).toUpperCase()}
                  </ThemedText>
                </View>
              )}
            </View>

            <View style={styles.titleRow}>
              <ThemedText type="subtitle" style={styles.name}>
                {product.name}
              </ThemedText>
              <StockBadge stock={product.stock} />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {product.category}
            </ThemedText>
            <ThemedText type="title" style={styles.price}>
              {formatBaht(product.price)}
            </ThemedText>

            {product.description ? (
              <View style={styles.descriptionBox}>
                <ThemedText type="smallBold">รายละเอียดสินค้า</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {product.description}
                </ThemedText>
              </View>
            ) : null}

            {!isOut && (
              <View style={styles.quantityRow}>
                <ThemedText type="smallBold">จำนวน</ThemedText>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                    style={[styles.stepButton, { backgroundColor: theme.backgroundElement }]}>
                    <ThemedText type="defaultSemiBold">−</ThemedText>
                  </Pressable>
                  <ThemedText type="defaultSemiBold" style={styles.stepValue}>
                    {clampedQuantity}
                  </ThemedText>
                  <Pressable
                    onPress={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                    style={[styles.stepButton, { backgroundColor: theme.backgroundElement }]}>
                    <ThemedText type="defaultSemiBold">+</ThemedText>
                  </Pressable>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  เหลือ {product.stock} ชิ้น
                </ThemedText>
              </View>
            )}

            <View style={styles.actions}>
              <Pressable
                onPress={() => onAddToCart(clampedQuantity)}
                disabled={isOut}
                style={[styles.button, { backgroundColor: theme.backgroundElement }, isOut && styles.buttonDisabled]}>
                <ThemedText type="smallBold">🛒 เพิ่มลงตะกร้า</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => onBuyNow(clampedQuantity)}
                disabled={isOut}
                style={[styles.button, { backgroundColor: theme.primary }, isOut && styles.buttonDisabled]}>
                <ThemedText type="smallBold" themeColor="primaryText">
                  ซื้อเลย
                </ThemedText>
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
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    maxHeight: '90%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: Spacing.three,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.one,
  },
  scrollContent: {
    padding: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  imageWrapper: {
    height: 220,
    borderRadius: Spacing.three,
    overflow: 'hidden',
    marginBottom: Spacing.two,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  name: {
    flex: 1,
  },
  price: {
    marginTop: Spacing.one,
  },
  descriptionBox: {
    marginTop: Spacing.two,
    gap: Spacing.half,
  },
  quantityRow: {
    marginTop: Spacing.three,
    gap: Spacing.one,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    minWidth: 28,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  button: {
    flex: 1,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
