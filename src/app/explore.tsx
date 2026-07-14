import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react'; // แก้ไข: นำเข้า useEffect และ useState จาก react ให้ถูกต้อง
import { Image, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ตัวเลือกหมวดหมู่สินค้าด้านบน
const CATEGORIES = ['All', 'Laptops', 'Audio', 'Keyboards'];

// โครงสร้าง Interface ของ Product
type Product = {
  id: string;
  brand: string;
  name: string;
  price: string;
  originalPrice: string;
  discount: string;
  rating: string;
  image: string;
};

export default function TabTwoScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const [activeCategory, setActiveCategory] = useState('All');
  const [products, setProducts] = useState<Product[]>([]);
  const theme = useTheme();

  // ดึงข้อมูล JSON จาก GitHub
  useEffect(() => {
    fetch('https://raw.githubusercontent.com/Jeerawatwat/MyProfileJeerawat/refs/heads/master/products.json')
      .then((response) => response.json())
      .then((data) => {
        setProducts(data);
      })
      .catch((error) => {
        console.error('Error fetching products:', error);
      });
  }, []);

  // ระบบกรองข้อมูลสินค้าตามแบรนด์เพื่อให้เชื่อมโยงกับปุ่มหมวดหมู่ด้านบน
  const filteredProducts = products.filter((product) => {
    if (activeCategory === 'All') return true;
    if (activeCategory === 'Laptops') return product.brand.toLowerCase() === 'apple';
    if (activeCategory === 'Audio') return product.brand.toLowerCase() === 'sony';
    if (activeCategory === 'Keyboards') return product.brand.toLowerCase() === 'logitech';
    return true;
  });

  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };

  return (
    <ThemedView style={[styles.mainContainer, { backgroundColor: '#f8f9fa' }]}>

      {/* ==================== 1. TOP MENU ==================== */}
      <View style={[styles.topHeaderContainer, { paddingTop: Platform.OS === 'web' ? Spacing.four : safeAreaInsets.top + 10 }]}>

        <View style={styles.topRow}>
          <View>
            <ThemedText style={styles.brandTitle}>PAPENGIE GROUP</ThemedText>
            <ThemedText style={styles.adminSubtitle}>hello: admin (💻 Admin)</ThemedText>
          </View>

          <View style={styles.topRowRight}>
            <Pressable style={styles.dashboardButton}>
              <ThemedText style={styles.dashboardText}>VIEW THE DASHBOARD. 📊</ThemedText>
            </Pressable>
            <View style={styles.cartIconContainer}>
              <SymbolView tintColor="#333" name={{ ios: 'cart', android: 'shopping-cart', web: 'shopping_cart' }} size={24} />
              <View style={styles.cartBadge}><ThemedText style={styles.badgeText}>3</ThemedText></View>
            </View>
          </View>
        </View>

        <View style={styles.searchBarContainer}>
          <SymbolView tintColor="#888" name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={18} style={styles.searchIcon} />
          <TextInput
            placeholder="Find laptops, headphones, keyboards..."
            placeholderTextColor="#888"
            style={styles.searchInput}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesScroll}>
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setActiveCategory(cat)}
                style={[styles.categoryTab, isActive ? styles.categoryActiveTab : styles.categoryInactiveTab]}
              >
                <ThemedText style={[styles.categoryTabText, isActive ? styles.categoryActiveText : styles.categoryInactiveText]}>
                  {cat}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ==================== ส่วนเนื้อหา: ดึงจาก API JSON ==================== */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 120 }]}>

        <View style={styles.productGrid}>
          {filteredProducts.map((product) => (
            <View key={product.id} style={styles.productCard}>
              <View style={styles.cardHeaderActions}>
                <Pressable style={styles.actionCircleButton}><ThemedText style={{color: 'white', fontSize: 10}}>🗑️</ThemedText></Pressable>
                <Pressable style={[styles.actionCircleButton, {backgroundColor: 'white'}]}><ThemedText style={{fontSize: 10}}>❤️</ThemedText></Pressable>
              </View>

              {/* รูปภาพสินค้า */}
              <View style={styles.imageContainer}>
                <Image 
                  source={{ uri: product.image }} 
                  style={styles.productImage} 
                  resizeMode="cover"
                />
              </View>

              <View style={styles.discountBadge}><ThemedText style={styles.discountText}>{product.discount}</ThemedText></View>

              <View style={styles.productInfo}>
                <ThemedText style={styles.productBrand}>{product.brand}</ThemedText>
                <ThemedText numberOfLines={1} style={styles.productName}>{product.name}</ThemedText>
                <ThemedText style={styles.ratingText}>⭐ {product.rating}</ThemedText>

                <View style={styles.priceRow}>
                  <ThemedText style={styles.currentPrice}>{product.price}</ThemedText>
                  <ThemedText style={styles.originalPrice}>{product.originalPrice}</ThemedText>
                </View>

                <Pressable style={styles.addToCartButton}>
                  <ThemedText style={styles.addToCartText}>+ Add to cart</ThemedText>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* ==================== 2. BOTTOM MENU ==================== */}
      <View style={[styles.bottomNavigationBar, { paddingBottom: safeAreaInsets.bottom + 8 }]}>
        <View style={styles.navItem}>
          <SymbolView tintColor="#777" name={{ ios: 'house', android: 'home', web: 'home' }} size={22} />
          <ThemedText style={styles.navText}>Home</ThemedText>
        </View>
        <View style={styles.navItem}>
          <SymbolView tintColor="#777" name={{ ios: 'cart', android: 'shopping-cart', web: 'shopping_cart' }} size={22} />
          <ThemedText style={styles.navText}>Cart</ThemedText>
        </View>
        <View style={styles.navItem}>
          <SymbolView tintColor="#777" name={{ ios: 'plus.circle', android: 'add-circle', web: 'add_circle' }} size={22} />
          <ThemedText style={styles.navText}>Add</ThemedText>
        </View>
        <View style={styles.navItem}>
          <SymbolView tintColor="#777" name={{ ios: 'heart', android: 'favorite', web: 'favorite' }} size={22} />
          <ThemedText style={styles.navText}>Favorites</ThemedText>
        </View>
        <View style={styles.navItem}>
          <SymbolView tintColor="#777" name={{ ios: 'person', android: 'person', web: 'person' }} size={22} />
          <ThemedText style={styles.navText}>Account</ThemedText>
        </View>
        <View style={styles.navItem}>
          <SymbolView tintColor="#777" name={{ ios: 'tag', android: 'label', web: 'label' }} size={22} />
          <ThemedText style={styles.navText}>Brand</ThemedText>
        </View>
        <View style={styles.navItem}>
          <SymbolView tintColor="#0099ff" name={{ ios: 'square.grid.2x2.fill', android: 'apps', web: 'apps' }} size={22} />
          <ThemedText style={[styles.navText, { color: '#0099ff' }]}>Admin</ThemedText>
        </View>
      </View>

    </ThemedView>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  topHeaderContainer: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
    zIndex: 99,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111',
  },
  adminSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  topRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dashboardButton: {
    backgroundColor: '#7f56da',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  dashboardText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
  },
  cartIconContainer: {
    position: 'relative',
    padding: 4,
  },
  cartBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#0099ff',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: 'white',
    fontSize: 9,
    fontWeight: 'bold',
  },
  searchBarContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f3f5',
    borderRadius: 25,
    paddingHorizontal: 16,
    alignItems: 'center',
    height: 44,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  categoriesScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  categoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryActiveTab: {
    backgroundColor: '#0099ff',
    borderColor: '#0099ff',
  },
  categoryInactiveTab: {
    backgroundColor: 'white',
    borderColor: '#e9ecef',
  },
  categoryTabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  categoryActiveText: {
    color: 'white',
  },
  categoryInactiveText: {
    color: '#495057',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  productGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  productCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '48%',
    padding: 12,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
    marginBottom: 4,
  },
  cardHeaderActions: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 5,
  },
  actionCircleButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#e74c3c',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    width: '100%',
    height: 120,
    marginTop: 15,
    borderRadius: 8,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  discountBadge: {
    position: 'absolute',
    top: 125,
    left: 12,
    backgroundColor: '#fce4e4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 4,
  },
  discountText: {
    color: '#e74c3c',
    fontSize: 10,
    fontWeight: 'bold',
  },
  productInfo: {
    marginTop: 22,
  },
  productBrand: {
    fontSize: 11,
    color: '#999',
    fontWeight: 'bold',
  },
  productName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    marginTop: 2,
  },
  ratingText: {
    fontSize: 11,
    color: '#f1c40f',
    marginVertical: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  currentPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0099ff',
  },
  originalPrice: {
    fontSize: 10,
    color: '#bbb',
    textDecorationLine: 'line-through',
  },
  addToCartButton: {
    backgroundColor: '#0099ff',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  addToCartText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomNavigationBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f3f5',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 100,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navText: {
    fontSize: 10,
    color: '#777',
    marginTop: 4,
    fontWeight: '500',
  },
});