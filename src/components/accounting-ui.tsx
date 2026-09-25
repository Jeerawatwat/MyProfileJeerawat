// src/components/accounting-ui.tsx
// Small building blocks shared by the accounting screens, styled exactly like
// the existing Admin Orders screen (eyebrow + big title, pill chips, card
// rows) so the finance pages feel like the same app.
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function PageHeader({ eyebrow, title, right }: { eyebrow: string; title: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
          {eyebrow}
        </ThemedText>
        <ThemedText type="title" style={styles.pageTitle}>
          {title}
        </ThemedText>
      </View>
      {right}
    </View>
  );
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    // flexGrow/flexShrink 0 keep the strip at chip height — on web a horizontal
    // ScrollView otherwise stretches to fill the column's free space (very
    // visible when the list below is empty).
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipsScroll}
      contentContainerStyle={styles.chips}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.chip, { backgroundColor: active ? theme.text : theme.backgroundElement }]}>
            <ThemedText type="small" style={{ color: active ? theme.background : theme.textSecondary, fontWeight: '700' }}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function MoneyRow({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: 'danger' | 'success';
}) {
  return (
    <View style={styles.moneyRow}>
      <ThemedText type={bold ? 'smallBold' : 'small'} themeColor={bold ? 'text' : 'textSecondary'} style={styles.moneyLabel}>
        {label}
      </ThemedText>
      <ThemedText type={bold ? 'defaultSemiBold' : 'small'} themeColor={tone}>
        {value}
      </ThemedText>
    </View>
  );
}

export const accountingStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  loading: {
    marginTop: Spacing.six,
  },
  errorBanner: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#D33A3F55',
  },
  card: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  badges: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    gap: Spacing.half,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  button: {
    flexGrow: 1,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteBox: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    padding: Spacing.two,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '92%',
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
  },
  modalContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  disabled: {
    opacity: 0.6,
  },
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerText: {
    flexShrink: 1,
  },
  eyebrow: {
    letterSpacing: 1.5,
    fontWeight: '700',
    marginBottom: 2,
    marginTop: Spacing.three,
  },
  pageTitle: {
    fontSize: 30,
    lineHeight: 34,
  },
  chipsScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  chips: {
    gap: Spacing.one,
    alignItems: 'center',
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.four,
  },
  moneyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  moneyLabel: {
    flex: 1,
  },
});
