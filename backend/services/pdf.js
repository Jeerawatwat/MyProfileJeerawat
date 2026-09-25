// backend/services/pdf.js
// Builds the receipt PDF for a CONFIRMED payment. Every figure comes from the
// database rows the caller passes in (Payments + Orders + Order_Details) —
// nothing is recomputed from client input. Rendered with the bundled Sarabun
// font (backend/assets/fonts, SIL Open Font License) because PDFKit's built-in
// fonts have no Thai glyphs.
const path = require('path');

const { formatBangkok, PAYMENT_METHODS } = require('./finance');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'Sarabun-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'Sarabun-Bold.ttf');

// Shop details printed on the receipt. The shop name defaults to the brand
// name the app already shows in its header; the address is only printed if
// it has been configured — never invented.
function shopInfo() {
  return {
    name: process.env.SHOP_NAME || 'Mee Dood Cha',
    address: process.env.SHOP_ADDRESS || '',
    phone: process.env.SHOP_PHONE || '',
  };
}

function baht(value) {
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// payment: Payments row (receipt_no, amount, payment_method, verified_at, paid_at)
// order:   getOrderFinancials() result (items, product_amount, shipping_fee, discount, username)
// pdfkit is loaded on first use, not at startup, so a server where
// `npm install` hasn't picked it up yet still boots — only receipts fail,
// with a clear 503, instead of the whole API going down.
function loadPdfKit() {
  try {
    return require('pdfkit');
  } catch {
    const err = new Error('ระบบออกใบเสร็จยังไม่พร้อม (server ยังไม่ได้ติดตั้ง pdfkit)');
    err.status = 503;
    err.publicMessage = err.message;
    throw err;
  }
}

function streamReceiptPdf(res, { payment, order }) {
  const PDFDocument = loadPdfKit();
  const shop = shopInfo();
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Receipt ${payment.receipt_no}` } });
  doc.registerFont('regular', FONT_REGULAR);
  doc.registerFont('bold', FONT_BOLD);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="receipt-${payment.receipt_no}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  doc.pipe(res);

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  // Header
  doc.font('bold').fontSize(20).text(shop.name, left, 48);
  doc.font('regular').fontSize(10);
  if (shop.address) doc.text(shop.address);
  if (shop.phone) doc.text(`โทร ${shop.phone}`);

  doc.font('bold').fontSize(18).text('ใบเสร็จรับเงิน', left, 48, { width, align: 'right' });
  doc.font('regular').fontSize(10).text('RECEIPT', { width, align: 'right' });

  doc.moveDown(2);
  const metaTop = Math.max(doc.y, 120);
  const metaRows = [
    ['เลขที่ใบเสร็จ', payment.receipt_no],
    ['Order ID', `#${order.order_id}`],
    ['วันที่รับชำระ', formatBangkok(payment.verified_at)],
    ['ลูกค้า', order.username],
  ];
  let y = metaTop;
  for (const [label, value] of metaRows) {
    doc.font('bold').fontSize(11).text(label, left, y, { width: 110 });
    doc.font('regular').text(String(value ?? '-'), left + 110, y, { width: width - 110 });
    y += 18;
  }

  // Items table
  y += 14;
  const cols = [
    { label: 'รายการสินค้า', x: left, w: width * 0.46, align: 'left' },
    { label: 'จำนวน', x: left + width * 0.46, w: width * 0.14, align: 'right' },
    { label: 'ราคาต่อหน่วย', x: left + width * 0.6, w: width * 0.2, align: 'right' },
    { label: 'รวม', x: left + width * 0.8, w: width * 0.2, align: 'right' },
  ];
  doc.rect(left, y - 4, width, 22).fill('#F1EDE3');
  doc.fillColor('#1A1A17').font('bold').fontSize(11);
  for (const c of cols) doc.text(c.label, c.x + 4, y, { width: c.w - 8, align: c.align });
  y += 24;

  doc.font('regular').fontSize(11);
  for (const item of order.items) {
    const cells = [item.name, String(item.quantity), baht(item.price), baht(item.subtotal)];
    const rowHeight = Math.max(18, doc.heightOfString(item.name, { width: cols[0].w - 8 }) + 4);
    if (y + rowHeight > doc.page.height - 200) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    cells.forEach((text, i) => doc.text(text, cols[i].x + 4, y, { width: cols[i].w - 8, align: cols[i].align }));
    y += rowHeight;
    doc.moveTo(left, y - 2).lineTo(right, y - 2).strokeColor('#EDE7D8').lineWidth(0.5).stroke();
  }

  // Totals
  y += 10;
  const totals = [
    ['รวมสินค้า', baht(order.product_amount)],
    ['ค่าส่ง', baht(order.shipping_fee)],
    ['ส่วนลด', order.discount > 0 ? `-${baht(order.discount)}` : baht(0)],
  ];
  const labelX = left + width * 0.55;
  const labelW = width * 0.25;
  const valueX = left + width * 0.8;
  const valueW = width * 0.2 - 4;
  for (const [label, value] of totals) {
    doc.font('regular').fontSize(11).text(label, labelX, y, { width: labelW, align: 'right' });
    doc.text(value, valueX, y, { width: valueW, align: 'right' });
    y += 18;
  }
  doc.moveTo(labelX, y).lineTo(right, y).strokeColor('#1A1A17').lineWidth(1).stroke();
  y += 6;
  doc.font('bold').fontSize(13).text('ยอดรวมสุทธิ (บาท)', labelX - 40, y, { width: labelW + 40, align: 'right' });
  doc.text(baht(payment.amount), valueX, y, { width: valueW, align: 'right' });
  y += 34;

  // Payment info
  doc.font('bold').fontSize(11).text('วิธีชำระเงิน', left, y, { width: 110 });
  doc.font('regular').text(PAYMENT_METHODS[payment.payment_method] || payment.payment_method, left + 110, y);
  y += 18;
  doc.font('bold').text('สถานะการชำระเงิน', left, y, { width: 110 });
  doc.font('regular').fillColor('#1F7A46').text('ชำระเงินแล้ว (ตรวจสอบแล้ว)', left + 110, y);
  doc.fillColor('#1A1A17');

  doc
    .font('regular')
    .fontSize(9)
    .fillColor('#8A8470')
    .text(
      `เอกสารนี้ออกโดยระบบอัตโนมัติ · พิมพ์เมื่อ ${formatBangkok(new Date())}`,
      left,
      doc.page.height - doc.page.margins.bottom - 20,
      { width, align: 'center' }
    );

  doc.end();
}

module.exports = { streamReceiptPdf };
