// src/app/claims-admin.tsx — Admin: Product Claims
// Mirrors accounting-refunds.tsx's shape (list + filters + expand for detail +
// a status-change action), but for warranty claims, which an admin owns (they
// inspect product condition, same as they already own product CRUD in
// products.routes.js) — not accounting, manager, stock, or delivery. Every
// status change is audit-logged server-side (backend/routes/claims.routes.js).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterChips, PageHeader, accountingStyles as s } from '@/components/accounting-ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { ClaimStatusBadge } from '@/components/payment-status-badge';
import { ReasonDialog } from '@/components/reason-dialog';
import { RequireAdmin } from '@/components/role-guard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useToast } from '@/context/toast-context';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/format';
import {
  ApiError,
  CLAIM_COMPONENT_LABELS,
  CLAIM_ISSUE_LABELS,
  CLAIM_RESOLUTION_LABELS,
  CLAIM_STATUS_LABELS,
  claimsApi,
  downloadAuthedFile,
  openAuthedFile,
  type Claim,
  type ClaimDetail,
} from '@/lib/api';

const FORWARD_STEPS: Record<string, string[]> = {
  PENDING_REVIEW: ['INSPECTING', 'APPROVED', 'REJECTED'],
  INSPECTING: ['APPROVED', 'REJECTED'],
  APPROVED: ['REPAIRING', 'SHIPPING_REPLACEMENT', 'COMPLETED'],
  REPAIRING: ['SHIPPING_REPLACEMENT', 'COMPLETED'],
  SHIPPING_REPLACEMENT: ['COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
};

const FILTERS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'ทั้งหมด' },
  { value: 'PENDING_REVIEW', label: 'รอตรวจสอบ' },
  { value: 'INSPECTING', label: 'กำลังตรวจสอบ' },
  { value: 'APPROVED', label: 'อนุมัติแล้ว' },
  { value: 'REPAIRING', label: 'กำลังซ่อม' },
  { value: 'SHIPPING_REPLACEMENT', label: 'กำลังจัดส่งใหม่' },
  { value: 'COMPLETED', label: 'เสร็จสิ้น' },
  { value: 'REJECTED', label: 'ไม่อนุมัติ' },
];

// Small modal for APPROVED: pick the resolution (ซ่อม / เปลี่ยนสินค้าใหม่ /
// คืนเงิน) — REFUND also needs an amount, and creates a normal Refunds row
// server-side (see claims.routes.js).
function ResolutionDialog({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (resolutionType: string, refundAmount?: string) => Promise<string | void>;
}) {
  const theme = useTheme();
  const [resolution, setResolution] = useState('REPAIR');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setResolution('REPAIR');
      setAmount('');
      setError(null);
    }
  }, [visible]);

  const submit = async () => {
    if (resolution === 'REFUND' && (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || Number(amount) <= 0)) {
      setError('กรุณาระบุจำนวนเงินที่จะคืนให้ถูกต้อง');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const message = await onConfirm(resolution, resolution === 'REFUND' ? amount.trim() : undefined);
      if (message) setError(message);
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;
  return (
    <ConfirmDialogShell onCancel={onCancel}>
      <ThemedText type="subtitle">อนุมัติการเคลม — เลือกผลการเคลม</ThemedText>
      <View style={styles.chipRow}>
        {Object.entries(CLAIM_RESOLUTION_LABELS).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setResolution(key)}
            style={[
              styles.chip,
              { borderColor: resolution === key ? theme.primary : theme.border, backgroundColor: resolution === key ? theme.primary : 'transparent' },
            ]}>
            <ThemedText type="small" style={{ color: resolution === key ? theme.primaryText : theme.textSecondary, fontWeight: '700' }}>
              {label}
            </ThemedText>
          </Pressable>
        ))}
      </View>
      {resolution === 'REFUND' ? (
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="จำนวนเงินที่จะคืน (บาท)"
          keyboardType="decimal-pad"
          placeholderTextColor={theme.textSecondary}
          style={[s.input, { borderColor: theme.border, color: theme.text }]}
          editable={!busy}
        />
      ) : null}
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
      <View style={styles.dialogActions}>
        <Pressable style={[s.button, { backgroundColor: theme.backgroundElement }]} disabled={busy} onPress={onCancel}>
          <ThemedText type="smallBold">ย้อนกลับ</ThemedText>
        </Pressable>
        <Pressable style={[s.button, { backgroundColor: theme.success }]} disabled={busy} onPress={submit}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>ยืนยันอนุมัติ</ThemedText>}
        </Pressable>
      </View>
    </ConfirmDialogShell>
  );
}

