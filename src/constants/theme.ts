/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1A1A17',
    background: '#F1EDE3',
    backgroundElement: '#F7F3E9',
    backgroundSelected: '#EDE7D8',
    textSecondary: '#8A8470',
    primary: '#FFD84D',
    primaryText: '#1A1A17',
    danger: '#D33A3F',
    success: '#1F7A46',
    warning: '#96700A',
    border: '#EDE7D8',
    cardBackground: '#FFFFFF',
  },
  dark: {
    text: '#F5F1E4',
    background: '#15130E',
    backgroundElement: '#211E15',
    backgroundSelected: '#2B271B',
    textSecondary: '#A79F8C',
    primary: '#FFD84D',
    primaryText: '#1A1A17',
    danger: '#FF6B6F',
    success: '#4CC079',
    warning: '#E0B95C',
    border: '#2B271B',
    cardBackground: '#1D1A13',
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
