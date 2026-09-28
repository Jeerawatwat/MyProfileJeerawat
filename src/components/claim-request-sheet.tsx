// src/components/claim-request-sheet.tsx
// Buyer's warranty claim request — a Modal, not a separate route, matching
// how PaymentSheet/RefundRequestSheet already work in this app. This app's
// per-role navigation (src/components/user-tabs.web.tsx etc.) is a fixed
// <Tabs> list built from expo-router/ui — only routes listed there as a
// TabTrigger are reachable via router.push(); a standalone screen pushed
// from outside that list silently does nothing. A Modal sidesteps that
// entirely, opened in place from wherever the "แจ้งเคลม" action lives
// (orders.tsx per line item, claim-tracking.tsx's "+ แจ้งเคลมใหม่").
//
// Flow: type/auto-fill a Product ID / Serial Number -> the shop looks it up
// (GET /api/product-units/:serial) and shows what it is, when it was bought,
// and whether it's still in warranty -> pick what's wrong -> submit. The
// server re-validates everything (ownership, warranty, no other open claim on
// the same unit) — this sheet's lookup is only there to save typing and catch
// mistakes early, never the actual authority.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { useAuth } from '@/context/auth-context';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/format';
import {
  ApiError,
  CLAIM_COMPONENT_LABELS,
  CLAIM_ISSUE_LABELS,
  claimsApi,
  downloadAuthedFile,
  productUnitsApi,
  type ProductUnitLookup,
} from '@/lib/api';

const MAX_EVIDENCE_FILES = 5;

// Non-null opens the sheet. `serial` pre-fills and auto-runs the lookup
// (orders.tsx already knows which unit was clicked); an empty object opens
// it blank for manual entry (claim-tracking.tsx's "+ แจ้งเคลมใหม่").
export type ClaimTrigger = { orderId?: number; serial?: string } | null;

