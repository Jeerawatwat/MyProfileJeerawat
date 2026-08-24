<<<<<<< HEAD
// src/app/index.tsx — Dashboard
// Every number here is a live aggregate from GET /api/dashboard (real MySQL
// query), never a placeholder.
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
=======
import * as Device from 'expo-device';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, View } from 'react-native';
>>>>>>> bd44bbed68bd75eeb6040c36cf1ed18819af8790
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { StockBadge } from '@/components/stock-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth-context';
import { ApiError, dashboardApi, formatBaht, resolveImageUrl, type DashboardStats } from '@/lib/api';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

<<<<<<< HEAD
const STAT_TILES: Array<{
  key: keyof Pick<DashboardStats, 'totalProducts' | 'totalCategories' | 'lowStock' | 'outOfStock'>;
  label: string;
  icon: string;
  tone?: 'warning' | 'danger';
}> = [
  { key: 'totalProducts', label: 'Total Products', icon: '📦' },
  { key: 'totalCategories', label: 'Categories', icon: '🏷️' },
  { key: 'lowStock', label: 'Low Stock', icon: '⚠️', tone: 'warning' },
  { key: 'outOfStock', label: 'Out of Stock', icon: '⛔', tone: 'danger' },
];

export default function DashboardScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await dashboardApi.stats();
      setStats(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load dashboard');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await load();
      setIsLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

=======
interface InventoryItem {
  id: number;
  name: string;
  price: string | number;
  stock: number;
  category: string;
}

function getDevMenuHint() {
  if (Platform.OS === 'web') {
    return <ThemedText type="small">use browser devtools</ThemedText>;
  }
  if (Device.isDevice) {
    return (
      <ThemedText type="small">
        shake device or press <ThemedText type="code">m</ThemedText> in terminal
      </ThemedText>
    );
  }
  const shortcut = Platform.OS === 'android' ? 'cmd+m (or ctrl+m)' : 'cmd+d';
  return (
    <ThemedText type="small">
      press <ThemedText type="code">{shortcut}</ThemedText>
    </ThemedText>
  );
}

export default function HomeScreen() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // ดึงข้อมูล API จาก Backend Server
  useEffect(() => {
    fetch('http://119.59.102.161:3079/api/inventory')
      .then((res) => res.json())
      .then((data) => {
        setItems(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Fetch Error:', err);
        setLoading(false);
      });
  }, []);

>>>>>>> bd44bbed68bd75eeb6040c36cf1ed18819af8790
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}>
          <View style={styles.header}>
            <ThemedText type="subtitle">Dashboard</ThemedText>
            {user && (
              <ThemedText type="small" themeColor="textSecondary">
                Welcome back, {user.username}
              </ThemedText>
            )}
          </View>

          {isLoading ? (
            <ActivityIndicator size="large" style={styles.loading} />
          ) : error ? (
            <ThemedView type="cardBackground" style={styles.errorBanner}>
              <ThemedText themeColor="danger">{error}</ThemedText>
            </ThemedView>
          ) : (
            stats && (
              <>
                <View style={styles.statGrid}>
                  {STAT_TILES.map((tile, i) => (
                    <Animated.View key={tile.key} entering={FadeInDown.delay(i * 60).duration(280)} style={styles.statTileWrapper}>
                      <ThemedView type="cardBackground" style={[styles.statTile, { borderColor: theme.border }]}>
                        <ThemedText style={styles.statIcon}>{tile.icon}</ThemedText>
                        <ThemedText
                          type="title"
                          style={[styles.statValue, tile.tone && { color: theme[tile.tone] }]}>
                          {stats[tile.key]}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {tile.label}
                        </ThemedText>
                      </ThemedView>
                    </Animated.View>
                  ))}
                </View>

<<<<<<< HEAD
                <ThemedView type="cardBackground" style={styles.recentContainer}>
                  <ThemedText type="defaultSemiBold" style={styles.recentTitle}>
                    Recent Products
                  </ThemedText>
                  {stats.recentProducts.length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      No products found
                    </ThemedText>
                  ) : (
                    stats.recentProducts.map((product) => {
                      const photoUrl = resolveImageUrl(product.image_url);
                      return (
                        <View key={product.id} style={[styles.recentRow, { borderTopColor: theme.border }]}>
                          <View style={[styles.recentThumb, { backgroundColor: theme.backgroundElement }]}>
                            {photoUrl ? (
                              <Image source={{ uri: photoUrl }} style={styles.recentThumbImage} contentFit="cover" />
                            ) : (
                              <ThemedText type="small" themeColor="textSecondary">
                                {product.name.slice(0, 1).toUpperCase()}
                              </ThemedText>
                            )}
                          </View>
                          <View style={styles.recentInfo}>
                            <ThemedText type="defaultSemiBold">{product.name}</ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {product.category} · {formatBaht(product.price)}
                            </ThemedText>
                          </View>
                          <StockBadge stock={product.stock} />
                        </View>
                      );
                    })
                  )}
                </ThemedView>
              </>
            )
          )}
        </ScrollView>
=======
        {/* ส่วนแสดงข้อมูล Inventory ที่เชื่อมกับ API */}
        <ThemedView type="backgroundElement" style={styles.inventoryContainer}>
          <ThemedText type="subtitle" style={styles.inventoryTitle}>
            Inventory Items
          </ThemedText>
          {loading ? (
            <ActivityIndicator size="small" />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <View style={styles.itemCard}>
                  <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
                  <ThemedText type="small">หมวดหมู่: {item.category}</ThemedText>
                  <ThemedText type="small">ราคา: {item.price} บาท | คงเหลือ: {item.stock} ชิ้น</ThemedText>
                </View>
              )}
              style={{ maxHeight: 200 }}
            />
          )}
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.stepContainer}>
          <HintRow
            title="Try editing"
            hint={<ThemedText type="code">src/app/index.tsx</ThemedText>}
          />
          <HintRow title="Dev tools" hint={getDevMenuHint()} />
          <HintRow
            title="Fresh start"
            hint={<ThemedText type="code">npm run reset-project</ThemedText>}
          />
        </ThemedView>

        {Platform.OS === 'web' && <WebBadge />}
>>>>>>> bd44bbed68bd75eeb6040c36cf1ed18819af8790
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
    alignItems: 'center',
  },
<<<<<<< HEAD
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.six,
=======
  heroSection: {
    alignItems: 'center',
    justify: 'center',
    flex: 1,
    paddingHorizontal: Spacing.four,
>>>>>>> bd44bbed68bd75eeb6040c36cf1ed18819af8790
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.half,
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
<<<<<<< HEAD
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  statTileWrapper: {
    flexGrow: 1,
    flexBasis: '45%',
  },
  statTile: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  statIcon: {
    fontSize: 20,
  },
  statValue: {
    fontSize: 28,
    lineHeight: 32,
  },
  recentContainer: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  recentTitle: {
    marginBottom: Spacing.one,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#88888833',
  },
  recentThumb: {
    width: 40,
    height: 40,
    borderRadius: Spacing.two,
    backgroundColor: '#8888881a',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  recentThumbImage: {
    width: '100%',
    height: '100%',
  },
  recentInfo: {
    flex: 1,
    gap: 2,
  },
});
=======
  inventoryContainer: {
    gap: Spacing.two,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
  },
  inventoryTitle: {
    marginBottom: Spacing.one,
  },
  itemCard: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
});
>>>>>>> bd44bbed68bd75eeb6040c36cf1ed18819af8790
