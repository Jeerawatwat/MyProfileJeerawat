<<<<<<< HEAD
// src/app/explore.tsx
// This screen used to render hard-coded mock products fetched from a GitHub
// JSON file — real Inventory data now lives on the Products tab instead, so
// this route just forwards there. Kept (rather than deleted) so any existing
// bookmark/link to /explore still lands somewhere useful instead of 404ing.
import { Redirect } from 'expo-router';

export default function ExploreRedirect() {
  return <Redirect href="/products" />;
=======
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
>>>>>>> bd44bbed68bd75eeb6040c36cf1ed18819af8790
}
