// backend/services/claims.js
// Shared rules/constants for product warranty claims (see
// sql/009_product_claims.sql). Mirrors how backend/services/finance.js holds
// the Refunds/Payments constants — one source of truth the routes and the
// frontend's labels both trace back to.
const { formatBangkok } = require('./finance');

const CLAIM_STATUS = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  INSPECTING: 'INSPECTING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REPAIRING: 'REPAIRING',
  SHIPPING_REPLACEMENT: 'SHIPPING_REPLACEMENT',
  COMPLETED: 'COMPLETED',
};

// Forward order shown in the customer-facing timeline. REJECTED is a
// terminal side-branch, not a step on this line.
const CLAIM_STATUS_FLOW = [
  CLAIM_STATUS.PENDING_REVIEW,
  CLAIM_STATUS.INSPECTING,
  CLAIM_STATUS.APPROVED,
  CLAIM_STATUS.REPAIRING,
  CLAIM_STATUS.SHIPPING_REPLACEMENT,
  CLAIM_STATUS.COMPLETED,
];

const CLAIM_TERMINAL_STATUSES = [CLAIM_STATUS.REJECTED, CLAIM_STATUS.COMPLETED];

// Thai labels — used by the claim PDF (backend/services/pdf.js). The
// frontend keeps its own copy (src/lib/api.ts's CLAIM_STATUS_LABELS) since it
// can't import this backend module directly; keep the two in sync by hand.
const CLAIM_STATUS_LABELS = {
  [CLAIM_STATUS.PENDING_REVIEW]: 'รอตรวจสอบ',
  [CLAIM_STATUS.INSPECTING]: 'กำลังตรวจสอบสินค้า',
  [CLAIM_STATUS.APPROVED]: 'อนุมัติการเคลม',
  [CLAIM_STATUS.REJECTED]: 'ไม่อนุมัติการเคลม',
  [CLAIM_STATUS.REPAIRING]: 'กำลังซ่อม',
  [CLAIM_STATUS.SHIPPING_REPLACEMENT]: 'กำลังจัดส่งสินค้าใหม่',
  [CLAIM_STATUS.COMPLETED]: 'เคลมเสร็จสิ้น',
};

// A claim can only be rejected while it's still being looked at — once it's
// past APPROVED the shop has already committed to a resolution.
const REJECTABLE_FROM = [CLAIM_STATUS.PENDING_REVIEW, CLAIM_STATUS.INSPECTING];

function isValidStatusTransition(from, to) {
  if (CLAIM_TERMINAL_STATUSES.includes(from)) return false; // no re-opening
  if (to === CLAIM_STATUS.REJECTED) return REJECTABLE_FROM.includes(from);
  if (!CLAIM_STATUS_FLOW.includes(to)) return false;
  // Allow moving forward to any later step (skipping e.g. REPAIRING for a
  // straight refund), but never backward.
  return CLAIM_STATUS_FLOW.indexOf(to) > CLAIM_STATUS_FLOW.indexOf(from);
}

const CLAIM_COMPONENTS = {
  SPEAKER: 'ลำโพง',
  MICROPHONE: 'ไมโครโฟน',
  CHARGING_CABLE: 'สายชาร์จ',
  ADAPTER: 'อะแดปเตอร์',
  OTHER: 'อื่น ๆ',
};

const CLAIM_ISSUE_TYPES = {
  NO_POWER: 'เปิดไม่ติด',
  NO_SOUND: 'ไม่มีเสียง',
  ABNORMAL_SOUND: 'เสียงผิดปกติ',
  MIC_NOT_WORKING: 'ไมโครโฟนไม่ทำงาน',
  BLUETOOTH_FAIL: 'Bluetooth เชื่อมต่อไม่ได้',
  NOT_CHARGING: 'ชาร์จไม่เข้า',
  BUTTON_ISSUE: 'ปุ่มควบคุมมีปัญหา',
  OTHER: 'อื่น ๆ',
};

// Chosen by the admin together with APPROVED. REFUND additionally creates a
// normal row in Refunds (see claims.routes.js) — the customer's money still
// only ever moves through accounting's existing approve/reject/mark-refunded
// flow, unchanged.
const CLAIM_RESOLUTION_TYPES = {
  REPAIR: 'ซ่อม',
  REPLACEMENT: 'เปลี่ยนสินค้าใหม่',
  REFUND: 'คืนเงิน',
};

// CLM-YYYYMMDD-000123 — the numeric part is the claim's own auto-increment
// id (never reused, never racy), same trick as makeReceiptNo() in
// payments.routes.js for RC-numbers. Assigned right after insert once
// claim_id is known.
function makeClaimNo(claimId, date) {
  const ymd = formatBangkok(date).slice(0, 10).replace(/-/g, '');
  return `CLM-${ymd}-${String(claimId).padStart(6, '0')}`;
}

module.exports = {
  CLAIM_STATUS,
  CLAIM_STATUS_FLOW,
  CLAIM_TERMINAL_STATUSES,
  CLAIM_STATUS_LABELS,
  CLAIM_COMPONENTS,
  CLAIM_ISSUE_TYPES,
  CLAIM_RESOLUTION_TYPES,
  isValidStatusTransition,
  makeClaimNo,
};
