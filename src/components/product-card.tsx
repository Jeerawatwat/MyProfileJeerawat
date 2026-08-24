import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { StockBadge } from './stock-badge';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import type { Product } from '@/lib/api';
import { formatBaht, resolveImageUrl } from '@/lib/api';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ProductCardProps = {
  product: Product;
  index?: number;
  layout?: 'grid' | 'list';
  onEdit: () => void;
  onDelete: () => void;
  onMenu: () => void;
};

// Deterministic placeholder so every card has a visual anchor when it has no photo.
function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || '?';
}

export function ProductCard({ product, index = 0, layout = 'grid', onMenu }: ProductCardProps) {
  const theme = useTheme();
  const photoUrl = resolveImageUrl(product.image_url);
  const isOut = product.stock <= 0;
  const entrance = useSharedValue(0);
  const isList = layout === 'list';

  useEffect(() => {
    // Small staggered fade+rise on mount — a subtle "the list is alive" touch
    // rather than everything popping in at once.
    entrance.value = withDelay(Math.min(index, 10) * 40, withTiming(1, { duration: 260 }));
  }, [entrance, index]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [{ translateY: (1 - entrance.value) * 12 }],
  }));

  return (
    <Animated.View style={entranceStyle}>
      <ThemedView
        type="cardBackground"
        style={[styles.card, isList && styles.cardList, { borderColor: theme.border }]}>
        <View style={[styles.imageWrapper, isList ? styles.imageWrapperList : styles.imageWrapperGrid, { backgroundColor: theme.backgroundElement }]}>
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
                  SOLD OUT
                </ThemedText>
              </View>
            </View>
          )}
        </View>

        <View style={styles.info}>
          <View style={styles.infoTop}>
            <ThemedText type="defaultSemiBold" numberOfLines={2} style={styles.name}>
              {product.name}
            </ThemedText>
            <Pressable
              onPress={onMenu}
              hitSlop={8}
              style={[styles.menuButton, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
              <View style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
              <View style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
            </Pressable>
          </View>
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
      </ThemedView>
    </Animated.View>
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
  cardList: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  imageWrapper: {
    position: 'relative',
  },
  imageWrapperGrid: {
    height: 140,
  },
  imageWrapperList: {
    width: 110,
    flexGrow: 0,
    flexShrink: 0,
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
    flex: 1,
    padding: Spacing.three,
    gap: 3,
  },
  infoTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  name: {
    flex: 1,
  },
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2.5,
    width: 26,
    height: 26,
    borderRadius: 9,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
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
});
