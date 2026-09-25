// src/app/accounting-expenses.tsx — Accounting: Income / Expenses
// Two views over the same date range:
//   รายรับ  — confirmed payments only (from the financial report endpoint, so
//            the rows are exactly what the report and Excel export count)
//   รายจ่าย — expense entries, which accounting can add / edit / delete here.
// Every expense change is audit-logged server-side.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterChips, MoneyRow, PageHeader, accountingStyles as s } from '@/components/accounting-ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DateRangePicker } from '@/components/date-range-picker';
import { EmptyState } from '@/components/empty-state';
import { FilePickButton } from '@/components/file-pick-button';
import { RequireAccounting } from '@/components/role-guard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useReportRange } from '@/context/report-range-context';
import { useToast } from '@/context/toast-context';
import { useTheme } from '@/hooks/use-theme';
import {
  ApiError,
  EXPENSE_CATEGORY_LABELS,
  expensesApi,
  financialReportsApi,
  formatBaht,
  openAuthedFile,
  PAYMENT_METHOD_LABELS,
  type Expense,
  type IncomeRow,
} from '@/lib/api';
import { formatDateOnly, formatDateTime, isValidYmd, toYmd } from '@/lib/format';

type View_ = 'income' | 'expenses';

const VIEWS: { value: View_; label: string }[] = [
  { value: 'income', label: 'รายรับ' },
  { value: 'expenses', label: 'รายจ่าย' },
];

const CATEGORY_OPTIONS = Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));

type FormState = {
  expense_id: number | null;
  expense_date: string;
  category: string;
  description: string;
  amount: string;
  attachment: File | null;
  had_attachment: boolean;
  remove_attachment: boolean;
};

function emptyForm(): FormState {
  return {
    expense_id: null,
    expense_date: toYmd(new Date()),
    category: 'PRODUCT_COST',
    description: '',
    amount: '',
    attachment: null,
    had_attachment: false,
    remove_attachment: false,
  };
}

