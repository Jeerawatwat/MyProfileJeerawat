// src/components/theme-toggle.tsx
// Three-way Light / Dark / System segmented control, used in Profile →
// Appearance. Backed by ThemeModeProvider so the choice persists.
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { useThemeMode, type ThemeMode } from '@/context/theme-context';
import { Spacing } from '@/constants/theme';

const OPTIONS: Array<{ mode: ThemeMode; label: string; icon: string }> = [
  { mode: 'light', label: 'Light', icon: '☀️' },
  { mode: 'dark', label: 'Dark', icon: '🌙' },
  { mode: 'system', label: 'System', icon: '⚙️' },
];

export function ThemeToggle() {
  const { mode, setMode } = useThemeMode();

  return (
    <ThemedView type="backgroundElement" style={styles.container}>
      {OPTIONS.map((option) => {
        const isActive = mode === option.mode;
        return (
          <Pressable key={option.mode} style={styles.optionWrapper} onPress={() => setMode(option.mode)}>
            <View style={[styles.option, isActive && styles.optionActive]}>
              <ThemedText style={styles.icon}>{option.icon}</ThemedText>
              <ThemedText type="small" themeColor={isActive ? 'text' : 'textSecondary'}>
                {option.label}
              </ThemedText>
            </View>
          </Pressable>
        );
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: Spacing.three,
    padding: Spacing.half,
    gap: Spacing.half,
  },
  optionWrapper: {
    flex: 1,
  },
  option: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    gap: 2,
  },
  optionActive: {
    backgroundColor: '#20202018',
  },
  icon: {
    fontSize: 16,
  },
});
