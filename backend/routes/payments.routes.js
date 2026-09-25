// backend/routes/payments.routes.js
// QR payment + slip verification. The money rules live here, server-side:
//   - the amount to pay is always Orders.total_amount from the DB, never a
//     number the client sends
//   - a buyer can only submit a slip for their OWN order, only while it is
//     PENDING_PAYMENT or PAYMENT_REJECTED, and never for a cancelled order
//   - submitting a slip only ever moves the order to PAID_PENDING_VERIFICATION;
//     nothing a "user" JWT can call ever sets PAID
//   - confirm/reject are accounting-only, and lock the payment row
//     (SELECT ... FOR UPDATE) so a double-click or two accountants at once
//     can't confirm the same payment twice
const fs = require('fs');
const path = require('path');
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { withTransaction, httpError } = require('../utils/transaction');
const {
  createPrivateUpload,
  runUpload,
  relativePathFor,
  removePrivateFile,
  sendPrivateFile,
} = require('../utils/privateUpload');
const { logAudit, AUDIT_ACTIONS } = require('../services/audit');
const { PAYMENT_STATUS, getOrderFinancials, formatBangkok } = require('../services/finance');
const { streamReceiptPdf } = require('../services/pdf');

const router = express.Router();
const slipUpload = createPrivateUpload('slips');

const CANCELLED_ORDER_STATUS = 'ยกเลิก';
const PAYABLE_ORDER_STATES = [PAYMENT_STATUS.PENDING_PAYMENT, PAYMENT_STATUS.PAID_PENDING_VERIFICATION, PAYMENT_STATUS.PAYMENT_REJECTED];

router.use(requireAuth);

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// The shop's own payment QR image — a file on the server, configured with
// PAYMENT_QR_IMAGE_PATH (default backend/assets/payment-qr.png).
function qrImagePath() {
  const configured = process.env.PAYMENT_QR_IMAGE_PATH;
  return configured ? path.resolve(configured) : path.join(__dirname, '..', 'assets', 'payment-qr.png');
}

// GET /api/payments/qr-info — whether a QR is configured + optional account
// name to show under it, so the buyer can double-check who they're paying.
router.get('/qr-info', (req, res) => {
  res.json({
    configured: fs.existsSync(qrImagePath()),
    account_name: process.env.PAYMENT_ACCOUNT_NAME || null,
  });
});

// GET /api/payments/qr-image
router.get('/qr-image', (req, res) => {
  const file = qrImagePath();
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: 'ร้านค้ายังไม่ได้ตั้งค่า QR สำหรับชำระเงิน' });
  }
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.sendFile(file);
});

// POST /api/payments — buyer submits a slip (multipart/form-data).
// Fields: order_id, slip (image file), paid_at? ("YYYY-MM-DD HH:mm"), transaction_reference?
router.post('/', requireRole('user'), async (req, res, next) => {
  let slipPath = null;
  try {
    const file = await runUpload(slipUpload, 'slip', req, res);
    if (!file) throw httpError(400, 'กรุณาแนบรูปสลิปการโอนเงิน');
    slipPath = relativePathFor('slips', file);

    const orderId = parseId(req.body.order_id);
    if (!orderId) throw httpError(400, 'รหัสคำสั่งซื้อไม่ถูกต้อง');

    const paidAtRaw = typeof req.body.paid_at === 'string' ? req.body.paid_at.trim() : '';
    if (paidAtRaw && !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(paidAtRaw)) {
      throw httpError(400, 'วันเวลาที่โอนต้องอยู่ในรูปแบบ YYYY-MM-DD HH:mm');
    }
    const paidAt = paidAtRaw ? `${paidAtRaw.replace('T', ' ')}:00` : null;

    const reference = typeof req.body.transaction_reference === 'string' ? req.body.transaction_reference.trim() : '';
    if (reference.length > 100) throw httpError(400, 'เลขอ้างอิงยาวเกินไป');

    const result = await withTransaction(async (conn) => {
      // Lock the order row: two slip submissions for the same order serialize here.
      const order = await getOrderFinancials(conn, orderId, { forUpdate: true });
      // Someone else's order gets the same 404 as a missing one.
      if (!order || order.user_id !== req.user.id) throw httpError(404, 'ไม่พบคำสั่งซื้อ');
      if (order.status === CANCELLED_ORDER_STATUS) throw httpError(409, 'คำสั่งซื้อนี้ถูกยกเลิกแล้ว ไม่สามารถชำระเงินได้');
      if (order.payment_status === PAYMENT_STATUS.PAID_PENDING_VERIFICATION) {
        throw httpError(409, 'ส่งสลิปแล้ว กำลังรอฝ่ายบัญชีตรวจสอบ');
      }
      if (!PAYABLE_ORDER_STATES.includes(order.payment_status)) {
        throw httpError(409, 'คำสั่งซื้อนี้ชำระเงินเรียบร้อยแล้ว');
      }
      // Belt-and-braces: even if Orders.payment_status were somehow stale,
      // never allow a second live payment on the same order.
      const [[live]] = await conn.query(
        'SELECT COUNT(*) AS n FROM Payments WHERE order_id = ? AND payment_status IN (?, ?)',
        [orderId, PAYMENT_STATUS.PAID_PENDING_VERIFICATION, PAYMENT_STATUS.PAID]
      );
      if (Number(live.n) > 0) throw httpError(409, 'คำสั่งซื้อนี้มีการชำระเงินที่รอตรวจสอบหรือยืนยันแล้ว');

      const [insert] = await conn.query(
        `INSERT INTO Payments (order_id, user_id, amount, payment_method, payment_status, slip_path, transaction_reference, paid_at)
         VALUES (?, ?, ?, 'QR', ?, ?, ?, ?)`,
        [orderId, req.user.id, order.total_amount, PAYMENT_STATUS.PAID_PENDING_VERIFICATION, slipPath, reference || null, paidAt]
      );
      await conn.query('UPDATE Orders SET payment_status = ? WHERE order_id = ?', [
        PAYMENT_STATUS.PAID_PENDING_VERIFICATION,
        orderId,
      ]);
      return { payment_id: insert.insertId, amount: order.total_amount };
    });

    res.status(201).json({
      payment_id: result.payment_id,
      order_id: orderId,
      amount: result.amount,
      payment_status: PAYMENT_STATUS.PAID_PENDING_VERIFICATION,
    });
  } catch (err) {
    removePrivateFile(slipPath);
    next(err);
  }
});

