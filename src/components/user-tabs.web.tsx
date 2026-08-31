// src/components/user-tabs.web.tsx
// Bottom navigation for the "user" role — Shop / Cart / My Orders / Account.
// Mirrors app-tabs.web.tsx (the Admin tab bar) exactly in structure/behavior,
// just pointed at the shopper-facing routes instead of the inventory-manager
// ones. Never rendered for an admin — see _layout.tsx's AuthGate, which picks
// this vs AppTabs purely from the logged-in user's role.
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, View, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { useCart } from '@/context/cart-context';
import { MaxContentWidth, Spacing } from '@/constants/theme';

export default function UserTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="shop" href="/shop" asChild>
            <TabButton icon="🏠">หน้าแรก</TabButton>
          </TabTrigger>
          <TabTrigger name="cart" href="/cart" asChild>
            <CartTabButton />
          </TabTrigger>
          <TabTrigger name="orders" href="/orders" asChild>
            <TabButton icon="🧾">คำสั่งซื้อ</TabButton>
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton icon="👤">บัญชีของฉัน</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

type TabButtonProps = TabTriggerSlotProps & { icon?: string; badge?: number };

export function TabButton({ children, icon, badge, isFocused, ...props }: TabButtonProps) {
  return (
    <Pressable {...props} style={({ pressed }) => [styles.pressableTab, pressed && styles.pressed]}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.tabButtonView}>
        <View style={styles.iconWrap}>
          {icon ? <ThemedText style={styles.tabIcon}>{icon}</ThemedText> : null}
          {!!badge && badge > 0 && (
            <View style={styles.badge}>
              <ThemedText style={styles.badgeText}>{badge > 99 ? '99+' : badge}</ThemedText>
            </View>
          )}
        </View>
        <ThemedText type="small" numberOfLines={1} themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

// Cart tab needs a live item-count badge, so it reads CartContext directly
// rather than taking a static prop like the other tabs.
function CartTabButton(props: TabTriggerSlotProps) {
  const { totalItems } = useCart();
  return (
    <TabButton {...props} icon="🛒" badge={totalItems}>
      ตะกร้า
    </TabButton>
  );
}

export function CustomTabList(props: TabListProps) {
  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView type="backgroundElement" style={styles.innerContainer}>
        {props.children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.one,
    maxWidth: MaxContentWidth,
  },
  pressableTab: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.three,
    alignItems: 'center',
    gap: 2,
  },
  iconWrap: {
    position: 'relative',
  },
  tabIcon: {
    fontSize: 16,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: '#D33A3F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
  },
});
