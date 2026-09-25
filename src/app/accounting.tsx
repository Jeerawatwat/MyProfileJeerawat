// src/app/accounting.tsx — Accounting home: Financial report
// Every figure comes from GET /api/financial-reports for the chosen range —
// computed from the database on the server (confirmed payments, approved
// refunds, expenses), never on this screen. "Export Excel" downloads the same
// report as .xlsx (same server-side queries, so the file matches the screen).
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MoneyRow, PageHeader, accountingStyles as s } from '@/components/accounting-ui';
import { DateRangePicker } from '@/components/date-range-picker';
import { RequireAccounting } from '@/components/role-guard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useReportRange } from '@/context/report-range-context';
import { useToast } from '@/context/toast-context';
import { useTheme } from '@/hooks/use-theme';
import {
  ApiError,
  downloadAuthedFile,
  financialReportsApi,
  formatBaht,
  type AuditLog,
  type FinancialReport,
} from '@/lib/api';
import { formatDateOnly, formatDateTime } from '@/lib/format';

const AUDIT_LABELS: Record<string, string> = {
  CONFIRM_PAYMENT: 'ยืนยันการชำระเงิน',
  REJECT_PAYMENT: 'ปฏิเสธการชำระเงิน',
  APPROVE_REFUND: 'อนุมัติคืนเงิน',
  REJECT_REFUND: 'ปฏิเสธการคืนเงิน',
  MARK_REFUNDED: 'บันทึกโอนคืนเงิน',
  CREATE_EXPENSE: 'เพิ่มรายจ่าย',
  EDIT_EXPENSE: 'แก้ไขรายจ่าย',
  DELETE_EXPENSE: 'ลบรายจ่าย',
  EXPORT_FINANCIAL_REPORT: 'Export รายงานการเงิน',
};

function auditTarget(log: AuditLog) {
  const d = (log.details ?? {}) as Record<string, unknown>;
  if (log.entity_type === 'payment') return `Order #${d.order_id ?? '-'}`;
  if (log.entity_type === 'refund') return `REF-${log.entity_id} (Order #${d.order_id ?? '-'})`;
  if (log.entity_type === 'expense') return `รายจ่าย #${log.entity_id}`;
  if (log.entity_type === 'report') return `${d.from ?? ''} – ${d.to ?? ''}`;
  return '';
}

