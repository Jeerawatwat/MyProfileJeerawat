import { StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle" style={styles.icon}>
        📦
      </ThemedText>
      <ThemedText type="defaultSemiBold" style={styles.title}>
        {title}
      </ThemedText>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          {hint}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    textAlign: 'center',
  },
  hint: {
    textAlign: 'center',
  },
});
