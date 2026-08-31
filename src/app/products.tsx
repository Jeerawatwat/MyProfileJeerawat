// src/app/products.tsx — Products
// Real backend-driven list: search and category filter both hit GET /api/products
// on the server (no client-side-only filtering of mock data). Add/Edit/Delete all
// go through the real API and refresh the list from the database afterwards.
// The stat tiles (Items / Low Stock / Stock Value) are computed from whatever
// `products` currently holds — i.e. the real rows the API just returned for the
// active search/category — never a separate mock or hardcoded number.
import { useLocalSearchParams } from 'expo-router';
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

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { ProductActionsSheet } from '@/components/product-actions-sheet';
import { ProductCard } from '@/components/product-card';
import { ProductFormModal } from '@/components/product-form-modal';
import { RequireAdmin } from '@/components/role-guard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useToast } from '@/context/toast-context';
import {
  ApiError,
  categoriesApi,
  formatBaht,
  productsApi,
  type Product,
  type ProductInput,
} from '@/lib/api';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function ProductsScreen() {
  const theme = useTheme();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ category?: string }>();
  const { width } = useWindowDimensions();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [menuTarget, setMenuTarget] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (typeof params.category === 'string' && params.category) {
      setActiveCategory(params.category);
    }
  }, [params.category]);

  const loadCategories = useCallback(async () => {
    try {
      const list = await categoriesApi.list();
      setCategories(list.map((c) => c.category));
    } catch {
      // Non-fatal — the filter chips just won't show; the product list load
      // below will surface any real backend/auth error to the user.
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
      setError(err instanceof ApiError ? err.message : 'Failed to load products');
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
    }, 300); // debounce search-as-you-type against the API
    return () => clearTimeout(timeout);
  }, [search, activeCategory, loadProducts]);

  const refreshAfterMutation = async () => {
    await Promise.all([loadProducts(search, activeCategory), loadCategories()]);
  };

  const openAddModal = () => {
    setFormMode('add');
    setEditingProduct(null);
    setFormVisible(true);
  };

  const openEditModal = (product: Product) => {
    setFormMode('edit');
    setEditingProduct(product);
    setFormVisible(true);
  };

  const handleSubmit = async (data: ProductInput) => {
    setIsSaving(true);
    try {
      if (formMode === 'add') {
        await productsApi.create(data);
        showToast('Product added successfully');
      } else if (editingProduct) {
        await productsApi.update(editingProduct.id, data);
        showToast('Product updated successfully');
      }
      setFormVisible(false);
      await refreshAfterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to save product', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await productsApi.remove(deleteTarget.id);
      showToast('Product deleted successfully');
      setDeleteTarget(null);
      await refreshAfterMutation();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to delete product', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const chips = useMemo(() => ['All', ...categories], [categories]);
  const numColumns = layout === 'list' ? 1 : width >= 900 ? 4 : width >= 640 ? 3 : 2;

  const stats = useMemo(() => {
    const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 10).length;
    const stockValue = products.reduce((sum, p) => sum + p.price * p.stock, 0);
    return [
      { key: 'items', label: 'ITEMS', value: String(products.length), color: theme.text },
      { key: 'low', label: 'LOW STOCK', value: String(lowStock), color: theme.warning },
      { key: 'value', label: 'STOCK VALUE', value: formatBaht(stockValue), color: theme.success },
    ];
  }, [products, theme]);

  const emptyMessage = search
    ? 'No products match your search'
    : activeCategory !== 'All'
      ? 'No products in this category'
      : 'No products found';

  return (
    <RequireAdmin>
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
              INVENTORY
            </ThemedText>
            <ThemedText type="title" style={styles.pageTitle}>
              Products
            </ThemedText>
          </View>
          <Pressable style={[styles.addButton, { backgroundColor: theme.primary }]} onPress={openAddModal}>
            <ThemedText type="smallBold" themeColor="primaryText">
              + Add
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.toolRow}>
          <View style={[styles.searchBar, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <ThemedText style={styles.searchIcon}>🔍</ThemedText>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search products..."
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchInput, { color: theme.text }]}
            />
          </View>
          <Pressable
            onPress={() => setLayout((l) => (l === 'grid' ? 'list' : 'grid'))}
            style={[styles.viewToggle, { backgroundColor: theme.text }]}>
            <ThemedText style={styles.viewToggleIcon}>{layout === 'grid' ? '☰' : '⊞'}</ThemedText>
          </Pressable>
        </View>

        <View style={styles.statRow}>
          {stats.map((s) => (
            <View key={s.key} style={[styles.statTile, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <ThemedText style={[styles.statValue, { color: s.color }]}>{s.value}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.statLabel}>
                {s.label}
              </ThemedText>
            </View>
          ))}
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
                  {cat}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
            <ThemedText type="small" themeColor="textSecondary">
              Loading products...
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
            key={`${layout}-${numColumns}`}
            data={products}
            keyExtractor={(item) => String(item.id)}
            numColumns={numColumns}
            columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
            contentContainerStyle={styles.listContent}
            renderItem={({ item, index }) => (
              <View style={numColumns > 1 ? styles.cardWrapper : styles.cardWrapperFull}>
                <ProductCard
                  product={item}
                  index={index}
                  layout={layout}
                  onEdit={() => openEditModal(item)}
                  onDelete={() => setDeleteTarget(item)}
                  onMenu={() => setMenuTarget(item)}
                />
              </View>
            )}
          />
        )}
      </SafeAreaView>

      <ProductActionsSheet
        product={menuTarget}
        onEdit={() => {
          if (menuTarget) openEditModal(menuTarget);
          setMenuTarget(null);
        }}
        onDelete={() => {
          if (menuTarget) setDeleteTarget(menuTarget);
          setMenuTarget(null);
        }}
        onClose={() => setMenuTarget(null)}
      />

      <ProductFormModal
        visible={formVisible}
        mode={formMode}
        initialProduct={editingProduct}
        categories={categories}
        busy={isSaving}
        onClose={() => setFormVisible(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        visible={!!deleteTarget}
        title="Delete Product?"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        busy={isDeleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </ThemedView>
    </RequireAdmin>
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
    fontSize: 30,
    lineHeight: 34,
  },
  addButton: {
    height: 42,
    paddingHorizontal: Spacing.three,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F2B705',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  toolRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  searchBar: {
    flex: 1,
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
  viewToggle: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggleIcon: {
    color: '#FFD84D',
    fontSize: 17,
  },
  statRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  statTile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    gap: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
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
  cardWrapperFull: {
    marginBottom: Spacing.three,
  },
});
