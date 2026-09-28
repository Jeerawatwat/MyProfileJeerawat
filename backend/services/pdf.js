// backend/services/pdf.js
// Builds the receipt PDF for a CONFIRMED payment. Every figure comes from the
// database rows the caller passes in (Payments + Orders + Order_Details) —
// nothing is recomputed from client input. Rendered with the bundled Sarabun
// font (backend/assets/fonts, SIL Open Font License) because PDFKit's built-in
// fonts have no Thai glyphs.
const fs = require('fs');
const path = require('path');

const { formatBangkok, PAYMENT_METHODS } = require('./finance');
const { CLAIM_COMPONENTS, CLAIM_ISSUE_TYPES, CLAIM_RESOLUTION_TYPES, CLAIM_STATUS, CLAIM_STATUS_LABELS } = require('./claims');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'Sarabun-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'Sarabun-Bold.ttf');

// Shop details printed on the receipt. The shop name defaults to the brand
// name the app already shows in its header; the address is only printed if
// it has been configured — never invented.
function shopInfo() {
  return {
    name: process.env.SHOP_NAME || 'hello test.t',
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

// Colors mirror the app's own palette exactly (src/constants/theme.ts's
// `light` set) so the PDF reads as the same product, not a generic document.
// Keep this in sync by hand whenever that palette changes.
const BRAND = {
  page: '#F5FAFF', // Colors.light.background
  card: '#FFFFFF', // Colors.light.cardBackground
  accent: '#2196F3', // Colors.light.primary
  accentText: '#FFFFFF', // Colors.light.primaryText
  text: '#12181F', // Colors.light.text
  textSecondary: '#5C6B78', // Colors.light.textSecondary
  border: '#DCEBF9', // Colors.light.border
};

// Same tone→color mapping as src/components/payment-status-badge.tsx's
// CLAIM_TONE, just as flat (non-alpha) pastels — pdfkit's color parser
// doesn't reliably handle 8-digit RRGGBBAA hex.
const STATUS_TONE = {
  [CLAIM_STATUS.PENDING_REVIEW]: { bg: '#FBF0D9', fg: '#96700A' },
  [CLAIM_STATUS.INSPECTING]: { bg: '#DEE9FC', fg: '#2563EB' },
  [CLAIM_STATUS.APPROVED]: { bg: '#EBE1FA', fg: '#7C3AED' },
  [CLAIM_STATUS.REJECTED]: { bg: '#FADCDD', fg: '#D33A3F' },
  [CLAIM_STATUS.REPAIRING]: { bg: '#DEE9FC', fg: '#2563EB' },
  [CLAIM_STATUS.SHIPPING_REPLACEMENT]: { bg: '#DEE9FC', fg: '#2563EB' },
  [CLAIM_STATUS.COMPLETED]: { bg: '#DDF0E3', fg: '#1F7A46' },
};

// Left accent bar + bold label, with a thin rule underneath — the same
// "section" language repeated for every block on the page. Returns the y to
// start that section's content at.
function claimSectionHeader(doc, x, y, width, label) {
  doc.rect(x, y + 2, 4, 13).fill(BRAND.accent);
  doc.fillColor(BRAND.text).font('bold').fontSize(11).text(label, x + 11, y);
  const ruleY = y + 20;
  doc.moveTo(x, ruleY).lineTo(x + width, ruleY).strokeColor(BRAND.border).lineWidth(1).stroke();
  return ruleY + 12;
}

function claimField(doc, x, y, labelWidth, width, label, value) {
  doc.font('bold').fontSize(10).fillColor(BRAND.text).text(label, x, y, { width: labelWidth });
  doc.font('regular').fillColor(BRAND.text).text(String(value ?? '-'), x + labelWidth, y, { width: width - labelWidth });
  return Math.max(doc.y, y + 16) + 6;
}

// A small filled, rounded label — used for the component/issue-type tags and
// the status badge, echoing the pill badges the app itself uses everywhere
// (PaymentStatusBadge, ClaimStatusBadge, ...).
function claimPill(doc, x, y, text, { bg, fg }, fontSize = 10) {
  doc.font('bold').fontSize(fontSize);
  const w = doc.widthOfString(text) + 20;
  const h = fontSize + 12;
  doc.roundedRect(x, y, w, h, h / 2).fill(bg);
  doc.fillColor(fg).text(text, x + 10, y + h / 2 - fontSize / 2 - 1);
  doc.fillColor(BRAND.text);
  return w;
}

// A real, hand-drawn checkbox (an outlined square, filled solid when
// checked) — every option in `optionsMap` is printed, with only the one
// matching `selectedKey` shown ticked, exactly like the checkbox lists on a
// paper claim form. Drawn as vector shapes rather than a Unicode ☑/☐
// character because the bundled Sarabun font (Thai-focused) doesn't ship
// those glyphs — a missing glyph would silently print nothing.
function claimCheckboxRow(doc, x, y, width, optionsMap, selectedKey) {
  const boxSize = 10;
  const rowGap = 22;
  let cx = x;
  let cy = y;
  doc.font('regular').fontSize(10);
  for (const [key, label] of Object.entries(optionsMap)) {
    const checked = key === selectedKey;
    const textW = doc.widthOfString(label);
    const itemW = boxSize + 8 + textW + 22;
    if (cx !== x && cx + itemW > x + width) {
      cx = x;
      cy += rowGap;
    }
    doc.rect(cx, cy + 2, boxSize, boxSize).lineWidth(1).strokeColor(BRAND.textSecondary).stroke();
    if (checked) {
      doc.rect(cx + 2.5, cy + 4.5, boxSize - 5, boxSize - 5).fill(BRAND.accent);
    }
    doc
      .font(checked ? 'bold' : 'regular')
      .fillColor(checked ? BRAND.text : BRAND.textSecondary)
      .text(label, cx + boxSize + 8, cy, { width: textW + 4 });
    cx += itemW;
  }
  doc.fillColor(BRAND.text);
  return cy + rowGap + 4;
}

// claim: a Claims row (+ handled_by_name) from claims.routes.js's LIST_SELECT
// evidenceImagePath: absolute path to the first image evidence file, if any
// (video evidence can't be embedded in a PDF page — the PDF just notes how
// many attachments exist; they stay viewable in the app).
//
// Laid out to read like a real paper claim form (name/phone/order,
// checkbox lists for the component + fault, a return-shipping block, and a
// staff-use section) rather than just a label/value dump — content that
// spans more than one page reflows onto additional pages, each with the
// same page chrome redrawn (see ensureSpace()).
function streamClaimPdf(res, { claim, evidenceImagePath, attachmentCount }) {
  const PDFDocument = loadPdfKit();
  const shop = shopInfo();
  // bufferPages: true is required for switchToPage() below (adding the
  // footer/page-count to every page only after the total page count is
  // known) to actually work — without it, PDFKit streams+discards each
  // page's content as soon as a later page starts.
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, info: { Title: `Claim ${claim.claim_no}` } });
  doc.registerFont('regular', FONT_REGULAR);
  doc.registerFont('bold', FONT_BOLD);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="claim-${claim.claim_no}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  doc.pipe(res);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const cardX = 24;
  const cardW = pageW - cardX * 2;
  const contentPad = 28;
  const left = cardX + contentPad;
  const right = cardX + cardW - contentPad;
  const width = right - left;
  const headerH = 108;
  const CONTENT_BOTTOM = pageH - 24 - 48; // leaves room for the footer rule + line

  // Page chrome: cream page background + a white "card" holding the form —
  // the exact background/card pairing every screen in the app uses. The
  // full branded header (shop name/address, big title, claim_no) only goes
  // on page 1; a continuation page just gets a slim label so the card isn't
  // mostly banner on pages 2+.
  function drawCardBg() {
    doc.rect(0, 0, pageW, pageH).fill(BRAND.page);
    doc.rect(cardX, 24, cardW, pageH - 48).fillAndStroke(BRAND.card, BRAND.border);
  }

  function drawHeader() {
    doc.rect(cardX, 24, cardW, headerH).fill(BRAND.accent);
    doc.fillColor(BRAND.accentText).font('bold').fontSize(18).text(shop.name, left, 24 + 22);
    doc.font('regular').fontSize(9);
    if (shop.address) doc.text(shop.address, left);
    if (shop.phone) doc.text(`โทร ${shop.phone}`, left);

    doc.font('bold').fontSize(16).text('ใบแจ้งเคลมสินค้า', left, 24 + 20, { width, align: 'right' });
    doc.font('regular').fontSize(9).text('PRODUCT CLAIM FORM', left, doc.y, { width, align: 'right' });
    doc.font('bold').fontSize(12).text(claim.claim_no, left, doc.y + 4, { width, align: 'right' });
    doc.fillColor(BRAND.text);
    return 24 + headerH + 24;
  }

  drawCardBg();
  let y = drawHeader();
  let pageNo = 1;

  // Starts a new page (with the same card chrome) if the next block won't
  // fit — called before each section, not each line, so a section's own
  // fields/checkboxes never get visually split across a page break.
  function ensureSpace(minNeeded) {
    if (y + minNeeded <= CONTENT_BOTTOM) return;
    doc.addPage();
    pageNo += 1;
    drawCardBg();
    y = 24 + 22;
    doc.font('bold').fontSize(11).fillColor(BRAND.textSecondary).text(`ใบแจ้งเคลมสินค้า ${claim.claim_no} (ต่อ)`, left, y, { width });
    y = doc.y + 16;
  }

  const halfW = (width - 24) / 2;

  // Section 1 — customer + order
  ensureSpace(90);
  y = claimSectionHeader(doc, left, y, width, 'ข้อมูลลูกค้าและคำสั่งซื้อ');
  const s1Top = y;
  let yL = claimField(doc, left, y, 90, halfW, 'ชื่อลูกค้า', claim.customer_name);
  yL = claimField(doc, left, yL, 90, halfW, 'เบอร์โทรศัพท์', claim.customer_phone);
  let yR = claimField(doc, left + halfW + 24, y, 110, halfW, 'เลขที่คำสั่งซื้อ', `#${claim.order_id}`);
  yR = claimField(doc, left + halfW + 24, yR, 110, halfW, 'วันที่แจ้งเคลม', formatBangkok(claim.created_at));
  y = Math.max(yL, yR, s1Top);

  // Section 2 — product
  ensureSpace(90);
  y = claimSectionHeader(doc, left, y + 8, width, 'ข้อมูลสินค้า');
  const s2Top = y;
  let pL = claimField(doc, left, y, 90, halfW, 'ชื่อสินค้า', claim.product_name_snapshot);
  pL = claimField(doc, left, pL, 90, halfW, 'รุ่นสินค้า', claim.product_model || '-');
  let pR = claimField(doc, left + halfW + 24, y, 110, halfW, 'Serial Number', claim.serial_no_snapshot);
  pR = claimField(doc, left + halfW + 24, pR, 110, halfW, 'วันที่ซื้อ', formatBangkok(claim.purchased_at).slice(0, 10));
  y = Math.max(pL, pR, s2Top);

  // Section 3 — component being claimed (checkbox list — every option
  // printed, the one on this claim ticked, same as a paper form).
  ensureSpace(90);
  y = claimSectionHeader(doc, left, y + 8, width, 'อุปกรณ์ที่นำมาเคลม');
  y = claimCheckboxRow(doc, left, y, width, CLAIM_COMPONENTS, claim.claim_component);

  // Section 4 — the fault (same checkbox-list treatment; 8 options, so
  // reserve enough room for it to wrap onto 2-3 rows without crowding the
  // page bottom).
  ensureSpace(150);
  y = claimSectionHeader(doc, left, y + 8, width, 'อาการที่พบ');
  y = claimCheckboxRow(doc, left, y, width, CLAIM_ISSUE_TYPES, claim.issue_type);

  // Section 5 — free-text detail + evidence.
  ensureSpace(90);
  y = claimSectionHeader(doc, left, y + 8, width, 'รายละเอียดปัญหาเพิ่มเติม');
  doc.font('regular').fontSize(10).fillColor(BRAND.text).text(claim.issue_detail, left, y, { width });
  y = doc.y + 8;
  const hasAttachments = attachmentCount > 0;
  doc
    .font('regular')
    .fontSize(9)
    .fillColor(BRAND.textSecondary)
    .text(
      hasAttachments ? `แนบรูปภาพ/วิดีโอหลักฐาน — มี (${attachmentCount} ไฟล์)` : 'แนบรูปภาพ/วิดีโอหลักฐาน — ไม่มี',
      left,
      y,
      { width }
    );
  doc.fillColor(BRAND.text);
  y = doc.y + 8;

  if (evidenceImagePath && fs.existsSync(evidenceImagePath)) {
    ensureSpace(190);
    doc.font('bold').fontSize(10).text('รูปภาพหลักฐาน', left, y, { width });
    y = doc.y + 6;
    try {
      const imgW = width * 0.45;
      doc.roundedRect(left, y, imgW, 170, 6).fillAndStroke(BRAND.page, BRAND.border);
      doc.image(evidenceImagePath, left + 4, y + 4, { fit: [imgW - 8, 162] });
      y += 178;
    } catch {
      // Corrupt/unreadable image — skip it rather than fail the whole PDF.
    }
  }

  // Section 6 — how to send the item back (a static, printable checklist —
  // the shop doesn't collect a shipping method/return address per claim, so
  // this is generic instructional text, same on every claim's PDF).
  ensureSpace(120);
  y = claimSectionHeader(doc, left, y + 8, width, 'วิธีการส่งสินค้าคืน (สำหรับลูกค้า)');
  y = claimCheckboxRow(
    doc,
    left,
    y,
    width,
    { SELF: 'นำส่งด้วยตนเองที่หน้าร้าน', COURIER: 'จัดส่งผ่านไปรษณีย์ / บริษัทขนส่งเอกชน' },
    null
  );
  doc
    .font('regular')
    .fontSize(9)
    .fillColor(BRAND.textSecondary)
    .text(
      `ที่อยู่สำหรับจัดส่งสินค้าคืน: ${shop.address || 'กรุณาติดต่อร้านเพื่อขอที่อยู่จัดส่งก่อนส่งสินค้า'}` +
        (shop.phone ? ` · โทร ${shop.phone}` : ''),
      left,
      y,
      { width }
    );
  doc.fillColor(BRAND.text);
  y = doc.y + 10;

  // Section 7 — staff-only section: resolution checkboxes + any note left
  // when the claim was approved/rejected, and who last worked on it.
  ensureSpace(110);
  y = claimSectionHeader(doc, left, y + 8, width, 'สำหรับเจ้าหน้าที่ (ผลการเคลม)');
  y = claimCheckboxRow(doc, left, y, width, CLAIM_RESOLUTION_TYPES, claim.resolution_type);
  if (claim.status === CLAIM_STATUS.REJECTED && claim.rejected_reason) {
    doc.font('bold').fontSize(10).fillColor(BRAND.text).text('เหตุผลที่ไม่อนุมัติ', left, y, { width: 130 });
    doc.font('regular').text(claim.rejected_reason, left + 130, y, { width: width - 130 });
    y = doc.y + 8;
  }
  if (claim.staff_note) {
    doc.font('bold').fontSize(10).fillColor(BRAND.text).text('หมายเหตุเจ้าหน้าที่', left, y, { width: 130 });
    doc.font('regular').text(claim.staff_note, left + 130, y, { width: width - 130 });
    y = doc.y + 8;
  }
  doc
    .font('regular')
    .fontSize(9)
    .fillColor(BRAND.textSecondary)
    .text(
      claim.handled_by_name ? `ดำเนินการล่าสุดโดย ${claim.handled_by_name} · ${formatBangkok(claim.updated_at)}` : 'ยังไม่มีเจ้าหน้าที่ดำเนินการ',
      left,
      y,
      { width }
    );
  doc.fillColor(BRAND.text);
  y = doc.y + 10;

  // Section 8 — current status.
  ensureSpace(60);
  y = claimSectionHeader(doc, left, y + 8, width, 'สถานะการเคลมปัจจุบัน');
  claimPill(doc, left, y, CLAIM_STATUS_LABELS[claim.status] || claim.status, STATUS_TONE[claim.status] || STATUS_TONE[CLAIM_STATUS.PENDING_REVIEW], 11);
  y += 30;

  // Footer on every page, including page count.
  for (let p = 0; p < pageNo; p += 1) {
    doc.switchToPage(p);
    const footerY = pageH - 24 - 34;
    doc.moveTo(left, footerY).lineTo(right, footerY).strokeColor(BRAND.border).lineWidth(1).stroke();
    doc
      .font('regular')
      .fontSize(8)
      .fillColor(BRAND.textSecondary)
      .text(
        `เอกสารนี้ออกโดยระบบอัตโนมัติ · พิมพ์เมื่อ ${formatBangkok(new Date())} · หน้า ${p + 1}/${pageNo}`,
        left,
        footerY + 10,
        { width, align: 'center' }
      );
  }

  doc.end();
}

module.exports = { streamReceiptPdf, streamClaimPdf };
