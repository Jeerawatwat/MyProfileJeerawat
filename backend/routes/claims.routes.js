// backend/routes/claims.routes.js
// Product warranty claims (see sql/009_product_claims.sql). Modeled directly
// on refunds.routes.js: a buyer requests one against something they actually
// bought, an admin (not accounting/manager/stock/delivery — an admin
// inspects product condition, same as they already own product CRUD in
// products.routes.js) moves it forward through a fixed status flow or
// rejects it, every action is audit-logged.
//
// A claim can only be filed on a unit (Product_Units row) that:
//   - was actually SOLD as part of the caller's OWN order (never someone
//     else's — a "user" JWT can only ever see/claim their own purchases)
//   - is still within its warranty_expires_at
//   - has no other still-open claim already against it
//
// Resolving a claim as APPROVED needs a resolution_type (REPAIR, REPLACEMENT,
// or REFUND). REFUND creates a normal row in Refunds via
// finance.js#createRefundRequestTx — accounting still approves/rejects/marks
// it refunded exactly like any customer-submitted refund request; this route
// never moves money on its own.
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { withTransaction, httpError } = require('../utils/transaction');
const {
  createPrivateUpload,
  runUploadMultiple,
  relativePathFor,
  removePrivateFiles,
  sendPrivateFile,
  absolutePathFor,
} = require('../utils/privateUpload');
const { parsePositiveAmount } = require('../utils/money');
const { logAudit, AUDIT_ACTIONS } = require('../services/audit');
const { createRefundRequestTx } = require('../services/finance');
const { streamClaimPdf } = require('../services/pdf');
const {
  CLAIM_STATUS,
  CLAIM_COMPONENTS,
  CLAIM_ISSUE_TYPES,
  CLAIM_RESOLUTION_TYPES,
  isValidStatusTransition,
  makeClaimNo,
} = require('../services/claims');

const router = express.Router();
const evidenceUpload = createPrivateUpload('claims', { allowVideo: true, maxSizeMb: 20 });
const MAX_ATTACHMENTS = 5;

router.use(requireAuth);

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function todayDateOnly() {
  return new Date(new Date().toDateString());
}