function ChipPicker({
  options,
  value,
  onChange,
}: {
  options: Record<string, string>;
  value: string;
  onChange: (key: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.chipWrap}>
      {Object.entries(options).map(([key, label]) => {
        const active = value === key;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={[
              styles.chip,
              { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : 'transparent' },
            ]}>
            <ThemedText type="small" style={{ color: active ? theme.primaryText : theme.textSecondary, fontWeight: '700' }}>
              {label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function EvidencePicker({ files, onChange, disabled }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement | null>(null);

  if (Platform.OS !== 'web') {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        การแนบไฟล์รองรับบนเว็บเบราว์เซอร์เท่านั้น
      </ThemedText>
    );
  }

  return (
    <View style={{ gap: Spacing.one }}>
      <Pressable
        style={[styles.evidenceButton, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
        onPress={() => inputRef.current?.click()}
        disabled={disabled}>
        <ThemedText type="smallBold">📎 แนบรูปภาพหรือวิดีโอหลักฐาน (สูงสุด {MAX_EVIDENCE_FILES} ไฟล์)</ThemedText>
      </Pressable>
      {/* @ts-expect-error - web-only intrinsic DOM element */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"
        style={{ display: 'none' }}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []).slice(0, MAX_EVIDENCE_FILES);
          onChange(picked);
          e.target.value = '';
        }}
      />
      {files.length > 0 ? (
        <View style={{ gap: 2 }}>
          {files.map((file, index) => (
            <View key={`${file.name}-${index}`} style={styles.fileRow}>
              <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>
                {file.name}
              </ThemedText>
              <Pressable onPress={() => onChange(files.filter((_, i) => i !== index))} disabled={disabled}>
                <ThemedText type="small" themeColor="danger">
                  ลบ
                </ThemedText>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ClaimRequestSheet({
  trigger,
  onClose,
  onSubmitted,
}: {
  trigger: ClaimTrigger;
  onClose: () => void;
  onSubmitted: (result: { claim_id: number; claim_no: string }) => void;
}) {
  const theme = useTheme();
  const { user } = useAuth();

  const [serial, setSerial] = useState('');
  const [orderId, setOrderId] = useState('');
  const [lookup, setLookup] = useState<ProductUnitLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [component, setComponent] = useState('');
  const [issueType, setIssueType] = useState('');
  const [issueDetail, setIssueDetail] = useState('');
  const [evidence, setEvidence] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ claim_id: number; claim_no: string } | null>(null);

  const visible = trigger !== null;

  const runLookup = async (serialToLookup: string) => {
    const trimmed = serialToLookup.trim();
    if (!trimmed) return;
    setIsLookingUp(true);
    setLookupError(null);
    setLookup(null);
    try {
      const found = await productUnitsApi.lookup(trimmed);
      setLookup(found);
      setOrderId(String(found.order_id));
    } catch (err) {
      setLookupError(err instanceof ApiError ? err.message : 'ค้นหาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsLookingUp(false);
    }
  };

  // Reset every time the sheet is (re)opened, and auto-run the lookup when a
  // serial is already known (opened from an order's "แจ้งเคลม" button).
  useEffect(() => {
    if (!trigger) return;
    setSerial(trigger.serial ?? '');
    setOrderId(trigger.orderId ? String(trigger.orderId) : '');
    setLookup(null);
    setLookupError(null);
    setCustomerName(user?.username ?? '');
    setCustomerPhone('');
    setComponent('');
    setIssueType('');
    setIssueDetail('');
    setEvidence([]);
    setError(null);
    setResult(null);
    if (trigger.serial) runLookup(trigger.serial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  const canSubmit = lookup && lookup.in_warranty && customerName.trim() && customerPhone.trim() && component && issueType && issueDetail.trim();

  const submit = async () => {
    if (!lookup) {
      setError('กรุณาค้นหา Product ID / Serial Number ก่อน');
      return;
    }
    const orderIdNumber = Number(orderId);
    if (!Number.isInteger(orderIdNumber) || orderIdNumber <= 0) {
      setError('เลขที่คำสั่งซื้อไม่ถูกต้อง');
      return;
    }
    if (!customerName.trim()) return setError('กรุณาระบุชื่อลูกค้า');
    if (!customerPhone.trim()) return setError('กรุณาระบุเบอร์โทรศัพท์');
    if (!component) return setError('กรุณาเลือกอุปกรณ์ที่ต้องการเคลม');
    if (!issueType) return setError('กรุณาเลือกอาการเสีย');
    if (!issueDetail.trim()) return setError('กรุณาระบุรายละเอียดปัญหา');

    setSubmitting(true);
    setError(null);
    try {
      const res = await claimsApi.submit({
        order_id: orderIdNumber,
        serial_no: lookup.serial_no,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        claim_component: component,
        issue_type: issueType,
        issue_detail: issueDetail.trim(),
        evidence,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ส่งคำขอเคลมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView type="cardBackground" style={styles.card}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {result ? (
              <View style={styles.successBox}>
                <ThemedText type="title">ส่งคำขอเคลมสำเร็จ 🎉</ThemedText>
                <ThemedText themeColor="textSecondary">เลขที่ใบเคลมของคุณคือ</ThemedText>
                <ThemedText type="title" style={{ color: theme.primary }}>
                  {result.claim_no}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  ฝ่ายบริการจะตรวจสอบและแจ้งผลผ่านหน้าติดตามการเคลม
                </ThemedText>
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.button, { backgroundColor: theme.backgroundElement }]}
                    onPress={() => downloadAuthedFile(claimsApi.pdfPath(result.claim_id), `claim-${result.claim_no}.pdf`)}>
                    <ThemedText type="smallBold">ดาวน์โหลดใบเคลม PDF</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.button, { backgroundColor: theme.primary }]}
                    onPress={() => onSubmitted(result)}>
                    <ThemedText type="smallBold" themeColor="primaryText">
                      เสร็จสิ้น
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <ThemedText type="subtitle">แจ้งเคลมสินค้า</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  กรอก Product ID / Serial Number ของสินค้าที่ซื้อ ระบบจะดึงข้อมูลสินค้าและตรวจสอบสถานะประกันให้อัตโนมัติ
                </ThemedText>
                {!trigger?.serial ? (
                  <ThemedView type="backgroundElement" style={styles.hintBox}>
                    <ThemedText type="small">
                      💡 ไม่ทราบ Serial Number ของสินค้า? ไปที่แท็บ <ThemedText type="smallBold">"คำสั่งซื้อ"</ThemedText> แล้วกดปุ่ม{' '}
                      <ThemedText type="smallBold">"แจ้งเคลม"</ThemedText> ใต้รายการสินค้าที่จัดส่งแล้วแทน ระบบจะกรอกให้อัตโนมัติ
                      ไม่ต้องพิมพ์เอง
                    </ThemedText>
                  </ThemedView>
                ) : null}

                <View style={styles.field}>
                  <ThemedText type="smallBold">Product ID / Serial Number</ThemedText>
                  <View style={styles.serialRow}>
                    <TextInput
                      value={serial}
                      onChangeText={setSerial}
                      placeholder="เช่น SPK-000125"
                      autoCapitalize="characters"
                      placeholderTextColor={theme.textSecondary}
                      style={[styles.input, styles.serialInput, { borderColor: theme.border, color: theme.text }]}
                      editable={!isLookingUp}
                    />
                    <Pressable
                      style={[styles.serialButton, { backgroundColor: theme.primary }]}
                      onPress={() => runLookup(serial)}
                      disabled={isLookingUp || !serial.trim()}>
                      {isLookingUp ? (
                        <ActivityIndicator color={theme.primaryText} />
                      ) : (
                        <ThemedText type="smallBold" themeColor="primaryText">
                          ค้นหา
                        </ThemedText>
                      )}
                    </Pressable>
                  </View>
                  {lookupError ? (
                    <ThemedText type="small" themeColor="danger">
                      {lookupError}
                    </ThemedText>
                  ) : null}
                </View>

                {lookup ? (
                  <ThemedView type="backgroundElement" style={[styles.lookupCard, { borderColor: theme.border }]}>
                    <ThemedText type="defaultSemiBold">{lookup.product_name}</ThemedText>
                    {lookup.product_model ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        รุ่น {lookup.product_model}
                      </ThemedText>
                    ) : null}
                    <ThemedText type="small">เลขที่คำสั่งซื้อ #{lookup.order_id}</ThemedText>
                    <ThemedText type="small">วันที่ซื้อ {formatDateTime(lookup.purchased_at)}</ThemedText>
                    <ThemedText type="small" themeColor={lookup.in_warranty ? 'success' : 'danger'}>
                      {lookup.in_warranty
                        ? `อยู่ในประกัน (หมดอายุ ${lookup.warranty_expires_at ?? '-'})`
                        : 'สินค้านี้หมดระยะเวลารับประกันแล้ว'}
                    </ThemedText>
                    {lookup.previous_claims.length > 0 ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        เคยเคลมมาแล้ว {lookup.previous_claims.length} ครั้ง (ล่าสุด {lookup.previous_claims[0].claim_no})
                      </ThemedText>
                    ) : null}
                  </ThemedView>
                ) : null}

                {lookup && lookup.in_warranty ? (
                  <>
                    <View style={styles.row}>
                      <View style={[styles.field, styles.rowItem]}>
                        <ThemedText type="smallBold">ชื่อลูกค้า</ThemedText>
                        <TextInput
                          value={customerName}
                          onChangeText={setCustomerName}
                          placeholderTextColor={theme.textSecondary}
                          style={[styles.input, { borderColor: theme.border, color: theme.text }]}
                        />
                      </View>
                      <View style={[styles.field, styles.rowItem]}>
                        <ThemedText type="smallBold">เบอร์โทรศัพท์</ThemedText>
                        <TextInput
                          value={customerPhone}
                          onChangeText={setCustomerPhone}
                          keyboardType="phone-pad"
                          placeholder="08xxxxxxxx"
                          placeholderTextColor={theme.textSecondary}
                          style={[styles.input, { borderColor: theme.border, color: theme.text }]}
                        />
                      </View>
                    </View>

                    <View style={styles.field}>
                      <ThemedText type="smallBold">อุปกรณ์ที่ต้องการเคลม</ThemedText>
                      <ChipPicker options={CLAIM_COMPONENT_LABELS} value={component} onChange={setComponent} />
                    </View>

                    <View style={styles.field}>
                      <ThemedText type="smallBold">อาการเสีย</ThemedText>
                      <ChipPicker options={CLAIM_ISSUE_LABELS} value={issueType} onChange={setIssueType} />
                    </View>

                    <View style={styles.field}>
                      <ThemedText type="smallBold">รายละเอียดปัญหา</ThemedText>
                      <TextInput
                        value={issueDetail}
                        onChangeText={setIssueDetail}
                        placeholder="อธิบายอาการเสียให้ละเอียดที่สุดเท่าที่ทำได้"
                        placeholderTextColor={theme.textSecondary}
                        multiline
                        numberOfLines={4}
                        style={[styles.input, styles.textArea, { borderColor: theme.border, color: theme.text }]}
                      />
                    </View>

                    <View style={styles.field}>
                      <ThemedText type="smallBold">รูปภาพหรือวิดีโอหลักฐาน (ถ้ามี)</ThemedText>
                      <EvidencePicker files={evidence} onChange={setEvidence} disabled={submitting} />
                    </View>
                  </>
                ) : null}

                {error ? (
                  <ThemedText type="small" themeColor="danger">
                    {error}
                  </ThemedText>
                ) : null}

                <View style={styles.actions}>
                  <Pressable style={[styles.button, { backgroundColor: theme.backgroundElement }]} onPress={onClose} disabled={submitting}>
                    <ThemedText type="smallBold">ย้อนกลับ</ThemedText>
                  </Pressable>
                  {lookup && lookup.in_warranty ? (
                    <Pressable
                      style={[styles.button, { backgroundColor: theme.primary }, (!canSubmit || submitting) && styles.disabled]}
                      onPress={submit}
                      disabled={!canSubmit || submitting}>
                      {submitting ? (
                        <ActivityIndicator color={theme.primaryText} />
                      ) : (
                        <ThemedText type="smallBold" themeColor="primaryText">
                          ส่งคำขอเคลม
                        </ThemedText>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              </>
            )}
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '92%',
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  field: { gap: Spacing.one },
  row: { flexDirection: 'row', gap: Spacing.three },
  rowItem: { flex: 1 },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  serialRow: { flexDirection: 'row', gap: Spacing.two },
  serialInput: { flex: 1 },
  serialButton: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintBox: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  lookupCard: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: {
    borderWidth: 1,
    borderRadius: Spacing.four,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  evidenceButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  disabled: { opacity: 0.6 },
  successBox: { gap: Spacing.two, alignItems: 'flex-start' },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  button: {
    flex: 1,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
