/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Black / sky-blue / white — matches the shop's own mascot logo
// (assets/images/shop-logo.png: a black speaker character with blue trim on
// a white background) instead of the earlier gold-and-crimson luxury theme.
// `primary` is that same bright, friendly blue; danger/success/warning stay
// their usual red/green/amber since those are functional status colors, not
// a branding choice.
export const Colors = {
  light: {
    text: '#12181F',
    background: '#F5FAFF',
    backgroundElement: '#E9F4FE',
    backgroundSelected: '#D6EAFB',
    textSecondary: '#5C6B78',
    primary: '#2196F3',
    primaryText: '#FFFFFF',
    danger: '#DC2626',
    success: '#16A34A',
    warning: '#D97706',
    border: '#DCEBF9',
    cardBackground: '#FFFFFF',
  },
  dark: {
    text: '#F2F7FC',
    background: '#0A121C',
    backgroundElement: '#132234',
    backgroundSelected: '#1B3348',
    textSecondary: '#8CA0B3',
    primary: '#42A5F5',
    primaryText: '#0A121C',
    danger: '#F87171',
    success: '#4ADE80',
    warning: '#FBBF24',
    border: '#1B3348',
    cardBackground: '#101B29',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