// ===== ส่งคำขอเคลม (Create) =====
// POST /api/claims — multipart/form-data.
// Fields: order_id, serial_no, customer_name, customer_phone, claim_component,
// issue_type, issue_detail, evidence[] (up to 5 images/videos)
router.post('/', requireRole('user'), async (req, res, next) => {
  let evidencePaths = [];
  try {
    const files = await runUploadMultiple(evidenceUpload, 'evidence', MAX_ATTACHMENTS, req, res);
    evidencePaths = files.map((f) => relativePathFor('claims', f));

    const orderId = parseId(req.body.order_id);
    if (!orderId) throw httpError(400, 'รหัสคำสั่งซื้อไม่ถูกต้อง');
    const serialNo = typeof req.body.serial_no === 'string' ? req.body.serial_no.trim() : '';
    if (!serialNo) throw httpError(400, 'กรุณาระบุ Product ID / Serial Number');
    const customerName = typeof req.body.customer_name === 'string' ? req.body.customer_name.trim() : '';
    if (!customerName) throw httpError(400, 'กรุณาระบุชื่อลูกค้า');
    const customerPhone = typeof req.body.customer_phone === 'string' ? req.body.customer_phone.trim() : '';
    if (!customerPhone) throw httpError(400, 'กรุณาระบุเบอร์โทรศัพท์');
    const claimComponent = typeof req.body.claim_component === 'string' ? req.body.claim_component : '';
    if (!Object.keys(CLAIM_COMPONENTS).includes(claimComponent)) throw httpError(400, 'กรุณาเลือกอุปกรณ์ที่ต้องการเคลม');
    const issueType = typeof req.body.issue_type === 'string' ? req.body.issue_type : '';
    if (!Object.keys(CLAIM_ISSUE_TYPES).includes(issueType)) throw httpError(400, 'กรุณาเลือกอาการเสีย');
    const issueDetail = typeof req.body.issue_detail === 'string' ? req.body.issue_detail.trim() : '';
    if (!issueDetail) throw httpError(400, 'กรุณาระบุรายละเอียดปัญหา');
    if (issueDetail.length > 2000) throw httpError(400, 'รายละเอียดปัญหายาวเกินไป');

    const claimId = await withTransaction(async (conn) => {
      const [units] = await conn.query('SELECT * FROM Product_Units WHERE serial_no = ? FOR UPDATE', [serialNo]);
      const unit = units[0];
      if (!unit || unit.status !== 'SOLD') {
        throw httpError(404, 'ไม่พบข้อมูลสินค้านี้ กรุณาตรวจสอบ Product ID หรือ Serial Number');
      }
      if (unit.order_id !== orderId) {
        throw httpError(400, 'Product ID / Serial Number นี้ไม่ตรงกับเลขที่คำสั่งซื้อที่ระบุ');
      }

      const [orders] = await conn.query('SELECT order_id, user_id, order_date FROM Orders WHERE order_id = ?', [orderId]);
      const order = orders[0];
      if (!order || order.user_id !== req.user.id) throw httpError(404, 'ไม่พบคำสั่งซื้อ');

      if (!unit.warranty_expires_at || new Date(unit.warranty_expires_at) < todayDateOnly()) {
        throw httpError(409, 'สินค้านี้หมดระยะเวลารับประกันแล้ว');
      }

      const [openClaims] = await conn.query(
        `SELECT claim_id FROM Claims WHERE unit_id = ? AND status NOT IN (?, ?) FOR UPDATE`,
        [unit.unit_id, CLAIM_STATUS.REJECTED, CLAIM_STATUS.COMPLETED]
      );
      if (openClaims.length) throw httpError(409, 'สินค้าชิ้นนี้มีคำขอเคลมที่ยังไม่เสร็จสิ้นอยู่แล้ว');

      const [product] = await conn.query('SELECT name, model FROM Inventory WHERE id = ?', [unit.product_id]);
      const productInfo = product[0] || { name: `Product #${unit.product_id}`, model: null };

      const [insert] = await conn.query(
        `INSERT INTO Claims (
           order_id, order_detail_id, unit_id, product_id, customer_user_id, customer_name, customer_phone,
           product_name_snapshot, product_model, serial_no_snapshot, purchased_at,
           claim_component, issue_type, issue_detail, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          unit.order_detail_id,
          unit.unit_id,
          unit.product_id,
          req.user.id,
          customerName,
          customerPhone,
          productInfo.name,
          productInfo.model,
          serialNo,
          order.order_date,
          claimComponent,
          issueType,
          issueDetail,
          CLAIM_STATUS.PENDING_REVIEW,
        ]
      );
      const claimId = insert.insertId;
      const claimNo = makeClaimNo(claimId, new Date());
      await conn.query('UPDATE Claims SET claim_no = ? WHERE claim_id = ?', [claimNo, claimId]);

      await conn.query(
        'INSERT INTO Claim_Status_History (claim_id, status, note, changed_by) VALUES (?, ?, ?, ?)',
        [claimId, CLAIM_STATUS.PENDING_REVIEW, 'ลูกค้าส่งคำขอเคลม', req.user.id]
      );

      for (const filePath of evidencePaths) {
        await conn.query(
          "INSERT INTO Claim_Attachments (claim_id, kind, file_path, uploaded_by) VALUES (?, 'EVIDENCE', ?, ?)",
          [claimId, filePath, req.user.id]
        );
      }

      await logAudit(conn, req.user, AUDIT_ACTIONS.CREATE_CLAIM, 'claim', claimId, {
        order_id: orderId,
        serial_no: serialNo,
      });

      return claimId;
    });

    const [[row]] = await pool.query('SELECT claim_no, status FROM Claims WHERE claim_id = ?', [claimId]);
    res.status(201).json({ claim_id: claimId, claim_no: row.claim_no, status: row.status });
  } catch (err) {
    removePrivateFiles(evidencePaths);
    next(err);
  }
});

const LIST_SELECT = `
  SELECT c.claim_id, c.claim_no, c.order_id, c.order_detail_id, c.unit_id, c.product_id, c.customer_user_id,
         c.customer_name, c.customer_phone, c.product_name_snapshot, c.product_model, c.serial_no_snapshot,
         c.purchased_at, c.claim_component, c.issue_type, c.issue_detail, c.status, c.resolution_type,
         c.staff_note, c.rejected_reason, c.linked_refund_id, c.handled_by, c.created_at, c.updated_at,
         h.username AS handled_by_name
  FROM Claims c
  LEFT JOIN Users h ON h.id = c.handled_by`;

// GET /api/claims?q=&claim_no=&serial_no=&product_name=&customer_name=&status=
// A "user" always sees only their own claims, no matter what filters are
// passed; an admin sees everyone's and can use every filter. `q` is the
// single search box on the claim-tracking screen — it matches claim_no OR
// serial_no (a claim number obviously never equals a serial, so ANDing them
// like the other filters do would always return nothing); claim_no/serial_no
// stay separate, ANDable filters for the admin screen's per-field search.
router.get('/', async (req, res, next) => {
  try {
    const conditions = [];
    const params = [];
    if (req.user.role !== 'admin') {
      conditions.push('c.customer_user_id = ?');
      params.push(req.user.id);
    }
    const { q, claim_no, serial_no, product_name, customer_name, status } = req.query;
    if (typeof q === 'string' && q.trim()) {
      conditions.push('(c.claim_no LIKE ? OR c.serial_no_snapshot LIKE ?)');
      params.push(`%${q.trim()}%`, `%${q.trim()}%`);
    }
    if (typeof claim_no === 'string' && claim_no.trim()) {
      conditions.push('c.claim_no LIKE ?');
      params.push(`%${claim_no.trim()}%`);
    }
    if (typeof serial_no === 'string' && serial_no.trim()) {
      conditions.push('c.serial_no_snapshot LIKE ?');
      params.push(`%${serial_no.trim()}%`);
    }
    if (typeof product_name === 'string' && product_name.trim()) {
      conditions.push('c.product_name_snapshot LIKE ?');
      params.push(`%${product_name.trim()}%`);
    }
    if (typeof customer_name === 'string' && customer_name.trim() && req.user.role === 'admin') {
      conditions.push('c.customer_name LIKE ?');
      params.push(`%${customer_name.trim()}%`);
    }
    if (typeof status === 'string' && status.trim()) {
      if (!Object.values(CLAIM_STATUS).includes(status)) return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
      conditions.push('c.status = ?');
      params.push(status);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(`${LIST_SELECT}${where} ORDER BY c.created_at DESC, c.claim_id DESC LIMIT 500`, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

async function loadVisibleClaim(req) {
  const id = parseId(req.params.id);
  if (!id) throw httpError(400, 'รหัสใบเคลมไม่ถูกต้อง');
  const [rows] = await pool.query(`${LIST_SELECT} WHERE c.claim_id = ?`, [id]);
  const claim = rows[0];
  const canSee = claim && (req.user.role === 'admin' || claim.customer_user_id === req.user.id);
  if (!canSee) throw httpError(404, 'ไม่พบใบเคลม');
  return claim;
}

// GET /api/claims/:id — detail, with attachments + status timeline.
router.get('/:id', async (req, res, next) => {
  try {
    const claim = await loadVisibleClaim(req);
    const [attachments] = await pool.query(
      'SELECT attachment_id, kind, created_at FROM Claim_Attachments WHERE claim_id = ? ORDER BY attachment_id ASC',
      [claim.claim_id]
    );
    const [history] = await pool.query(
      `SELECT h.status, h.note, h.created_at, u.username AS changed_by_name
       FROM Claim_Status_History h LEFT JOIN Users u ON u.id = h.changed_by
       WHERE h.claim_id = ? ORDER BY h.created_at ASC, h.history_id ASC`,
      [claim.claim_id]
    );
    res.json({ ...claim, attachments, history });
  } catch (err) {
    next(err);
  }
});

// GET /api/claims/:id/attachments/:attachmentId — private file, auth required.
router.get('/:id/attachments/:attachmentId', async (req, res, next) => {
  try {
    const claim = await loadVisibleClaim(req);
    const attachmentId = parseId(req.params.attachmentId);
    if (!attachmentId) throw httpError(400, 'รหัสไฟล์แนบไม่ถูกต้อง');
    const [[row]] = await pool.query('SELECT file_path FROM Claim_Attachments WHERE attachment_id = ? AND claim_id = ?', [
      attachmentId,
      claim.claim_id,
    ]);
    return sendPrivateFile(res, row && row.file_path);
  } catch (err) {
    next(err);
  }
});

// POST /api/claims/:id/attachments — admin uploads inspection-result photos.
router.post('/:id/attachments', requireRole('admin'), async (req, res, next) => {
  let paths = [];
  try {
    const id = parseId(req.params.id);
    if (!id) throw httpError(400, 'รหัสใบเคลมไม่ถูกต้อง');
    const files = await runUploadMultiple(evidenceUpload, 'photos', MAX_ATTACHMENTS, req, res);
    paths = files.map((f) => relativePathFor('claims', f));
    if (!paths.length) throw httpError(400, 'กรุณาแนบไฟล์อย่างน้อย 1 ไฟล์');

    const [[claim]] = await pool.query('SELECT claim_id FROM Claims WHERE claim_id = ?', [id]);
    if (!claim) throw httpError(404, 'ไม่พบใบเคลม');

    for (const filePath of paths) {
      await pool.query(
        "INSERT INTO Claim_Attachments (claim_id, kind, file_path, uploaded_by) VALUES (?, 'INSPECTION_RESULT', ?, ?)",
        [id, filePath, req.user.id]
      );
    }
    res.status(201).json({ success: true, added: paths.length });
  } catch (err) {
    removePrivateFiles(paths);
    next(err);
  }
});

// PATCH /api/claims/:id/status — admin only.
// Body: { status, note?, rejected_reason?, resolution_type?, refund_amount? }
router.patch('/:id/status', requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) throw httpError(400, 'รหัสใบเคลมไม่ถูกต้อง');
    const status = typeof req.body.status === 'string' ? req.body.status : '';
    if (!Object.values(CLAIM_STATUS).includes(status)) throw httpError(400, 'สถานะไม่ถูกต้อง');
    const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
    const rejectedReason = typeof req.body.rejected_reason === 'string' ? req.body.rejected_reason.trim() : '';
    const resolutionType = typeof req.body.resolution_type === 'string' ? req.body.resolution_type : '';

    if (status === CLAIM_STATUS.REJECTED && !rejectedReason) {
      throw httpError(400, 'กรุณาระบุเหตุผลที่ไม่อนุมัติการเคลม');
    }
    if (status === CLAIM_STATUS.APPROVED && !Object.keys(CLAIM_RESOLUTION_TYPES).includes(resolutionType)) {
      throw httpError(400, 'กรุณาเลือกผลการเคลม (ซ่อม / เปลี่ยนสินค้าใหม่ / คืนเงิน)');
    }
    let refundAmount = null;
    if (status === CLAIM_STATUS.APPROVED && resolutionType === 'REFUND') {
      refundAmount = parsePositiveAmount(req.body.refund_amount);
      if (refundAmount === null) throw httpError(400, 'กรุณาระบุจำนวนเงินที่จะคืนให้ถูกต้อง');
    }

    const result = await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM Claims WHERE claim_id = ? FOR UPDATE', [id]);
      const claim = rows[0];
      if (!claim) throw httpError(404, 'ไม่พบใบเคลม');
      if (!isValidStatusTransition(claim.status, status)) {
        throw httpError(409, 'ไม่สามารถเปลี่ยนเป็นสถานะนี้ได้จากสถานะปัจจุบัน');
      }

      let linkedRefundId = claim.linked_refund_id;
      if (status === CLAIM_STATUS.APPROVED && resolutionType === 'REFUND') {
        const refund = await createRefundRequestTx(conn, {
          orderId: claim.order_id,
          userId: claim.customer_user_id,
          amount: refundAmount,
          reason: `เคลม ${claim.claim_no}: ${claim.issue_detail.slice(0, 300)}`,
        });
        linkedRefundId = refund.refund_id;
      }

      await conn.query(
        `UPDATE Claims
         SET status = ?, staff_note = ?, rejected_reason = ?, resolution_type = ?, linked_refund_id = ?, handled_by = ?
         WHERE claim_id = ?`,
        [
          status,
          note || claim.staff_note,
          status === CLAIM_STATUS.REJECTED ? rejectedReason : null,
          status === CLAIM_STATUS.APPROVED ? resolutionType : claim.resolution_type,
          linkedRefundId,
          req.user.id,
          id,
        ]
      );
      await conn.query('INSERT INTO Claim_Status_History (claim_id, status, note, changed_by) VALUES (?, ?, ?, ?)', [
        id,
        status,
        status === CLAIM_STATUS.REJECTED ? rejectedReason : note || null,
        req.user.id,
      ]);
      await logAudit(conn, req.user, AUDIT_ACTIONS.UPDATE_CLAIM_STATUS, 'claim', id, {
        order_id: claim.order_id,
        from: claim.status,
        to: status,
        resolution_type: status === CLAIM_STATUS.APPROVED ? resolutionType : undefined,
        linked_refund_id: linkedRefundId || undefined,
      });
      return { linked_refund_id: linkedRefundId };
    });

    res.json({ success: true, claim_id: id, status, ...result });
  } catch (err) {
    next(err);
  }
});

// GET /api/claims/:id/pdf — ใบเคลม PDF, available as soon as the claim
// exists (spec point 5) — both the buyer and admin can download it any time.
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const claim = await loadVisibleClaim(req);
    const [attachments] = await pool.query(
      "SELECT attachment_id, file_path FROM Claim_Attachments WHERE claim_id = ? AND kind = 'EVIDENCE' ORDER BY attachment_id ASC",
      [claim.claim_id]
    );
    const firstImage = attachments.find((a) => /\.(png|jpe?g|webp)$/i.test(a.file_path));
    const evidenceImagePath = firstImage ? absolutePathFor(firstImage.file_path) : null;
    streamClaimPdf(res, { claim, evidenceImagePath, attachmentCount: attachments.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
