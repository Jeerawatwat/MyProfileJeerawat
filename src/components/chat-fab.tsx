// src/components/chat-fab.tsx
// Floating "แชทกับเรา" (Chat with us) button, bottom-right, on every
// authenticated screen — opens the shop's real Facebook Page in Messenger.
// Pure UI convenience; it does not touch the API/DB at all.
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from './themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';

// Numeric Facebook Page ID (from facebook.com/profile.php?id=...) — m.me
// accepts page IDs the same way it accepts page usernames.
const MESSENGER_URL = 'https://m.me/61593833274270';

export function ChatFab() {
  const entrance = useSharedValue(0);
  const pulse = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    entrance.value = withDelay(500, withTiming(1, { duration: 380, easing: Easing.out(Easing.back(1.6)) }));
    pulse.value = withDelay(
      900,
      withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1, true),
    );
    ring.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.ease) }), -1, false);
  }, [entrance, pulse, ring]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [{ scale: entrance.value }, { translateY: (1 - entrance.value) * 24 }],
  }));

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.06 }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.35,
    transform: [{ scale: 1 + ring.value * 0.7 }],
  }));

  const handlePress = () => {
    Linking.openURL(MESSENGER_URL).catch(() => {
      // If the Messenger deep link fails for any reason, fall back to the
      // plain Facebook Page — still gets the customer to a way to chat.
      Linking.openURL('https://www.facebook.com/profile.php?id=61593833274270');
    });
  };

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrapper, entranceStyle]}>
      <View style={styles.labelRow}>
        <View style={styles.label}>
          <ThemedText type="smallBold" style={styles.labelText}>
            แชทกับเรา
          </ThemedText>
        </View>
      </View>

      <Pressable onPress={handlePress} hitSlop={8} accessibilityLabel="แชทกับเราทาง Messenger">
        <View style={styles.bubbleContainer}>
          <Animated.View style={[styles.ring, ringStyle]} />
          <Animated.View style={[styles.bubble, bubbleStyle]}>
            <ThemedText style={styles.bubbleIcon}>📦</ThemedText>
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const FAB_SIZE = 56;
// The web tab bar's real rendered height is ~93-96px (Spacing.three padding
// on the outer bar + Spacing.two padding on the pill + the icon/label
// stack) now that tab labels are forced to one line (see user-tabs.web.tsx /
// app-tabs.web.tsx) — a fixed height was the whole point of that fix, so this
// offset just needs to clear it plus a small breathing-room gap, not the
// oversized buffer from before that left the FAB floating awkwardly high.
const BOTTOM_OFFSET = Platform.OS === 'web' ? 108 : BottomTabInset + 24;

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    right: Spacing.three,
    bottom: BOTTOM_OFFSET,
    alignItems: 'flex-end',
    zIndex: 50,
  },
  labelRow: {
    marginBottom: 6,
  },
  label: {
    backgroundColor: '#D33A3F',
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  labelText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  bubbleContainer: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: '#0084FF',
  },
  bubble: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: '#0084FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0084FF',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  bubbleIcon: {
    fontSize: 24,
  },
});
