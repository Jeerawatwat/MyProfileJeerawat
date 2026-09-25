// backend/routes/refunds.routes.js
// Refund requests. Rules enforced here, not in the UI:
//   - a buyer can only request a refund on their OWN order, and only once the
//     order's payment is PAID (confirmed by accounting)
//   - requested + approved + refunded amounts on one payment can never exceed
//     what was actually paid (checked in satang, under a row lock, both when
//     requesting AND again when approving)
//   - approve / reject / mark-refunded are accounting-only and each moves the
//     refund forward exactly once — a second click gets a 409, not a second
//     approval
// Flow: REFUND_REQUESTED -> REFUND_APPROVED -> REFUNDED   (or -> REFUND_REJECTED)
// Approved refunds count against income in the financial report from
// approved_at; once approved refunds cover the full payment, the order's
// payment_status becomes REFUNDED.
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
const { toSatang, fromSatang, parsePositiveAmount } = require('../utils/money');
const { logAudit, AUDIT_ACTIONS } = require('../services/audit');
const {
  PAYMENT_STATUS,
  REFUND_STATUS,
  REFUND_RESERVING_STATUSES,
  REFUND_COUNTED_STATUSES,
  sumRefundsSatang,
} = require('../services/finance');

const router = express.Router();
const evidenceUpload = createPrivateUpload('refunds');

router.use(requireAuth);

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function findPaidPayment(conn, orderId) {
  const [rows] = await conn.query(
    'SELECT payment_id, amount FROM Payments WHERE order_id = ? AND payment_status = ? FOR UPDATE',
    [orderId, PAYMENT_STATUS.PAID]
  );
  return rows[0] || null;
}

