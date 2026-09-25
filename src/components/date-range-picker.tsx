// src/components/date-range-picker.tsx
// Range selector for the finance screens: วันนี้ / 7 วัน / เดือนนี้ /
// เดือนที่แล้ว / กำหนดเอง. Reads and writes the range shared by every
// accounting screen (context/report-range-context.tsx), so changing it on one
// tab changes it on the others too. Custom dates are typed as YYYY-MM-DD (no
// native date-picker module ships with this project) and only applied once
// both are valid; the backend validates the range again.
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { FilterChips } from './accounting-ui';
import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { useReportRange } from '@/context/report-range-context';
import { useTheme } from '@/hooks/use-theme';
import { isValidYmd, presetRange, RANGE_PRESET_LABELS, type RangePreset } from '@/lib/format';

export type { DateRange } from '@/context/report-range-context';

const PRESETS = (Object.keys(RANGE_PRESET_LABELS) as RangePreset[]).map((value) => ({
  value,
  label: RANGE_PRESET_LABELS[value],
}));

export function DateRangePicker() {
  const theme = useTheme();
  const { range, preset, setRange } = useReportRange();
  // "กำหนดเอง" is shown as soon as it's tapped, but the shared range only
  // changes once the typed dates are applied.
  const [editingCustom, setEditingCustom] = useState(preset === 'custom');
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [error, setError] = useState<string | null>(null);

  const pickPreset = (next: RangePreset) => {
    setError(null);
    if (next === 'custom') {
      setEditingCustom(true);
      setFrom(range.from);
      setTo(range.to);
      return;
    }
    setEditingCustom(false);
    setRange(presetRange(next), next);
  };

  const applyCustom = () => {
    if (!isValidYmd(from) || !isValidYmd(to)) {
      setError('กรุณากรอกวันที่ในรูปแบบ YYYY-MM-DD');
      return;
    }
    if (from > to) {
      setError('วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด');
      return;
    }
    setError(null);
    setRange({ from, to }, 'custom');
  };

  const activeChip: RangePreset = editingCustom ? 'custom' : preset;

  return (
    <View style={styles.container}>
      <FilterChips options={PRESETS} value={activeChip} onChange={pickPreset} />
      {activeChip === 'custom' ? (
        <View style={styles.customRow}>
          <TextInput
            value={from}
            onChangeText={setFrom}
            placeholder="2026-09-01"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { borderColor: theme.border, color: theme.text }]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            ถึง
          </ThemedText>
          <TextInput
            value={to}
            onChangeText={setTo}
            placeholder="2026-09-30"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { borderColor: theme.border, color: theme.text }]}
          />
          <Pressable style={[styles.apply, { backgroundColor: theme.primary }]} onPress={applyCustom}>
            <ThemedText type="smallBold" themeColor="primaryText">
              ใช้
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  apply: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