function StatTile({ label, value, tone }: { label: string; value: number; tone?: 'danger' | 'success' }) {
  const theme = useTheme();
  return (
    <ThemedView type="cardBackground" style={[styles.tile, { borderColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="subtitle" themeColor={tone} style={styles.tileValue}>
        {formatBaht(value)}
      </ThemedText>
    </ThemedView>
  );
}

function AccountingReportContent() {
  const theme = useTheme();
  const { showToast } = useToast();
  // Shared with the other accounting tabs; opens on today's figures, so each
  // new day starts from 0 on its own (nothing is reset or deleted — earlier
  // days stay available via the other range chips).
  const { range } = useReportRange();
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [data, audit] = await Promise.all([financialReportsApi.get(range), financialReportsApi.auditLogs(20)]);
      setReport(data);
      setLogs(audit);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดรายงานการเงินไม่สำเร็จ');
    }
  }, [range]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await load();
      setIsLoading(false);
    })();
  }, [load]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      await downloadAuthedFile(financialReportsApi.exportPath(range), `financial-report_${range.from}_${range.to}.xlsx`);
      showToast('Export Excel สำเร็จ');
      setLogs(await financialReportsApi.auditLogs(20));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Export Excel ไม่สำเร็จ', 'error');
    } finally {
      setExporting(false);
    }
  };

  const sum = report?.summary;

  return (
    <ThemedView style={s.container}>
      <SafeAreaView style={s.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={async () => {
                setIsRefreshing(true);
                await load();
                setIsRefreshing(false);
              }}
            />
          }>
          <PageHeader
            eyebrow="ACCOUNTING"
            title="รายงานการเงิน"
            right={
              <Pressable
                style={[styles.exportButton, { backgroundColor: theme.primary }, exporting && s.disabled]}
                disabled={exporting}
                onPress={exportExcel}>
                {exporting ? (
                  <ActivityIndicator color={theme.primaryText} />
                ) : (
                  <ThemedText type="smallBold" themeColor="primaryText">
                    Export Excel
                  </ThemedText>
                )}
              </Pressable>
            }
          />
          <DateRangePicker />
          <ThemedText type="small" themeColor="textSecondary">
            {formatDateOnly(range.from)} – {formatDateOnly(range.to)}
          </ThemedText>

          {isLoading ? (
            <ActivityIndicator size="large" style={s.loading} />
          ) : error ? (
            <ThemedView type="cardBackground" style={s.errorBanner}>
              <ThemedText themeColor="danger">{error}</ThemedText>
            </ThemedView>
          ) : report && sum ? (
            <>
              {report.pending.payments > 0 || report.pending.refunds > 0 ? (
                <ThemedView type="cardBackground" style={[s.noteBox, { borderColor: theme.warning }]}>
                  <ThemedText type="small" themeColor="warning">
                    รอดำเนินการ: การชำระเงินรอตรวจสอบ {report.pending.payments} รายการ · คำขอคืนเงินรอพิจารณา{' '}
                    {report.pending.refunds} รายการ (ยังไม่นับในรายงาน)
                  </ThemedText>
                </ThemedView>
              ) : null}

              <View style={styles.grid}>
                <StatTile label="รายรับรวม" value={sum.grossIncome} />
                <StatTile label="รายจ่ายรวม" value={sum.expenses} tone="danger" />
                <StatTile label="ยอดคืนเงิน" value={sum.refunds} tone="danger" />
                <StatTile label="รายรับสุทธิ" value={sum.net} tone={sum.net < 0 ? 'danger' : 'success'} />
              </View>

              <ThemedView type="cardBackground" style={[s.card, { borderColor: theme.border }]}>
                <ThemedText type="defaultSemiBold">รายรับ</ThemedText>
                <MoneyRow label={`ยอดขายสินค้า (${sum.paidOrders} ออเดอร์)`} value={formatBaht(sum.sales)} />
                <MoneyRow label="ค่าส่ง" value={formatBaht(sum.shipping)} />
                <MoneyRow label="รายรับรวม" value={formatBaht(sum.grossIncome)} bold />
              </ThemedView>

              <ThemedView type="cardBackground" style={[s.card, { borderColor: theme.border }]}>
                <ThemedText type="defaultSemiBold">รายการหัก</ThemedText>
                <MoneyRow label="ส่วนลด" value={formatBaht(sum.discount)} />
                <MoneyRow label="ยอดคืนเงิน" value={formatBaht(sum.refunds)} />
              </ThemedView>

              <ThemedView type="cardBackground" style={[s.card, { borderColor: theme.border }]}>
                <ThemedText type="defaultSemiBold">รายจ่าย</ThemedText>
                {report.expensesByCategory.map((c) => (
                  <MoneyRow key={c.category} label={c.label} value={formatBaht(c.amount)} />
                ))}
                <MoneyRow label="รายจ่ายรวม" value={formatBaht(sum.expenses)} bold />
              </ThemedView>

              <ThemedView type="cardBackground" style={[s.card, { borderColor: theme.border }]}>
                <ThemedText type="defaultSemiBold">สรุป</ThemedText>
                <MoneyRow label="รายรับรวม" value={formatBaht(sum.grossIncome)} />
                <MoneyRow label="หัก ส่วนลด" value={`-${formatBaht(sum.discount)}`} />
                <MoneyRow label="หัก ยอดคืนเงิน" value={`-${formatBaht(sum.refunds)}`} />
                <MoneyRow label="หัก รายจ่ายรวม" value={`-${formatBaht(sum.expenses)}`} />
                <View style={[s.divided, { borderTopColor: theme.border }]}>
                  <MoneyRow label="รายรับสุทธิ" value={formatBaht(sum.net)} bold tone={sum.net < 0 ? 'danger' : 'success'} />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  นับรายรับจากวันที่ฝ่ายบัญชียืนยันการชำระเงิน และนับยอดคืนเงินจากวันที่อนุมัติ
                </ThemedText>
              </ThemedView>

              <ThemedView type="cardBackground" style={[s.card, { borderColor: theme.border }]}>
                <ThemedText type="defaultSemiBold">ประวัติการทำรายการล่าสุด (Audit Log)</ThemedText>
                {logs.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    ยังไม่มีประวัติ
                  </ThemedText>
                ) : (
                  logs.map((log) => (
                    <View key={log.log_id} style={[s.divided, { borderTopColor: theme.border }]}>
                      <ThemedText type="small">
                        <ThemedText type="smallBold">{log.username}</ThemedText> → {AUDIT_LABELS[log.action] ?? log.action}{' '}
                        {auditTarget(log)}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatDateTime(log.created_at)}
                      </ThemedText>
                    </View>
                  ))
                )}
              </ThemedView>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

export default function AccountingReportScreen() {
  return (
    <RequireAccounting>
      <AccountingReportContent />
    </RequireAccounting>
  );
}

const styles = StyleSheet.create({
  scroll: {
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.six + 48,
  },
  exportButton: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    minWidth: 110,
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  tileValue: {
    fontSize: 22,
    lineHeight: 28,
  },
});