// POST /api/refunds — buyer requests a refund (multipart/form-data).
// Fields: order_id, refund_amount, reason, evidence? (image)
router.post('/', requireRole('user'), async (req, res, next) => {
  let evidencePath = null;
  try {
    const file = await runUpload(evidenceUpload, 'evidence', req, res);
    if (file) evidencePath = relativePathFor('refunds', file);

    const orderId = parseId(req.body.order_id);
    if (!orderId) throw httpError(400, 'รหัสคำสั่งซื้อไม่ถูกต้อง');
    const amount = parsePositiveAmount(req.body.refund_amount);
    if (amount === null) throw httpError(400, 'จำนวนเงินที่ขอคืนต้องเป็นตัวเลขมากกว่า 0 (ทศนิยมไม่เกิน 2 ตำแหน่ง)');
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) throw httpError(400, 'กรุณาระบุเหตุผลที่ขอคืนเงิน');
    if (reason.length > 1000) throw httpError(400, 'เหตุผลยาวเกินไป');

    const refundId = await withTransaction(async (conn) => {
      const [orders] = await conn.query('SELECT order_id, user_id, payment_status FROM Orders WHERE order_id = ? FOR UPDATE', [orderId]);
      const order = orders[0];
      if (!order || order.user_id !== req.user.id) throw httpError(404, 'ไม่พบคำสั่งซื้อ');
      if (order.payment_status !== PAYMENT_STATUS.PAID) {
        throw httpError(409, 'ขอคืนเงินได้เฉพาะคำสั่งซื้อที่ชำระเงินและได้รับการยืนยันแล้ว');
      }
      const payment = await findPaidPayment(conn, orderId);
      if (!payment) throw httpError(409, 'ไม่พบการชำระเงินที่ยืนยันแล้วของคำสั่งซื้อนี้');

      const reservedS = await sumRefundsSatang(conn, payment.payment_id, REFUND_RESERVING_STATUSES);
      const remainingS = toSatang(payment.amount) - reservedS;
      if (toSatang(amount) > remainingS) {
        throw httpError(409, `ขอคืนได้ไม่เกิน ${fromSatang(Math.max(remainingS, 0)).toFixed(2)} บาท`);
      }

      const [insert] = await conn.query(
        `INSERT INTO Refunds (order_id, payment_id, user_id, refund_amount, reason, evidence_path, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, payment.payment_id, req.user.id, amount, reason, evidencePath, REFUND_STATUS.REFUND_REQUESTED]
      );
      return insert.insertId;
    });

    res.status(201).json({ refund_id: refundId, order_id: orderId, refund_amount: amount, status: REFUND_STATUS.REFUND_REQUESTED });
  } catch (err) {
    removePrivateFile(evidencePath);
    next(err);
  }
});

const LIST_SELECT = `
  SELECT r.refund_id, r.order_id, r.payment_id, r.user_id, r.refund_amount, r.reason, r.status,
         r.rejected_reason, r.approved_at, r.refunded_at, r.created_at,
         (r.evidence_path IS NOT NULL) AS has_evidence,
         u.username, a.username AS approved_by_name, p.amount AS paid_amount
  FROM Refunds r
  JOIN Users u ON u.id = r.user_id
  JOIN Payments p ON p.payment_id = r.payment_id
  LEFT JOIN Users a ON a.id = r.approved_by`;

function formatRefund(row) {
  return {
    ...row,
    refund_amount: Number(row.refund_amount),
    paid_amount: Number(row.paid_amount),
    has_evidence: !!Number(row.has_evidence),
  };
}

// GET /api/refunds?status= — accounting sees all; a buyer sees only their own.
router.get('/', async (req, res, next) => {
  try {
    const conditions = [];
    const params = [];
    if (req.user.role === 'user') {
      conditions.push('r.user_id = ?');
      params.push(req.user.id);
    } else if (req.user.role !== 'accounting') {
      return res.status(403).json({ error: 'Forbidden — you do not have permission to do this' });
    }
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    if (status) {
      if (!Object.values(REFUND_STATUS).includes(status)) return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
      conditions.push('r.status = ?');
      params.push(status);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(`${LIST_SELECT}${where} ORDER BY r.created_at DESC, r.refund_id DESC LIMIT 500`, params);
    res.json(rows.map(formatRefund));
  } catch (err) {
    next(err);
  }
});

// GET /api/refunds/:id/evidence
router.get('/:id/evidence', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) throw httpError(400, 'รหัสคำขอคืนเงินไม่ถูกต้อง');
    const [rows] = await pool.query('SELECT user_id, evidence_path FROM Refunds WHERE refund_id = ?', [id]);
    const refund = rows[0];
    const canSee = refund && (req.user.role === 'accounting' || (req.user.role === 'user' && refund.user_id === req.user.id));
    if (!canSee) throw httpError(404, 'ไม่พบคำขอคืนเงิน');
    return sendPrivateFile(res, refund.evidence_path);
  } catch (err) {
    next(err);
  }
});

async function lockRefund(conn, id) {
  const [rows] = await conn.query('SELECT * FROM Refunds WHERE refund_id = ? FOR UPDATE', [id]);
  if (!rows[0]) throw httpError(404, 'ไม่พบคำขอคืนเงิน');
  return rows[0];
}

// POST /api/refunds/:id/approve — accounting only.
router.post('/:id/approve', requireRole('accounting'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) throw httpError(400, 'รหัสคำขอคืนเงินไม่ถูกต้อง');

    const result = await withTransaction(async (conn) => {
      // Lock order first, then refund — same order as the request path takes,
      // so the two can't deadlock against each other.
      const [[{ order_id: orderId } = {}]] = await conn.query('SELECT order_id FROM Refunds WHERE refund_id = ?', [id]);
      if (!orderId) throw httpError(404, 'ไม่พบคำขอคืนเงิน');
      await conn.query('SELECT order_id FROM Orders WHERE order_id = ? FOR UPDATE', [orderId]);

      const refund = await lockRefund(conn, id);
      if (refund.status !== REFUND_STATUS.REFUND_REQUESTED) throw httpError(409, 'คำขอนี้ได้รับการพิจารณาไปแล้ว');

      const [payments] = await conn.query('SELECT payment_id, amount, payment_status FROM Payments WHERE payment_id = ? FOR UPDATE', [
        refund.payment_id,
      ]);
      const payment = payments[0];
      if (!payment || payment.payment_status !== PAYMENT_STATUS.PAID) throw httpError(409, 'การชำระเงินของคำขอนี้ไม่อยู่ในสถานะชำระแล้ว');

      // Re-check the cap at approval time (defence in depth against any
      // row edited outside the app).
      const otherCountedS = await sumRefundsSatang(conn, payment.payment_id, REFUND_COUNTED_STATUSES, { excludeRefundId: id });
      const afterS = otherCountedS + toSatang(refund.refund_amount);
      if (afterS > toSatang(payment.amount)) throw httpError(409, 'ยอดคืนเงินรวมจะเกินยอดที่ลูกค้าชำระ');

      await conn.query(
        'UPDATE Refunds SET status = ?, approved_by = ?, approved_at = ?, rejected_reason = NULL WHERE refund_id = ?',
        [REFUND_STATUS.REFUND_APPROVED, req.user.id, new Date(), id]
      );
      const fullyRefunded = afterS === toSatang(payment.amount);
      if (fullyRefunded) {
        await conn.query('UPDATE Orders SET payment_status = ? WHERE order_id = ?', [PAYMENT_STATUS.REFUNDED, refund.order_id]);
      }
      await logAudit(conn, req.user, AUDIT_ACTIONS.APPROVE_REFUND, 'refund', id, {
        order_id: refund.order_id,
        refund_amount: Number(refund.refund_amount),
        fully_refunded: fullyRefunded,
      });
      return { order_id: refund.order_id, fully_refunded: fullyRefunded };
    });

    res.json({ success: true, refund_id: id, status: REFUND_STATUS.REFUND_APPROVED, ...result });
  } catch (err) {
    next(err);
  }
});

// POST /api/refunds/:id/reject — accounting only. Body: { reason }
router.post('/:id/reject', requireRole('accounting'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) throw httpError(400, 'รหัสคำขอคืนเงินไม่ถูกต้อง');
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) throw httpError(400, 'กรุณาระบุเหตุผลที่ปฏิเสธการคืนเงิน');
    if (reason.length > 1000) throw httpError(400, 'เหตุผลยาวเกินไป');

    await withTransaction(async (conn) => {
      const refund = await lockRefund(conn, id);
      if (refund.status !== REFUND_STATUS.REFUND_REQUESTED) throw httpError(409, 'คำขอนี้ได้รับการพิจารณาไปแล้ว');
      await conn.query('UPDATE Refunds SET status = ?, rejected_reason = ? WHERE refund_id = ?', [
        REFUND_STATUS.REFUND_REJECTED,
        reason,
        id,
      ]);
      await logAudit(conn, req.user, AUDIT_ACTIONS.REJECT_REFUND, 'refund', id, {
        order_id: refund.order_id,
        refund_amount: Number(refund.refund_amount),
        reason,
      });
    });

    res.json({ success: true, refund_id: id, status: REFUND_STATUS.REFUND_REJECTED, rejected_reason: reason });
  } catch (err) {
    next(err);
  }
});

// POST /api/refunds/:id/mark-refunded — accounting records that the money
// has actually been transferred back to the customer.
router.post('/:id/mark-refunded', requireRole('accounting'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) throw httpError(400, 'รหัสคำขอคืนเงินไม่ถูกต้อง');

    await withTransaction(async (conn) => {
      const refund = await lockRefund(conn, id);
      if (refund.status !== REFUND_STATUS.REFUND_APPROVED) throw httpError(409, 'บันทึกการโอนคืนได้เฉพาะคำขอที่อนุมัติแล้ว');
      await conn.query('UPDATE Refunds SET status = ?, refunded_by = ?, refunded_at = ? WHERE refund_id = ?', [
        REFUND_STATUS.REFUNDED,
        req.user.id,
        new Date(),
        id,
      ]);
      await logAudit(conn, req.user, AUDIT_ACTIONS.MARK_REFUNDED, 'refund', id, {
        order_id: refund.order_id,
        refund_amount: Number(refund.refund_amount),
      });
    });

    res.json({ success: true, refund_id: id, status: REFUND_STATUS.REFUNDED });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
