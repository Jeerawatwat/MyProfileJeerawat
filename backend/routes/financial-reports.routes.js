// backend/routes/financial-reports.routes.js
// Accounting-only financial report + Excel export + audit log viewer.
// The JSON report and the .xlsx export both come from the SAME
// buildFinancialReport() call (backend/services/finance.js), so the exported
// file always matches what the dashboard shows for that date range.
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAudit, AUDIT_ACTIONS } = require('../services/audit');
const { parseDateRange, buildFinancialReport, formatBangkok, PAYMENT_METHODS } = require('../services/finance');

const router = express.Router();

router.use(requireAuth, requireRole('accounting'));

// GET /api/financial-reports?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', async (req, res, next) => {
  try {
    const range = parseDateRange(req.query);
    if (range.error) return res.status(400).json({ error: range.error });
    res.json(await buildFinancialReport(range));
  } catch (err) {
    next(err);
  }
});

const MONEY_FORMAT = '#,##0.00';

function styleHeader(row) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1EDE3' } };
    cell.border = { bottom: { style: 'thin' } };
  });
}

function addTable(sheet, columns, rows, totals) {
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 16 }));
  styleHeader(sheet.getRow(1));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of rows) sheet.addRow(r);
  if (totals && rows.length) {
    const totalRow = sheet.addRow(totals);
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
      cell.border = { top: { style: 'thin' } };
    });
  }
  for (const c of columns) {
    if (c.money) sheet.getColumn(c.key).numFmt = MONEY_FORMAT;
  }
}

// exceljs is loaded on first use (same reason as pdfkit in services/pdf.js):
// if the server hasn't installed it yet, only the export fails with a 503.
function loadExcelJS() {
  try {
    return require('exceljs');
  } catch {
    const err = new Error('ระบบ Export Excel ยังไม่พร้อม (server ยังไม่ได้ติดตั้ง exceljs)');
    err.status = 503;
    err.publicMessage = err.message;
    throw err;
  }
}

async function buildWorkbook(report, generatedBy) {
  const ExcelJS = loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = generatedBy;
  wb.created = new Date();
  const s = report.summary;

  // Sheet 1: Summary
  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'รายการ', key: 'label', width: 34 },
    { header: 'จำนวนเงิน (บาท)', key: 'value', width: 20 },
  ];
  styleHeader(summary.getRow(1));
  const summaryRows = [
    ['ช่วงวันที่', `${report.range.from} ถึง ${report.range.to}`],
    ['จำนวนออเดอร์ที่ชำระแล้ว', s.paidOrders],
    ['ยอดขายสินค้า', s.sales],
    ['ค่าส่ง', s.shipping],
    ['รายรับรวม (ยอดขาย + ค่าส่ง)', s.grossIncome],
    ['ส่วนลด', s.discount],
    ['ยอดคืนเงิน', s.refunds],
    ['รายจ่ายรวม', s.expenses],
    ...report.expensesByCategory.map((c) => [`   รายจ่าย: ${c.label}`, c.amount]),
    ['รายรับสุทธิ', s.net],
    [],
    ['ออกรายงานโดย', generatedBy],
    ['ออกรายงานเมื่อ', formatBangkok(new Date())],
    ['หมายเหตุ', 'รายรับนับจากวันที่ฝ่ายบัญชียืนยันการชำระเงิน · ยอดคืนเงินนับจากวันที่อนุมัติ · รายรับสุทธิ = รายรับรวม - ส่วนลด - คืนเงิน - รายจ่าย'],
  ];
  for (const [label, value] of summaryRows) {
    const row = summary.addRow({ label, value });
    if (typeof value === 'number' && label !== 'จำนวนออเดอร์ที่ชำระแล้ว') row.getCell('value').numFmt = MONEY_FORMAT;
    if (label === 'รายรับสุทธิ') row.font = { bold: true };
  }

  // Sheet 2: Income
  addTable(
    wb.addWorksheet('Income'),
    [
      { header: 'Date', key: 'date', width: 18 },
      { header: 'Receipt No', key: 'receipt_no', width: 18 },
      { header: 'Order ID', key: 'order_id', width: 10 },
      { header: 'Customer', key: 'customer', width: 18 },
      { header: 'Product', key: 'products', width: 40 },
      { header: 'Product Amount', key: 'product_amount', money: true },
      { header: 'Shipping', key: 'shipping_fee', money: true },
      { header: 'Discount', key: 'discount', money: true },
      { header: 'Total', key: 'total', money: true },
      { header: 'Payment Method', key: 'payment_method', width: 22 },
      { header: 'Payment Status', key: 'payment_status', width: 18 },
    ],
    report.income.map((r) => ({
      ...r,
      date: formatBangkok(r.date),
      payment_method: PAYMENT_METHODS[r.payment_method] || r.payment_method,
    })),
    { date: 'รวม', product_amount: s.sales, shipping_fee: s.shipping, discount: s.discount, total: s.received }
  );

  // Sheet 3: Expenses
  addTable(
    wb.addWorksheet('Expenses'),
    [
      { header: 'Date', key: 'expense_date', width: 14 },
      { header: 'Expense Type', key: 'category_label', width: 20 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Amount', key: 'amount', money: true },
      { header: 'Created By', key: 'created_by_name', width: 16 },
    ],
    report.expenses,
    { expense_date: 'รวม', amount: s.expenses }
  );

  // Sheet 4: Refunds
  addTable(
    wb.addWorksheet('Refunds'),
    [
      { header: 'Date', key: 'date', width: 18 },
      { header: 'Refund ID', key: 'refund_id', width: 10 },
      { header: 'Order ID', key: 'order_id', width: 10 },
      { header: 'Customer', key: 'customer', width: 18 },
      { header: 'Refund Amount', key: 'refund_amount', money: true },
      { header: 'Reason', key: 'reason', width: 40 },
      { header: 'Status', key: 'status', width: 18 },
    ],
    report.refunds.map((r) => ({ ...r, date: formatBangkok(r.date) })),
    { date: 'รวม', refund_amount: s.refunds }
  );

  return wb;
}

// GET /api/financial-reports/export?from=YYYY-MM-DD&to=YYYY-MM-DD — .xlsx
router.get('/export', async (req, res, next) => {
  try {
    const range = parseDateRange(req.query);
    if (range.error) return res.status(400).json({ error: range.error });

    const report = await buildFinancialReport(range);
    const wb = await buildWorkbook(report, req.user.username);
    const buffer = await wb.xlsx.writeBuffer();

    await logAudit(null, req.user, AUDIT_ACTIONS.EXPORT_FINANCIAL_REPORT, 'report', null, {
      from: range.from,
      to: range.to,
      net: report.summary.net,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="financial-report_${range.from}_${range.to}.xlsx"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
});

// GET /api/financial-reports/audit-logs?limit=50
router.get('/audit-logs', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const [rows] = await pool.query(
      'SELECT log_id, user_id, username, action, entity_type, entity_id, details, created_at FROM Audit_Logs ORDER BY log_id DESC LIMIT ?',
      [limit]
    );
    res.json(
      rows.map((r) => {
        let details = null;
        try {
          details = r.details ? JSON.parse(r.details) : null;
        } catch {
          details = r.details;
        }
        return { ...r, details };
      })
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
// Exposed for offline testing of the workbook layout.
module.exports.buildWorkbook = buildWorkbook;
