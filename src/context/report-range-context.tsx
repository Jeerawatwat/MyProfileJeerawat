// src/context/report-range-context.tsx
// The date range the accounting screens report on, shared by all of them —
// pick "เดือนที่แล้ว" on the Reports tab and the Income/Expenses tab shows the
// same month, and vice-versa. Starts on today, so each new day opens at 0.
// Mounted around the accounting tab set only (see _layout.tsx's AuthGate).
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { presetRange, type RangePreset } from '@/lib/format';

export type DateRange = { from: string; to: string };

type ReportRangeValue = {
  range: DateRange;
  preset: RangePreset;
  setRange: (range: DateRange, preset: RangePreset) => void;
};

const ReportRangeContext = createContext<ReportRangeValue | undefined>(undefined);

export function ReportRangeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ range: DateRange; preset: RangePreset }>(() => ({
    range: presetRange('today'),
    preset: 'today',
  }));

  const value = useMemo(
    () => ({
      range: state.range,
      preset: state.preset,
      setRange: (range: DateRange, preset: RangePreset) => setState({ range, preset }),
    }),
    [state]
  );

  return <ReportRangeContext.Provider value={value}>{children}</ReportRangeContext.Provider>;
}

export function useReportRange(): ReportRangeValue {
  const ctx = useContext(ReportRangeContext);
  if (!ctx) throw new Error('useReportRange must be used within a ReportRangeProvider');
  return ctx;
}