const LIST_SELECT = `
  SELECT p.payment_id, p.order_id, p.user_id, p.amount, p.payment_method, p.payment_status,
         p.transaction_reference, p.paid_at, p.verified_at, p.rejected_reason, p.receipt_no,
         p.created_at, u.username, v.username AS verified_by_name,
         o.status AS order_status, o.payment_status AS order_payment_status
  FROM Payments p
  JOIN Users u ON u.id = p.user_id
  JOIN Orders o ON o.order_id = p.order_id
  LEFT JOIN Users v ON v.id = p.verified_by`;

function formatPayment(row) {
  return { ...row, amount: Number(row.amount) };
}

// GET /api/payments?status=PAID_PENDING_VERIFICATION — accounting's queue.
router.get('/', requireRole('accounting'), async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const params = [];
    let where = '';
    if (status) {
      if (![PAYMENT_STATUS.PAID_PENDING_VERIFICATION, PAYMENT_STATUS.PAID, PAYMENT_STATUS.PAYMENT_REJECTED].includes(status)) {
        return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
      }
      where = ' WHERE p.payment_status = ?';
      params.push(status);
    }
    const [rows] = await pool.query(`${LIST_SELECT}${where} ORDER BY p.created_at DESC, p.payment_id DESC LIMIT 500`, params);
    res.json(rows.map(formatPayment));
  } catch (err) {
    next(err);
  }
});

// Loads a payment and checks the caller may see it: accounting sees all,
// a buyer only their own. Anyone else gets a 404 (never confirm it exists).
async function loadVisiblePayment(req) {
  const id = parseId(req.params.id);
  if (!id) throw httpError(400, 'รหัสการชำระเงินไม่ถูกต้อง');
  const [rows] = await pool.query(`${LIST_SELECT} WHERE p.payment_id = ?`, [id]);
  const payment = rows[0];
  const canSee = payment && (req.user.role === 'accounting' || (req.user.role === 'user' && payment.user_id === req.user.id));
  if (!canSee) throw httpError(404, 'ไม่พบข้อมูลการชำระเงิน');
  return payment;
}

// GET /api/payments/:id — full detail for the verification screen.
router.get('/:id', async (req, res, next) => {
  try {
    const payment = await loadVisiblePayment(req);
    const order = await getOrderFinancials(pool, payment.order_id);
    res.json({ ...formatPayment(payment), order });
  } catch (err) {
    next(err);
  }
});

// GET /api/payments/:id/slip — the slip image (private file, auth required).
router.get('/:id/slip', async (req, res, next) => {
  try {
    const payment = await loadVisiblePayment(req);
    const [[row]] = await pool.query('SELECT slip_path FROM Payments WHERE payment_id = ?', [payment.payment_id]);
    return sendPrivateFile(res, row && row.slip_path);
  } catch (err) {
    next(err);
  }
});

// Receipt numbers are derived from the payment id, which is unique, so two
// confirmations can never mint the same number: RC202609-000123.
function makeReceiptNo(paymentId, date) {
  const yyyymm = formatBangkok(date).slice(0, 7).replace('-', '');
  return `RC${yyyymm}-${String(paymentId).padStart(6, '0')}`;
}

