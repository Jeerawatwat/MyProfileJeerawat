// src/components/brand-header.tsx
// Slim persistent brand strip — logo + shop name — shown at the very top of
// every authenticated screen (both Admin and User), above the tab bar/page
// content. Deliberately small (this is a header mark, not the big hero-sized
// logo on Login/Register) so it never competes with the page's own title.
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function BrandHeader() {
  const theme = useTheme();

  return (
    <ThemedView type="cardBackground" style={[styles.container, { borderBottomColor: theme.border }]}>
      <SafeAreaView edges={['top']}>
        <View style={styles.row}>
          <Image
            source={require('@/assets/images/shop-logo.png')}
            style={styles.logo}
            contentFit="contain"
          />
          <ThemedText type="smallBold" style={styles.name}>
            Mee Dood Cha
          </ThemedText>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  name: {
    fontSize: 15,
  },
});