function ConfirmDialogShell({ children, onCancel }: { children: ReactNode; onCancel: () => void }) {
  const theme = useTheme();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.resolutionBackdrop}>
        <ThemedView type="cardBackground" style={[styles.resolutionCard, { borderColor: theme.border }]}>
          {children}
        </ThemedView>
      </View>
    </Modal>
  );
}

type PendingSimple = { claim: Claim; status: string } | null;

function AdminClaimsContent() {
  const theme = useTheme();
  const { showToast } = useToast();
  const [filter, setFilter] = useState('PENDING_REVIEW');
  const [claimNoQuery, setClaimNoQuery] = useState('');
  const [serialQuery, setSerialQuery] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [claims, setClaims] = useState<Claim[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ClaimDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pendingSimple, setPendingSimple] = useState<PendingSimple>(null);
  const [rejectTarget, setRejectTarget] = useState<Claim | null>(null);
  const [approveTarget, setApproveTarget] = useState<Claim | null>(null);
  const [busy, setBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await claimsApi.list({
        status: filter === 'ALL' ? undefined : filter,
        claim_no: claimNoQuery.trim() || undefined,
        serial_no: serialQuery.trim() || undefined,
        product_name: productQuery.trim() || undefined,
        customer_name: customerQuery.trim() || undefined,
      });
      setClaims(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดรายการเคลมไม่สำเร็จ');
    }
  }, [filter, claimNoQuery, serialQuery, productQuery, customerQuery]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await load();
      setIsLoading(false);
    })();
  }, [load]);

  const toggleExpand = async (claim: Claim) => {
    if (expandedId === claim.claim_id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(claim.claim_id);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await claimsApi.get(claim.claim_id));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'โหลดรายละเอียดไม่สำเร็จ', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetailIfOpen = async (claimId: number) => {
    if (expandedId === claimId) setDetail(await claimsApi.get(claimId));
  };

  const runSimple = async () => {
    if (!pendingSimple) return;
    setBusy(true);
    try {
      await claimsApi.updateStatus(pendingSimple.claim.claim_id, { status: pendingSimple.status });
      showToast(`อัปเดตสถานะ ${pendingSimple.claim.claim_no} แล้ว`);
      setPendingSimple(null);
      await load();
      await refreshDetailIfOpen(pendingSimple.claim.claim_id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'อัปเดตสถานะไม่สำเร็จ', 'error');
      setPendingSimple(null);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!rejectTarget) return;
    try {
      await claimsApi.updateStatus(rejectTarget.claim_id, { status: 'REJECTED', rejected_reason: reason });
      showToast(`ไม่อนุมัติการเคลม ${rejectTarget.claim_no} แล้ว`);
      const id = rejectTarget.claim_id;
      setRejectTarget(null);
      await load();
      await refreshDetailIfOpen(id);
    } catch (err) {
      return err instanceof ApiError ? err.message : 'ดำเนินการไม่สำเร็จ';
    }
  };

  const handleApprove = async (resolutionType: string, refundAmount?: string) => {
    if (!approveTarget) return;
    try {
      await claimsApi.updateStatus(approveTarget.claim_id, {
        status: 'APPROVED',
        resolution_type: resolutionType,
        refund_amount: refundAmount,
      });
      showToast(`อนุมัติการเคลม ${approveTarget.claim_no} แล้ว`);
      const id = approveTarget.claim_id;
      setApproveTarget(null);
      await load();
      await refreshDetailIfOpen(id);
    } catch (err) {
      return err instanceof ApiError ? err.message : 'อนุมัติไม่สำเร็จ';
    }
  };

  const viewAttachment = async (claimId: number, attachmentId: number) => {
    try {
      await openAuthedFile(claimsApi.attachmentPath(claimId, attachmentId));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'เปิดไฟล์ไม่สำเร็จ', 'error');
    }
  };

  const uploadInspectionPhotos = async (claimId: number, files: File[]) => {
    if (!files.length) return;
    try {
      await claimsApi.uploadInspectionPhotos(claimId, files);
      showToast('อัปโหลดรูปผลการตรวจสอบแล้ว');
      await refreshDetailIfOpen(claimId);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'อัปโหลดไม่สำเร็จ', 'error');
    }
  };

  return (
    <ThemedView style={s.container}>
      <SafeAreaView style={s.safeArea} edges={['top']}>
        <PageHeader eyebrow="ADMIN" title="การเคลมสินค้า" />

        <View style={styles.filterInputs}>
          <TextInput
            value={claimNoQuery}
            onChangeText={setClaimNoQuery}
            placeholder="เลขที่ใบเคลม"
            placeholderTextColor={theme.textSecondary}
            style={[s.input, styles.filterInput, { borderColor: theme.border, color: theme.text }]}
            onSubmitEditing={load}
          />
          <TextInput
            value={serialQuery}
            onChangeText={setSerialQuery}
            placeholder="Product ID / Serial"
            placeholderTextColor={theme.textSecondary}
            style={[s.input, styles.filterInput, { borderColor: theme.border, color: theme.text }]}
            onSubmitEditing={load}
          />
          <TextInput
            value={productQuery}
            onChangeText={setProductQuery}
            placeholder="ชื่อสินค้า"
            placeholderTextColor={theme.textSecondary}
            style={[s.input, styles.filterInput, { borderColor: theme.border, color: theme.text }]}
            onSubmitEditing={load}
          />
          <TextInput
            value={customerQuery}
            onChangeText={setCustomerQuery}
            placeholder="ชื่อลูกค้า"
            placeholderTextColor={theme.textSecondary}
            style={[s.input, styles.filterInput, { borderColor: theme.border, color: theme.text }]}
            onSubmitEditing={load}
          />
          <Pressable style={[styles.searchButton, { backgroundColor: theme.backgroundElement }]} onPress={load}>
            <ThemedText type="smallBold">ค้นหา</ThemedText>
          </Pressable>
        </View>

        <FilterChips options={FILTERS} value={filter} onChange={setFilter} />

        {isLoading ? (
          <ActivityIndicator size="large" style={s.loading} />
        ) : error ? (
          <ThemedView type="cardBackground" style={s.errorBanner}>
            <ThemedText themeColor="danger">{error}</ThemedText>
          </ThemedView>
        ) : claims.length === 0 ? (
          <EmptyState title="ไม่มีรายการเคลม" hint="ยังไม่มีคำขอในเงื่อนไขนี้" />
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
            {claims.map((claim) => {
              const expanded = expandedId === claim.claim_id;
              const nextSteps = FORWARD_STEPS[claim.status] || [];
              return (
                <ThemedView key={claim.claim_id} type="cardBackground" style={[s.card, { borderColor: theme.border }]}>
                  <Pressable onPress={() => toggleExpand(claim)}>
                    <View style={s.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <ThemedText type="defaultSemiBold">
                          {claim.claim_no} · Order #{claim.order_id}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {claim.customer_name} · {claim.product_name_snapshot} · {formatDateTime(claim.created_at)}
                        </ThemedText>
                      </View>
                      <ClaimStatusBadge status={claim.status} />
                    </View>
                  </Pressable>

                  {expanded ? (
                    detailLoading || !detail ? (
                      <ActivityIndicator style={{ marginTop: Spacing.two }} />
                    ) : (
                      <View style={[s.divided]}>
                        <ThemedText type="small">Serial: {detail.serial_no_snapshot}</ThemedText>
                        <ThemedText type="small">โทร: {detail.customer_phone}</ThemedText>
                        <ThemedText type="small">
                          อุปกรณ์: {CLAIM_COMPONENT_LABELS[detail.claim_component] ?? detail.claim_component} · อาการ:{' '}
                          {CLAIM_ISSUE_LABELS[detail.issue_type] ?? detail.issue_type}
                        </ThemedText>
                        <View style={[s.noteBox, { borderColor: theme.border }]}>
                          <ThemedText type="small">{detail.issue_detail}</ThemedText>
                        </View>
                        {detail.rejected_reason ? (
                          <ThemedText type="small" themeColor="danger">
                            เหตุผลที่ไม่อนุมัติ: {detail.rejected_reason}
                          </ThemedText>
                        ) : null}
                        {detail.resolution_type ? (
                          <ThemedText type="small">
                            ผลการเคลม: {CLAIM_RESOLUTION_LABELS[detail.resolution_type] ?? detail.resolution_type}
                            {detail.linked_refund_id ? ` (สร้างคำขอคืนเงิน #${detail.linked_refund_id} แล้ว — รอบัญชีอนุมัติ)` : ''}
                          </ThemedText>
                        ) : null}
                        {detail.handled_by_name ? (
                          <ThemedText type="small" themeColor="textSecondary">
                            ดำเนินการล่าสุดโดย {detail.handled_by_name}
                          </ThemedText>
                        ) : null}

                        {detail.attachments.length > 0 ? (
                          <View style={styles.attachmentRow}>
                            {detail.attachments.map((a) => (
                              <Pressable
                                key={a.attachment_id}
                                style={[styles.attachmentChip, { borderColor: theme.border }]}
                                onPress={() => viewAttachment(detail.claim_id, a.attachment_id)}>
                                <ThemedText type="small">{a.kind === 'EVIDENCE' ? '📎 หลักฐาน' : '🔍 ผลตรวจสอบ'}</ThemedText>
                              </Pressable>
                            ))}
                          </View>
                        ) : null}

                        {Platform.OS === 'web' ? (
                          <View style={styles.inspectionRow}>
                            <Pressable
                              style={[s.button, { backgroundColor: theme.backgroundElement }]}
                              onPress={() => photoInputRef.current?.click()}>
                              <ThemedText type="smallBold">แนบรูปผลตรวจสอบ</ThemedText>
                            </Pressable>
                            {/* @ts-expect-error - web-only intrinsic DOM element */}
                            <input
                              ref={photoInputRef}
                              type="file"
                              multiple
                              accept="image/png,image/jpeg,image/webp"
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const files = Array.from(e.target.files ?? []);
                                e.target.value = '';
                                uploadInspectionPhotos(detail.claim_id, files);
                              }}
                            />
                          </View>
                        ) : null}

                        <Pressable
                          style={[styles.pdfButton, { backgroundColor: theme.backgroundElement }]}
                          onPress={() => downloadAuthedFile(claimsApi.pdfPath(detail.claim_id), `claim-${detail.claim_no}.pdf`)}>
                          <ThemedText type="smallBold">ดาวน์โหลดใบเคลม PDF</ThemedText>
                        </Pressable>

                        {nextSteps.length > 0 ? (
                          <View style={s.actions}>
                            {nextSteps.map((step) => (
                              <Pressable
                                key={step}
                                style={[
                                  s.button,
                                  { backgroundColor: step === 'REJECTED' ? theme.danger : step === 'APPROVED' ? theme.success : theme.primary },
                                ]}
                                onPress={() => {
                                  if (step === 'REJECTED') setRejectTarget(claim);
                                  else if (step === 'APPROVED') setApproveTarget(claim);
                                  else setPendingSimple({ claim, status: step });
                                }}>
                                <ThemedText type="smallBold" style={{ color: step === 'APPROVED' ? '#FFFFFF' : theme.primaryText }}>
                                  {CLAIM_STATUS_LABELS[step]}
                                </ThemedText>
                              </Pressable>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    )
                  ) : null}
                </ThemedView>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>

      <ConfirmDialog
        visible={pendingSimple !== null}
        title="เปลี่ยนสถานะการเคลม?"
        message={pendingSimple ? `เปลี่ยนสถานะ ${pendingSimple.claim.claim_no} เป็น "${CLAIM_STATUS_LABELS[pendingSimple.status]}"` : ''}
        confirmLabel="ยืนยัน"
        destructive={false}
        busy={busy}
        onCancel={() => setPendingSimple(null)}
        onConfirm={runSimple}
      />
      <ReasonDialog
        visible={rejectTarget !== null}
        title={`ไม่อนุมัติการเคลม ${rejectTarget?.claim_no ?? ''}`}
        hint="ลูกค้าจะเห็นเหตุผลนี้ในหน้าติดตามการเคลม"
        placeholder="เช่น อาการเสียเกิดจากการใช้งานผิดวิธี ไม่อยู่ในเงื่อนไขประกัน"
        confirmLabel="ไม่อนุมัติ"
        onCancel={() => setRejectTarget(null)}
        onConfirm={handleReject}
      />
      <ResolutionDialog visible={approveTarget !== null} onCancel={() => setApproveTarget(null)} onConfirm={handleApprove} />
    </ThemedView>
  );
}

export default function ClaimsAdminScreen() {
  return (
    <RequireAdmin>
      <AdminClaimsContent />
    </RequireAdmin>
  );
}

const styles = StyleSheet.create({
  filterInputs: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  filterInput: { flexGrow: 1, minWidth: 140 },
  searchButton: { borderRadius: Spacing.three, paddingHorizontal: Spacing.three, justifyContent: 'center' },
  list: { gap: Spacing.three, paddingBottom: BottomTabInset + Spacing.six },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderWidth: 1, borderRadius: Spacing.four, paddingVertical: Spacing.one, paddingHorizontal: Spacing.two },
  dialogActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  resolutionBackdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  resolutionCard: { width: '100%', maxWidth: 420, borderRadius: Spacing.four, borderWidth: 1, padding: Spacing.five, gap: Spacing.two },
  attachmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  attachmentChip: { borderWidth: 1, borderRadius: Spacing.three, paddingVertical: Spacing.one, paddingHorizontal: Spacing.two },
  inspectionRow: { flexDirection: 'row' },
  pdfButton: { alignSelf: 'flex-start', borderRadius: Spacing.three, paddingVertical: Spacing.one, paddingHorizontal: Spacing.three },
});
