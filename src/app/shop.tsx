// src/app/shop.tsx — User Home / Product Store
// Real backend-driven catalog: search and category filter both hit
// GET /api/products on the server (same endpoint Admin's Products screen
// uses — one shared source of truth). Add to Cart / Buy Now are wired to the
// real CartContext; Buy Now adds the item then jumps straight to /cart so the
// shopper can review and check out immediately.
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { ProductDetailSheet } from '@/components/product-detail-sheet';
import { RequireUser } from '@/components/role-guard';
import { ShopProductCard } from '@/components/shop-product-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth-context';
import { useCart } from '@/context/cart-context';
import { useToast } from '@/context/toast-context';
import { ApiError, categoriesApi, productsApi, type Product } from '@/lib/api';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function ShopScreenContent() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { addItem } = useCart();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  const loadCategories = useCallback(async () => {
    try {
      const list = await categoriesApi.list();
      setCategories(list.map((c) => c.category));
    } catch {
      // Non-fatal — the filter chips just won't show.
    }
  }, []);

  const loadProducts = useCallback(async (searchTerm: string, category: string) => {
    setError(null);
    try {
      const list = await productsApi.list({
        search: searchTerm || undefined,
        category: category !== 'All' ? category : undefined,
      });
      setProducts(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดสินค้าไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    setIsLoading(true);
    const timeout = setTimeout(async () => {
      await loadProducts(search, activeCategory);
      setIsLoading(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, activeCategory, loadProducts]);

  const chips = useMemo(() => ['All', ...categories], [categories]);
  const numColumns = width >= 900 ? 4 : width >= 640 ? 3 : 2;

  const handleAddToCart = (product: Product, quantity = 1) => {
    const result = addItem(product, quantity);
    showToast(result.ok ? `เพิ่ม "${product.name}" ลงตะกร้าแล้ว` : result.message ?? 'เพิ่มลงตะกร้าไม่สำเร็จ', result.ok ? 'success' : 'error');
  };

  const handleBuyNow = (product: Product, quantity = 1) => {
    const result = addItem(product, quantity);
    if (!result.ok) {
      showToast(result.message ?? 'ไม่สามารถซื้อสินค้านี้ได้', 'error');
      return;
    }
    setDetailProduct(null);
    router.push('/cart');
  };

  const emptyMessage = search
    ? 'ไม่พบสินค้าที่ค้นหา'
    : activeCategory !== 'All'
      ? 'ไม่มีสินค้าในหมวดหมู่นี้'
      : 'ยังไม่มีสินค้า';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
              ยินดีต้อนรับ
            </ThemedText>
            <ThemedText type="title" style={styles.pageTitle}>
              {user ? `สวัสดี, ${user.username}` : 'ร้านค้าของเรา'}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.searchBar, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <ThemedText style={styles.searchIcon}>🔍</ThemedText>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="ค้นหาสินค้า (ชื่อ หรือ รหัสสินค้า)..."
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {chips.map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setActiveCategory(cat)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isActive ? theme.text : theme.cardBackground,
                    borderColor: isActive ? theme.text : theme.border,
                  },
                ]}>
                <ThemedText
                  type="small"
                  style={[styles.chipLabel, { color: isActive ? theme.background : theme.textSecondary }]}>
                  {cat === 'All' ? 'ทั้งหมด' : cat}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
            <ThemedText type="small" themeColor="textSecondary">
              กำลังโหลดสินค้า...
            </ThemedText>
          </View>
        ) : error ? (
          <ThemedView type="cardBackground" style={styles.errorBanner}>
            <ThemedText themeColor="danger">{error}</ThemedText>
          </ThemedView>
        ) : products.length === 0 ? (
          <EmptyState title={emptyMessage} />
        ) : (
          <FlatList
            key={numColumns}
            data={products}
            keyExtractor={(item) => String(item.id)}
            numColumns={numColumns}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.cardWrapper}>
                <ShopProductCard
                  product={item}
                  onOpenDetail={() => setDetailProduct(item)}
                  onAddToCart={() => handleAddToCart(item, 1)}
                  onBuyNow={() => handleBuyNow(item, 1)}
                />
              </View>
            )}
          />
        )}
      </SafeAreaView>

      <ProductDetailSheet
        product={detailProduct}
        onClose={() => setDetailProduct(null)}
        onAddToCart={(quantity) => {
          if (detailProduct) handleAddToCart(detailProduct, quantity);
          setDetailProduct(null);
        }}
        onBuyNow={(quantity) => {
          if (detailProduct) handleBuyNow(detailProduct, quantity);
        }}
      />
    </ThemedView>
  );
}

export default function ShopScreen() {
  return (
    <RequireUser>
      <ShopScreenContent />
    </RequireUser>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: Spacing.three,
  },
  eyebrow: {
    letterSpacing: 1.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  pageTitle: {
    fontSize: 26,
    lineHeight: 30,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  searchIcon: {
    fontSize: 15,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Platform.select({ web: Spacing.two, default: Spacing.three }),
    fontSize: 15,
  },
  chipRow: {
    gap: Spacing.two,
    paddingBottom: Spacing.one,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
    borderWidth: 1,
  },
  chipLabel: {
    fontWeight: '700',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.six,
  },
  errorBanner: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#D33A3F55',
  },
  listContent: {
    paddingBottom: BottomTabInset + Spacing.six,
    gap: Spacing.three,
  },
  row: {
    gap: Spacing.three,
  },
  cardWrapper: {
    flex: 1,
    marginBottom: Spacing.three,
  },
});
