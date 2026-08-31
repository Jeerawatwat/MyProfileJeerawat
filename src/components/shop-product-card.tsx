// src/components/shop-product-card.tsx
// User-facing product card for the Shop screen — image, name, price, live
// stock, and the two required actions: "เพิ่มลงตะกร้า" (Add to Cart) and
// "ซื้อเลย" (Buy Now). Tapping the card itself opens the full detail sheet
// (description + quantity picker). No edit/delete here — that's Admin-only
// and lives in product-card.tsx / products.tsx instead.
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { StockBadge } from './stock-badge';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import type { Product } from '@/lib/api';
import { formatBaht, resolveImageUrl } from '@/lib/api';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ShopProductCardProps = {
  product: Product;
  onOpenDetail: () => void;
  onAddToCart: () => void;
  onBuyNow: () => void;
};

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || '?';
}

export function ShopProductCard({ product, onOpenDetail, onAddToCart, onBuyNow }: ShopProductCardProps) {
  const theme = useTheme();
  const photoUrl = resolveImageUrl(product.image_url);
  const isOut = product.stock <= 0;

  return (
    <ThemedView type="cardBackground" style={[styles.card, { borderColor: theme.border }]}>
      <Pressable onPress={onOpenDetail}>
        <View style={[styles.imageWrapper, { backgroundColor: theme.backgroundElement }]}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.image} contentFit="cover" transition={200} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <ThemedText type="subtitle" themeColor="textSecondary">
                {initials(product.name)}
              </ThemedText>
            </View>
          )}
          {isOut && (
            <View style={styles.soldOutOverlay}>
              <View style={styles.soldOutPill}>
                <ThemedText type="small" style={styles.soldOutText}>
                  สินค้าหมด
                </ThemedText>
              </View>
            </View>
          )}
        </View>

        <View style={styles.info}>
          <ThemedText type="defaultSemiBold" numberOfLines={2} style={styles.name}>
            {product.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {product.category}
          </ThemedText>
          <View style={styles.footerRow}>
            <ThemedText type="smallBold" style={styles.price}>
              {formatBaht(product.price)}
            </ThemedText>
            <StockBadge stock={product.stock} />
          </View>
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          onPress={onAddToCart}
          disabled={isOut}
          style={[styles.actionButton, { backgroundColor: theme.backgroundElement }, isOut && styles.actionDisabled]}>
          <ThemedText type="small" style={styles.actionLabel}>
            🛒 เพิ่มลงตะกร้า
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={onBuyNow}
          disabled={isOut}
          style={[styles.actionButton, { backgroundColor: theme.primary }, isOut && styles.actionDisabled]}>
          <ThemedText type="small" themeColor="primaryText" style={styles.actionLabel}>
            ซื้อเลย
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#28220C',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  imageWrapper: {
    position: 'relative',
    height: 140,
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
  soldOutOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(251,248,241,.66)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldOutPill: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    backgroundColor: '#1A1A17',
    borderRadius: 9,
  },
  soldOutText: {
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 0.6,
    fontSize: 11,
  },
  info: {
    padding: Spacing.three,
    gap: 3,
  },
  name: {
    minHeight: 36,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  price: {
    fontSize: 15.5,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  actionButton: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontWeight: '700',
    fontSize: 12.5,
  },
  actionDisabled: {
    opacity: 0.4,
  },
});
