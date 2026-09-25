// backend/services/finance.js
// Shared finance rules + queries. The financial report screen and the Excel
// export both call buildFinancialReport() — the SAME queries — so an exported
// file can never disagree with what the dashboard showed for the same range.
//
// Recognition rules (what counts, and on which date):
//   * Income  = Payments with payment_status = 'PAID', dated by verified_at
//               (the moment accounting confirmed the money arrived). A payment
//               still PAID_PENDING_VERIFICATION is never income. The backend
//               allows at most one PAID payment per order, so an order can't
//               be counted twice.
//   * Refunds = Refunds with status REFUND_APPROVED or REFUNDED, dated by
//               approved_at (counted as soon as accounting approves).
//   * Expenses = Expenses rows, dated by expense_date.
//   * Net     = (product sales + shipping) - discount - refunds - expenses
const { pool } = require('../config/db');
const { round2, toSatang, fromSatang } = require('../utils/money');

const PAYMENT_STATUS = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID_PENDING_VERIFICATION: 'PAID_PENDING_VERIFICATION',
  PAID: 'PAID',
  PAYMENT_REJECTED: 'PAYMENT_REJECTED',
  REFUNDED: 'REFUNDED',
};

const REFUND_STATUS = {
  REFUND_REQUESTED: 'REFUND_REQUESTED',
  REFUND_APPROVED: 'REFUND_APPROVED',
  REFUND_REJECTED: 'REFUND_REJECTED',
  REFUNDED: 'REFUNDED',
};

// Refund statuses that "use up" part of the paid amount. A REQUESTED refund
// counts too, so two pending requests can't together exceed what was paid.
const REFUND_RESERVING_STATUSES = [
  REFUND_STATUS.REFUND_REQUESTED,
  REFUND_STATUS.REFUND_APPROVED,
  REFUND_STATUS.REFUNDED,
];
const REFUND_COUNTED_STATUSES = [REFUND_STATUS.REFUND_APPROVED, REFUND_STATUS.REFUNDED];

const EXPENSE_CATEGORIES = {
  PRODUCT_COST: 'ค่าสินค้า',
  ADVERTISING: 'ค่าโฆษณา',
  SHIPPING: 'ค่าขนส่ง',
  EQUIPMENT: 'ค่าอุปกรณ์',
  OTHER: 'ค่าใช้จ่ายอื่น ๆ',
};

const PAYMENT_METHODS = { QR: 'สแกน QR โอนเงิน' };

// ---- Dates ---------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateString(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Parses ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive). Returns the half-open
// DATETIME range [from 00:00:00, day-after-to 00:00:00) used by every query,
// so a payment confirmed at 23:59:59 on `to` is still included.
function parseDateRange(query) {
  const from = query && query.from;
  const to = query && query.to;
  if (!isValidDateString(from) || !isValidDateString(to)) {
    return { error: 'กรุณาระบุวันที่เริ่มต้นและสิ้นสุดในรูปแบบ YYYY-MM-DD' };
  }
  if (from > to) return { error: 'วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด' };
  const next = new Date(`${to}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    from,
    to,
    startDateTime: `${from} 00:00:00`,
    endExclusive: `${next.toISOString().slice(0, 10)} 00:00:00`,
  };
}

// ---- Orders --------------------------------------------------------------

// product_amount is always recomputed from Order_Details — never stored twice.
async function getOrderFinancials(db, orderId, { forUpdate = false } = {}) {
  const [rows] = await db.query(
    `SELECT o.order_id, o.user_id, o.order_date, o.status, o.payment_status,
            o.total_amount, o.shipping_fee, o.discount, u.username
     FROM Orders o JOIN Users u ON u.id = o.user_id
     WHERE o.order_id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [orderId]
  );
  const order = rows[0];
  if (!order) return null;

  const [items] = await db.query(
    `SELECT od.product_id, od.quantity, od.price, od.subtotal, i.name
     FROM Order_Details od LEFT JOIN Inventory i ON i.id = od.product_id
     WHERE od.order_id = ? ORDER BY od.order_detail_id ASC`,
    [orderId]
  );

  return {
    ...order,
    total_amount: Number(order.total_amount),
    shipping_fee: Number(order.shipping_fee),
    discount: Number(order.discount),
    product_amount: round2(items.reduce((sum, i) => sum + Number(i.subtotal), 0)),
    items: items.map((i) => ({
      product_id: i.product_id,
      name: i.name || `Product #${i.product_id}`,
      quantity: i.quantity,
      price: Number(i.price),
      subtotal: Number(i.subtotal),
    })),
  };
}

