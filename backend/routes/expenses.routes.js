// backend/routes/expenses.routes.js
// Expense entries — accounting only. Every create/edit/delete writes an
// Audit_Logs row in the same transaction; edits and deletes record the
// before-values so a changed or removed expense can always be traced.
// Optional attachment (receipt photo / PDF) is stored privately — see
// backend/utils/privateUpload.js.
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
const { parsePositiveAmount } = require('../utils/money');
const { logAudit, AUDIT_ACTIONS } = require('../services/audit');
const { EXPENSE_CATEGORIES, isValidDateString, parseDateRange, formatExpenseRow } = require('../services/finance');

const router = express.Router();
const attachmentUpload = createPrivateUpload('expenses', { allowPdf: true });

router.use(requireAuth, requireRole('accounting'));

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validateExpense(body) {
  const expenseDate = typeof body.expense_date === 'string' ? body.expense_date.trim() : '';
  if (!isValidDateString(expenseDate)) throw httpError(400, 'วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD');
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  if (!EXPENSE_CATEGORIES[category]) throw httpError(400, 'ประเภทรายจ่ายไม่ถูกต้อง');
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!description) throw httpError(400, 'กรุณาระบุรายละเอียด');
  if (description.length > 500) throw httpError(400, 'รายละเอียดต้องไม่เกิน 500 ตัวอักษร');
  const amount = parsePositiveAmount(body.amount);
  if (amount === null) throw httpError(400, 'จำนวนเงินต้องเป็นตัวเลขมากกว่า 0 (ทศนิยมไม่เกิน 2 ตำแหน่ง)');
  return { expense_date: expenseDate, category, description, amount };
}

const SELECT_ONE = `
  SELECT e.expense_id, DATE_FORMAT(e.expense_date, '%Y-%m-%d') AS expense_date, e.category, e.description,
         e.amount, e.attachment_path, e.created_at, e.updated_at, u.username AS created_by_name
  FROM Expenses e LEFT JOIN Users u ON u.id = e.created_by
  WHERE e.expense_id = ?`;

// GET /api/expenses?from=YYYY-MM-DD&to=YYYY-MM-DD — both optional; without
// them returns the latest 500.
router.get('/', async (req, res, next) => {
  try {
    let where = '';
    const params = [];
    if (req.query.from || req.query.to) {
      const range = parseDateRange(req.query);
      if (range.error) return res.status(400).json({ error: range.error });
      where = ' WHERE e.expense_date >= ? AND e.expense_date <= ?';
      params.push(range.from, range.to);
    }
    const [rows] = await pool.query(
      `SELECT e.expense_id, DATE_FORMAT(e.expense_date, '%Y-%m-%d') AS expense_date, e.category, e.description,
              e.amount, e.attachment_path, e.created_at, e.updated_at, u.username AS created_by_name
       FROM Expenses e LEFT JOIN Users u ON u.id = e.created_by${where}
       ORDER BY e.expense_date DESC, e.expense_id DESC LIMIT 500`,
      params
    );
    res.json(rows.map(formatExpenseRow));
  } catch (err) {
    next(err);
  }
});

// POST /api/expenses (multipart/form-data)
// Fields: expense_date, category, description, amount, attachment? (image/PDF)
router.post('/', async (req, res, next) => {
  let attachmentPath = null;
  try {
    const file = await runUpload(attachmentUpload, 'attachment', req, res);
    if (file) attachmentPath = relativePathFor('expenses', file);
    const data = validateExpense(req.body);

    const id = await withTransaction(async (conn) => {
      const [insert] = await conn.query(
        `INSERT INTO Expenses (expense_date, category, description, amount, attachment_path, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [data.expense_date, data.category, data.description, data.amount, attachmentPath, req.user.id]
      );
      await logAudit(conn, req.user, AUDIT_ACTIONS.CREATE_EXPENSE, 'expense', insert.insertId, data);
      return insert.insertId;
    });

    const [rows] = await pool.query(SELECT_ONE, [id]);
    res.status(201).json(formatExpenseRow(rows[0]));
  } catch (err) {
    removePrivateFile(attachmentPath);
    next(err);
  }
});

// PUT /api/expenses/:id (multipart/form-data) — same fields as create.
// A new attachment replaces the old one; remove_attachment=1 drops it.
router.put('/:id', async (req, res, next) => {
  let newAttachmentPath = null;
  try {
    const id = parseId(req.params.id);
    if (!id) throw httpError(400, 'รหัสรายจ่ายไม่ถูกต้อง');
    const file = await runUpload(attachmentUpload, 'attachment', req, res);
    if (file) newAttachmentPath = relativePathFor('expenses', file);
    const data = validateExpense(req.body);
    const removeAttachment = req.body.remove_attachment === '1' || req.body.remove_attachment === 'true';

    const oldAttachment = await withTransaction(async (conn) => {
      const [rows] = await conn.query("SELECT *, DATE_FORMAT(expense_date, '%Y-%m-%d') AS expense_date_str FROM Expenses WHERE expense_id = ? FOR UPDATE", [id]);
      const before = rows[0];
      if (!before) throw httpError(404, 'ไม่พบรายการรายจ่าย');

      const attachmentPath = newAttachmentPath || (removeAttachment ? null : before.attachment_path);
      await conn.query(
        `UPDATE Expenses SET expense_date = ?, category = ?, description = ?, amount = ?, attachment_path = ?, updated_by = ?
         WHERE expense_id = ?`,
        [data.expense_date, data.category, data.description, data.amount, attachmentPath, req.user.id, id]
      );
      await logAudit(conn, req.user, AUDIT_ACTIONS.EDIT_EXPENSE, 'expense', id, {
        before: {
          expense_date: before.expense_date_str,
          category: before.category,
          description: before.description,
          amount: Number(before.amount),
        },
        after: data,
      });
      return attachmentPath !== before.attachment_path ? before.attachment_path : null;
    });
    removePrivateFile(oldAttachment);

    const [rows] = await pool.query(SELECT_ONE, [id]);
    res.json(formatExpenseRow(rows[0]));
  } catch (err) {
    removePrivateFile(newAttachmentPath);
    next(err);
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) throw httpError(400, 'รหัสรายจ่ายไม่ถูกต้อง');

    const attachment = await withTransaction(async (conn) => {
      const [rows] = await conn.query("SELECT *, DATE_FORMAT(expense_date, '%Y-%m-%d') AS expense_date_str FROM Expenses WHERE expense_id = ? FOR UPDATE", [id]);
      const before = rows[0];
      if (!before) throw httpError(404, 'ไม่พบรายการรายจ่าย');
      await conn.query('DELETE FROM Expenses WHERE expense_id = ?', [id]);
      await logAudit(conn, req.user, AUDIT_ACTIONS.DELETE_EXPENSE, 'expense', id, {
        expense_date: before.expense_date_str,
        category: before.category,
        description: before.description,
        amount: Number(before.amount),
      });
      return before.attachment_path;
    });
    removePrivateFile(attachment);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/expenses/:id/attachment
router.get('/:id/attachment', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) throw httpError(400, 'รหัสรายจ่ายไม่ถูกต้อง');
    const [rows] = await pool.query('SELECT attachment_path FROM Expenses WHERE expense_id = ?', [id]);
    if (!rows[0]) throw httpError(404, 'ไม่พบรายการรายจ่าย');
    return sendPrivateFile(res, rows[0].attachment_path);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
