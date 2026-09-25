// src/lib/format.ts
// Date helpers for the finance screens. Report ranges are plain YYYY-MM-DD
// strings in the viewer's local calendar (the shop is in Thailand) and are
// sent to the backend as-is; the server does the actual range filtering.

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function formatDateOnly(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', { dateStyle: 'medium' });
}

export function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isValidYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export type RangePreset = 'today' | '7days' | 'thisMonth' | 'lastMonth' | 'custom';

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  today: 'วันนี้',
  '7days': '7 วัน',
  thisMonth: 'เดือนนี้',
  lastMonth: 'เดือนที่แล้ว',
  custom: 'กำหนดเอง',
};

export function presetRange(preset: Exclude<RangePreset, 'custom'>, now = new Date()): { from: string; to: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'today':
      return { from: toYmd(today), to: toYmd(today) };
    case '7days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { from: toYmd(start), to: toYmd(today) };
    }
    case 'thisMonth':
      return { from: toYmd(new Date(today.getFullYear(), today.getMonth(), 1)), to: toYmd(today) };
    case 'lastMonth':
      return {
        from: toYmd(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: toYmd(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
  }
}