function AccountingExpensesContent() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [view, setView] = useState<View_>('expenses');
  // Same range as the Reports tab (shared via ReportRangeProvider).
  const { range } = useReportRange();
  const [income, setIncome] = useState<IncomeRow[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (view === 'income') {
        const report = await financialReportsApi.get(range);
        setIncome(report.income);
      } else {
        setExpenses(await expensesApi.list(range));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดข้อมูลไม่สำเร็จ');
    }
  }, [view, range]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await load();
      setIsLoading(false);
    })();
  }, [load]);

  const total =
    view === 'income'
      ? income.reduce((sum, r) => sum + Math.round(r.total * 100), 0) / 100
      : expenses.reduce((sum, e) => sum + Math.round(e.amount * 100), 0) / 100;

  const openEdit = (e: Expense) => {
    setFormError(null);
    setForm({
      expense_id: e.expense_id,
      expense_date: e.expense_date,
      category: e.category,
      description: e.description,
      amount: String(e.amount),
      attachment: null,
      had_attachment: e.has_attachment,
      remove_attachment: false,
    });
  };

  const save = async () => {
    if (!form) return;
    if (!isValidYmd(form.expense_date)) return setFormError('วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD');
    if (!form.description.trim()) return setFormError('กรุณาระบุรายละเอียด');
    if (!/^\d+(\.\d{1,2})?$/.test(form.amount.trim()) || Number(form.amount) <= 0) {
      return setFormError('จำนวนเงินต้องเป็นตัวเลขมากกว่า 0 (ทศนิยมไม่เกิน 2 ตำแหน่ง)');
    }
    setSaving(true);
    setFormError(null);
    const input = {
      expense_date: form.expense_date,
      category: form.category,
      description: form.description.trim(),
      amount: form.amount.trim(),
      attachment: form.attachment,
      remove_attachment: form.remove_attachment,
    };
    try {
      if (form.expense_id) {
        await expensesApi.update(form.expense_id, input);
        showToast('บันทึกการแก้ไขรายจ่ายแล้ว');
      } else {
        await expensesApi.create(input);
        showToast('เพิ่มรายจ่ายแล้ว');
      }
      setForm(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'บันทึกรายจ่ายไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await expensesApi.remove(deleteTarget.expense_id);
      showToast('ลบรายจ่ายแล้ว');
      setDeleteTarget(null);
      await load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'ลบรายจ่ายไม่สำเร็จ', 'error');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const viewAttachment = async (id: number) => {
    try {
      await openAuthedFile(expensesApi.attachmentPath(id));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'เปิดไฟล์แนบไม่สำเร็จ', 'error');
    }
  };

  return (
    <ThemedView style={s.container}>
      <SafeAreaView style={s.safeArea} edges={['top']}>
        <PageHeader
          eyebrow="ACCOUNTING"
          title="รายรับ / รายจ่าย"
          right={
            view === 'expenses' ? (
              <Pressable
                style={[styles.addButton, { backgroundColor: theme.primary }]}
                onPress={() => {
                  setFormError(null);
                  setForm(emptyForm());
                }}>
                <ThemedText type="smallBold" themeColor="primaryText">
                  + เพิ่มรายจ่าย
                </ThemedText>
              </Pressable>
            ) : null
          }
        />
        <FilterChips options={VIEWS} value={view} onChange={setView} />
        <DateRangePicker />

        <ThemedView type="cardBackground" style={[s.card, { borderColor: theme.border }]}>
          <MoneyRow
            label={`${view === 'income' ? 'รายรับที่ยืนยันแล้ว' : 'รายจ่ายรวม'} · ${formatDateOnly(range.from)} – ${formatDateOnly(range.to)}`}
            value={formatBaht(total)}
            bold
          />
        </ThemedView>

        {isLoading ? (
          <ActivityIndicator size="large" style={s.loading} />
        ) : error ? (
          <ThemedView type="cardBackground" style={s.errorBanner}>
            <ThemedText themeColor="danger">{error}</ThemedText>
          </ThemedView>
        ) : (
          <ScrollView
            contentContainerStyle={styles.list}
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
            {view === 'income' ? (
              income.length === 0 ? (
                <EmptyState title="ไม่มีรายรับ" hint="ยังไม่มีการชำระเงินที่ยืนยันแล้วในช่วงนี้" />
              ) : (
                income.map((r) => (
                  <ThemedView key={r.payment_id} type="cardBackground" style={[s.card, { borderColor: theme.border }]}>
                    <View style={s.cardHeader}>
                      <View style={styles.flex}>
                        <ThemedText type="defaultSemiBold">
                          Order #{r.order_id} · {r.customer}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          ยืนยันเมื่อ {formatDateTime(r.date)} · {r.receipt_no}
                        </ThemedText>
                      </View>
                      <ThemedText type="defaultSemiBold" themeColor="success">
                        +{formatBaht(r.total)}
                      </ThemedText>
                    </View>
                    <MoneyRow label="ยอดสินค้า" value={formatBaht(r.product_amount)} />
                    <MoneyRow label="ค่าส่ง" value={formatBaht(r.shipping_fee)} />
                    <MoneyRow label="ส่วนลด" value={r.discount > 0 ? `-${formatBaht(r.discount)}` : formatBaht(0)} />
                    <MoneyRow label="วิธีชำระ" value={PAYMENT_METHOD_LABELS[r.payment_method] ?? r.payment_method} />
                  </ThemedView>
                ))
              )
            ) : expenses.length === 0 ? (
              <EmptyState title="ไม่มีรายจ่าย" hint="กด “+ เพิ่มรายจ่าย” เพื่อบันทึกรายการแรก" />
            ) : (
              expenses.map((e) => (
                <ThemedView key={e.expense_id} type="cardBackground" style={[s.card, { borderColor: theme.border }]}>
                  <View style={s.cardHeader}>
                    <View style={styles.flex}>
                      <ThemedText type="defaultSemiBold">{e.description}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatDateOnly(e.expense_date)} · {e.category_label} · บันทึกโดย {e.created_by_name ?? '-'}
                      </ThemedText>
                    </View>
                    <ThemedText type="defaultSemiBold" themeColor="danger">
                      -{formatBaht(e.amount)}
                    </ThemedText>
                  </View>
                  <View style={s.actions}>
                    {e.has_attachment ? (
                      <Pressable style={[s.button, { backgroundColor: theme.backgroundElement }]} onPress={() => viewAttachment(e.expense_id)}>
                        <ThemedText type="smallBold">ดูไฟล์แนบ</ThemedText>
                      </Pressable>
                    ) : null}
                    <Pressable style={[s.button, { backgroundColor: theme.backgroundElement }]} onPress={() => openEdit(e)}>
                      <ThemedText type="smallBold">แก้ไข</ThemedText>
                    </Pressable>
                    <Pressable style={[s.button, { backgroundColor: theme.backgroundElement }]} onPress={() => setDeleteTarget(e)}>
                      <ThemedText type="smallBold" themeColor="danger">
                        ลบ
                      </ThemedText>
                    </Pressable>
                  </View>
                </ThemedView>
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      <Modal visible={form !== null} transparent animationType="slide" onRequestClose={() => setForm(null)}>
        <View style={s.modalBackdrop}>
          <ThemedView type="cardBackground" style={s.modalCard}>
            {form ? (
              <ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
                <ThemedText type="subtitle">{form.expense_id ? 'แก้ไขรายจ่าย' : 'เพิ่มรายจ่าย'}</ThemedText>

                <View style={styles.field}>
                  <ThemedText type="smallBold">ประเภทรายจ่าย</ThemedText>
                  <FilterChips
                    options={CATEGORY_OPTIONS}
                    value={form.category}
                    onChange={(category) => setForm({ ...form, category })}
                  />
                </View>

                <View style={styles.field}>
                  <ThemedText type="smallBold">วันที่ (YYYY-MM-DD)</ThemedText>
                  <TextInput
                    value={form.expense_date}
                    onChangeText={(expense_date) => setForm({ ...form, expense_date })}
                    style={[s.input, { borderColor: theme.border, color: theme.text }]}
                    editable={!saving}
                  />
                </View>

                <View style={styles.field}>
                  <ThemedText type="smallBold">รายละเอียด</ThemedText>
                  <TextInput
                    value={form.description}
                    onChangeText={(description) => setForm({ ...form, description })}
                    placeholder="เช่น ค่าใบชา 10 กก."
                    placeholderTextColor={theme.textSecondary}
                    style={[s.input, { borderColor: theme.border, color: theme.text }]}
                    maxLength={500}
                    editable={!saving}
                  />
                </View>

                <View style={styles.field}>
                  <ThemedText type="smallBold">จำนวนเงิน (บาท)</ThemedText>
                  <TextInput
                    value={form.amount}
                    onChangeText={(amount) => setForm({ ...form, amount })}
                    placeholder="0.00"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="decimal-pad"
                    style={[s.input, { borderColor: theme.border, color: theme.text }]}
                    editable={!saving}
                  />
                </View>

                <View style={styles.field}>
                  <ThemedText type="smallBold">หลักฐาน / ไฟล์แนบ (ถ้ามี)</ThemedText>
                  <FilePickButton
                    label="แนบรูปหรือ PDF"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    file={form.attachment}
                    onPick={(attachment) => setForm({ ...form, attachment, remove_attachment: false })}
                    disabled={saving}
                  />
                  {form.had_attachment && !form.attachment ? (
                    <Pressable onPress={() => setForm({ ...form, remove_attachment: !form.remove_attachment })}>
                      <ThemedText type="small" themeColor={form.remove_attachment ? 'danger' : 'textSecondary'}>
                        {form.remove_attachment ? '✓ จะลบไฟล์แนบเดิมเมื่อบันทึก (แตะเพื่อยกเลิก)' : 'มีไฟล์แนบเดิมอยู่แล้ว · แตะเพื่อลบไฟล์แนบ'}
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </View>

                {formError ? (
                  <ThemedText type="small" themeColor="danger">
                    {formError}
                  </ThemedText>
                ) : null}

                <View style={s.actions}>
                  <Pressable style={[s.button, { backgroundColor: theme.backgroundElement }]} disabled={saving} onPress={() => setForm(null)}>
                    <ThemedText type="smallBold">ยกเลิก</ThemedText>
                  </Pressable>
                  <Pressable style={[s.button, { backgroundColor: theme.primary }, saving && s.disabled]} disabled={saving} onPress={save}>
                    {saving ? (
                      <ActivityIndicator color={theme.primaryText} />
                    ) : (
                      <ThemedText type="smallBold" themeColor="primaryText">
                        บันทึก
                      </ThemedText>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            ) : null}
          </ThemedView>
        </View>
      </Modal>

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="ลบรายจ่ายนี้?"
        message={deleteTarget ? `${deleteTarget.description} · ${formatBaht(deleteTarget.amount)} (ระบบจะเก็บประวัติการลบไว้ใน Audit Log)` : ''}
        confirmLabel="ลบ"
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </ThemedView>
  );
}

export default function AccountingExpensesScreen() {
  return (
    <RequireAccounting>
      <AccountingExpensesContent />
    </RequireAccounting>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  flex: {
    flex: 1,
  },
  addButton: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  field: {
    gap: Spacing.one,
  },
});
