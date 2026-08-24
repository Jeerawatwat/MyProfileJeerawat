// src/app/categories.tsx — Categories
// Category list comes straight from the database: the distinct `category`
// values already present on Inventory, with a live count per category. There
// is no separate Categories table to hard-code against.
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ApiError, categoriesApi, type CategorySummary } from '@/lib/api';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

export default function CategoriesScreen() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await categoriesApi.list();
      setCategories(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load categories');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await load();
      setIsLoading(false);
    })();
  }, [load]);

  const goToCategory = (category: string) => {
    router.push({ pathname: '/products', params: { category } });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="subtitle" style={styles.title}>
          Categories
        </ThemedText>

        <Pressable style={styles.allRow} onPress={() => goToCategory('All')}>
          <ThemedView type="cardBackground" style={styles.rowCard}>
            <ThemedText type="defaultSemiBold">All Products</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              →
            </ThemedText>
          </ThemedView>
        </Pressable>

        {isLoading ? (
          <ActivityIndicator size="large" style={styles.loading} />
        ) : error ? (
          <ThemedView type="cardBackground" style={styles.errorBanner}>
            <ThemedText themeColor="danger">{error}</ThemedText>
          </ThemedView>
        ) : categories.length === 0 ? (
          <EmptyState title="No categories found" hint="Add a product with a category to see it here" />
        ) : (
          <FlatList
            data={categories}
            keyExtractor={(item) => item.category}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <Pressable onPress={() => goToCategory(item.category)}>
                <ThemedView type="cardBackground" style={styles.rowCard}>
                  <View>
                    <ThemedText type="defaultSemiBold">{item.category}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.productCount} product{item.productCount === 1 ? '' : 's'}
                    </ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    →
                  </ThemedText>
                </ThemedView>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </ThemedView>
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
  title: {
    marginTop: Spacing.three,
  },
  loading: {
    marginTop: Spacing.six,
  },
  errorBanner: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#D33A3F55',
  },
  allRow: {
    marginBottom: -Spacing.one,
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  rowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
});