// Sum of refunds on a payment in the given statuses, in satang.
async function sumRefundsSatang(db, paymentId, statuses, { excludeRefundId } = {}) {
  const placeholders = statuses.map(() => '?').join(',');
  const params = [paymentId, ...statuses];
  let sql = `SELECT COALESCE(SUM(refund_amount), 0) AS total FROM Refunds WHERE payment_id = ? AND status IN (${placeholders})`;
  if (excludeRefundId) {
    sql += ' AND refund_id <> ?';
    params.push(excludeRefundId);
  }
  const [[row]] = await db.query(sql, params);
  return toSatang(row.total);
}

// ---- Report --------------------------------------------------------------

async function getIncomeRows(range) {
  const [rows] = await pool.query(
    `SELECT p.payment_id, p.order_id, p.amount, p.payment_method, p.payment_status, p.verified_at,
            p.receipt_no, o.shipping_fee, o.discount, o.payment_status AS order_payment_status,
            u.username,
            (SELECT COALESCE(SUM(od.subtotal), 0) FROM Order_Details od WHERE od.order_id = p.order_id) AS product_amount,
            (SELECT GROUP_CONCAT(CONCAT(COALESCE(i.name, CONCAT('Product #', od.product_id)), ' x', od.quantity)
                    ORDER BY od.order_detail_id SEPARATOR ', ')
               FROM Order_Details od LEFT JOIN Inventory i ON i.id = od.product_id
              WHERE od.order_id = p.order_id) AS products
     FROM Payments p
     JOIN Orders o ON o.order_id = p.order_id
     JOIN Users u ON u.id = p.user_id
     WHERE p.payment_status = ? AND p.verified_at >= ? AND p.verified_at < ?
     ORDER BY p.verified_at ASC, p.payment_id ASC`,
    [PAYMENT_STATUS.PAID, range.startDateTime, range.endExclusive]
  );
  return rows.map((r) => ({
    payment_id: r.payment_id,
    order_id: r.order_id,
    date: r.verified_at,
    customer: r.username,
    products: r.products || '',
    product_amount: Number(r.product_amount),
    shipping_fee: Number(r.shipping_fee),
    discount: Number(r.discount),
    total: Number(r.amount),
    payment_method: r.payment_method,
    payment_status: r.order_payment_status,
    receipt_no: r.receipt_no,
  }));
}

