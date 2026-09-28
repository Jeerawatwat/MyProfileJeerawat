// src/components/ambient-glow.tsx
// Decorative "floating glow orbs" background — a few large, soft, slowly
// drifting translucent circles (with a big blurred shadow for glow) in the
// theme's own accent colors (gold + red), sitting behind a screen's real
// content. Purely visual: pointerEvents
// "none" so it never intercepts touches, and it automatically re-colors
// itself whenever the color scheme changes (Light/Dark/System in Profile →
// Appearance) because it reads its colors from useTheme() like everything
// else in the app.
//
// Render it as the FIRST child inside a screen's outer <ThemedView>, before
// the screen's real content (<SafeAreaView>, etc.) — JSX order is paint
// order in React Native, so it paints on top of that ThemedView's solid
// background but underneath everything that follows it.
//
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

type Blob = {
  size: number;
  top?: number | string;
  bottom?: number | string;
  left?: number | string;
  right?: number | string;
  color: string;
  duration: number;
  driftX: number;
  driftY: number;
};

function GlowBlob({ blob }: { blob: Blob }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    // Slow back-and-forth drift — withRepeat(..., reverse: true) ping-pongs
    // between 0 and 1 forever, no imperative restart logic needed.
    progress.value = withRepeat(withTiming(1, { duration: blob.duration, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [progress, blob.duration]);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * blob.driftX }, { translateY: progress.value * blob.driftY }],
  }));

  return (
    <Animated.View
      style={[
        styles.blob,
        floatStyle,
        {
          width: blob.size,
          height: blob.size,
          borderRadius: blob.size / 2,
          top: blob.top,
          bottom: blob.bottom,
          left: blob.left,
          right: blob.right,
          // Plain translucent fill (backgroundColor with an 8-digit
          // #RRGGBBAA hex, which React Native's own color parser — not just
          // the browser's — understands) + a big soft shadow for the glow.
          // More reliably supported across RN/RN-Web versions than a CSS
          // gradient string, which some setups silently drop.
          backgroundColor: blob.color,
          shadowColor: blob.color,
          shadowOpacity: 1,
          shadowRadius: blob.size * 0.35,
          shadowOffset: { width: 0, height: 0 },
        },
      ]}
    />
  );
}

export function AmbientGlow() {
  const theme = useTheme();

  const blobs: Blob[] = [
    { size: 420, top: -120, right: -100, color: `${theme.primary}99`, duration: 9000, driftX: -30, driftY: 40 },
    { size: 360, bottom: -140, left: -80, color: `${theme.danger}77`, duration: 11000, driftX: 40, driftY: -30 },
    { size: 300, top: '35%', left: '55%', color: `${theme.primary}66`, duration: 13000, driftX: -50, driftY: 25 },
  ];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {blobs.map((blob, i) => (
        <GlowBlob key={i} blob={blob} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: 'absolute',
  },
});