// POST /api/payments/:id/confirm — accounting only.
router.post('/:id/confirm', requireRole('accounting'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) throw httpError(400, 'รหัสการชำระเงินไม่ถูกต้อง');

    const result = await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM Payments WHERE payment_id = ? FOR UPDATE', [id]);
      const payment = rows[0];
      if (!payment) throw httpError(404, 'ไม่พบข้อมูลการชำระเงิน');
      if (payment.payment_status === PAYMENT_STATUS.PAID) throw httpError(409, 'รายการนี้ได้รับการยืนยันไปแล้ว');
      if (payment.payment_status !== PAYMENT_STATUS.PAID_PENDING_VERIFICATION) {
        throw httpError(409, 'ยืนยันได้เฉพาะรายการที่รอตรวจสอบเท่านั้น');
      }

      const order = await getOrderFinancials(conn, payment.order_id, { forUpdate: true });
      if (!order) throw httpError(404, 'ไม่พบคำสั่งซื้อของรายการนี้');
      if (order.status === CANCELLED_ORDER_STATUS) {
        throw httpError(409, 'คำสั่งซื้อนี้ถูกยกเลิกแล้ว กรุณาปฏิเสธการชำระเงินแทน');
      }

      const now = new Date();
      const receiptNo = makeReceiptNo(id, now);
      await conn.query(
        `UPDATE Payments SET payment_status = ?, verified_by = ?, verified_at = ?, rejected_reason = NULL, receipt_no = ?
         WHERE payment_id = ?`,
        [PAYMENT_STATUS.PAID, req.user.id, now, receiptNo, id]
      );
      await conn.query('UPDATE Orders SET payment_status = ? WHERE order_id = ?', [PAYMENT_STATUS.PAID, payment.order_id]);
      await logAudit(conn, req.user, AUDIT_ACTIONS.CONFIRM_PAYMENT, 'payment', id, {
        order_id: payment.order_id,
        amount: Number(payment.amount),
        receipt_no: receiptNo,
      });
      return { order_id: payment.order_id, receipt_no: receiptNo };
    });

    res.json({ success: true, payment_id: id, payment_status: PAYMENT_STATUS.PAID, ...result });
  } catch (err) {
    next(err);
  }
});

// POST /api/payments/:id/reject — accounting only. Body: { reason }
router.post('/:id/reject', requireRole('accounting'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) throw httpError(400, 'รหัสการชำระเงินไม่ถูกต้อง');
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) throw httpError(400, 'กรุณาระบุเหตุผลที่ปฏิเสธการชำระเงิน');
    if (reason.length > 1000) throw httpError(400, 'เหตุผลยาวเกินไป');

    const result = await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM Payments WHERE payment_id = ? FOR UPDATE', [id]);
      const payment = rows[0];
      if (!payment) throw httpError(404, 'ไม่พบข้อมูลการชำระเงิน');
      if (payment.payment_status !== PAYMENT_STATUS.PAID_PENDING_VERIFICATION) {
        throw httpError(409, 'ปฏิเสธได้เฉพาะรายการที่รอตรวจสอบเท่านั้น');
      }
      await conn.query(
        `UPDATE Payments SET payment_status = ?, verified_by = ?, verified_at = ?, rejected_reason = ? WHERE payment_id = ?`,
        [PAYMENT_STATUS.PAYMENT_REJECTED, req.user.id, new Date(), reason, id]
      );
      // Lock + update the order so the buyer sees "rejected" and can resend.
      await conn.query('SELECT order_id FROM Orders WHERE order_id = ? FOR UPDATE', [payment.order_id]);
      await conn.query('UPDATE Orders SET payment_status = ? WHERE order_id = ?', [
        PAYMENT_STATUS.PAYMENT_REJECTED,
        payment.order_id,
      ]);
      await logAudit(conn, req.user, AUDIT_ACTIONS.REJECT_PAYMENT, 'payment', id, {
        order_id: payment.order_id,
        amount: Number(payment.amount),
        reason,
      });
      return { order_id: payment.order_id };
    });

    res.json({ success: true, payment_id: id, payment_status: PAYMENT_STATUS.PAYMENT_REJECTED, rejected_reason: reason, ...result });
  } catch (err) {
    next(err);
  }
});

// GET /api/payments/:id/receipt — receipt PDF, only for a CONFIRMED payment.
router.get('/:id/receipt', async (req, res, next) => {
  try {
    const visible = await loadVisiblePayment(req);
    if (visible.payment_status !== PAYMENT_STATUS.PAID || !visible.receipt_no) {
      throw httpError(409, 'ออกใบเสร็จได้เมื่อการชำระเงินได้รับการยืนยันแล้วเท่านั้น');
    }
    const order = await getOrderFinancials(pool, visible.order_id);
    streamReceiptPdf(res, { payment: formatPayment(visible), order });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