async function getRefundRows(range) {
  const placeholders = REFUND_COUNTED_STATUSES.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT r.refund_id, r.order_id, r.refund_amount, r.reason, r.status, r.approved_at, u.username
     FROM Refunds r JOIN Users u ON u.id = r.user_id
     WHERE r.status IN (${placeholders}) AND r.approved_at >= ? AND r.approved_at < ?
     ORDER BY r.approved_at ASC, r.refund_id ASC`,
    [...REFUND_COUNTED_STATUSES, range.startDateTime, range.endExclusive]
  );
  return rows.map((r) => ({
    refund_id: r.refund_id,
    order_id: r.order_id,
    date: r.approved_at,
    customer: r.username,
    refund_amount: Number(r.refund_amount),
    reason: r.reason,
    status: r.status,
  }));
}

async function getExpenseRows(range) {
  const [rows] = await pool.query(
    `SELECT e.expense_id, DATE_FORMAT(e.expense_date, '%Y-%m-%d') AS expense_date, e.category, e.description, e.amount, e.attachment_path,
            e.created_at, e.updated_at, u.username AS created_by_name
     FROM Expenses e LEFT JOIN Users u ON u.id = e.created_by
     WHERE e.expense_date >= ? AND e.expense_date <= ?
     ORDER BY e.expense_date ASC, e.expense_id ASC`,
    [range.from, range.to]
  );
  return rows.map(formatExpenseRow);
}

function formatExpenseRow(r) {
  return {
    expense_id: r.expense_id,
    expense_date: formatDateOnly(r.expense_date),
    category: r.category,
    category_label: EXPENSE_CATEGORIES[r.category] || r.category,
    description: r.description,
    amount: Number(r.amount),
    has_attachment: !!r.attachment_path,
    created_by_name: r.created_by_name || null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// Expense queries select DATE_FORMAT(expense_date, '%Y-%m-%d') so the value
// arrives as the exact stored string — a JS Date here would shift a day
// depending on the Node process's own timezone. This just guards against a
// caller that forgot to.
function formatDateOnly(value) {
  if (value instanceof Date) return formatBangkok(value).slice(0, 10);
  return String(value).slice(0, 10);
}

// "YYYY-MM-DD HH:mm" in Bangkok time, independent of the server's own TZ —
// used by the PDF receipt and the Excel export.
function formatBangkok(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}`;
}

function sumSatang(rows, key) {
  return rows.reduce((sum, r) => sum + toSatang(r[key]), 0);
}

async function buildFinancialReport(range) {
  const [income, refunds, expenses] = await Promise.all([
    getIncomeRows(range),
    getRefundRows(range),
    getExpenseRows(range),
  ]);

  const salesS = sumSatang(income, 'product_amount');
  const shippingS = sumSatang(income, 'shipping_fee');
  const discountS = sumSatang(income, 'discount');
  const receivedS = sumSatang(income, 'total');
  const refundsS = sumSatang(refunds, 'refund_amount');

  const expensesByCategory = {};
  for (const key of Object.keys(EXPENSE_CATEGORIES)) expensesByCategory[key] = 0;
  for (const e of expenses) {
    expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + toSatang(e.amount);
  }
  const expensesS = Object.values(expensesByCategory).reduce((a, b) => a + b, 0);

  const grossS = salesS + shippingS;
  const netS = grossS - discountS - refundsS - expensesS;

  const [[pending]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM Payments WHERE payment_status = ?) AS pendingPayments,
       (SELECT COUNT(*) FROM Refunds WHERE status = ?) AS pendingRefunds`,
    [PAYMENT_STATUS.PAID_PENDING_VERIFICATION, REFUND_STATUS.REFUND_REQUESTED]
  );

  return {
    range: { from: range.from, to: range.to },
    summary: {
      sales: fromSatang(salesS),
      shipping: fromSatang(shippingS),
      grossIncome: fromSatang(grossS),
      discount: fromSatang(discountS),
      // Actually received = sales + shipping - discount (what customers paid).
      received: fromSatang(receivedS),
      refunds: fromSatang(refundsS),
      expenses: fromSatang(expensesS),
      net: fromSatang(netS),
      paidOrders: income.length,
    },
    expensesByCategory: Object.entries(expensesByCategory).map(([category, satang]) => ({
      category,
      label: EXPENSE_CATEGORIES[category] || category,
      amount: fromSatang(satang),
    })),
    pending: {
      payments: Number(pending.pendingPayments) || 0,
      refunds: Number(pending.pendingRefunds) || 0,
    },
    income,
    refunds,
    expenses,
  };
}

module.exports = {
  PAYMENT_STATUS,
  REFUND_STATUS,
  REFUND_RESERVING_STATUSES,
  REFUND_COUNTED_STATUSES,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  isValidDateString,
  parseDateRange,
  getOrderFinancials,
  sumRefundsSatang,
  buildFinancialReport,
  formatExpenseRow,
  formatDateOnly,
  formatBangkok,
};
