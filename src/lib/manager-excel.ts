// src/lib/manager-excel.ts
// Executive Excel / CSV Export utility for the Manager department.
// Generates UTF-8 BOM compatible files that open natively in Microsoft Excel
// with full Thai language support and clean tabular layout.
import { Platform } from 'react-native';
import { type ManagerDashboard } from './api';

export function exportManagerReportToExcel(data: ManagerDashboard, filenamePrefix = 'manager_executive_report') {
  if (!data) return;

  const now = new Date();
  const dateStr = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const rangeLabel =
    data.range === 'today'
      ? 'วันนี้'
      : data.range === '7days'
        ? '7 วันล่าสุด'
        : data.range === '30days'
          ? '30 วันล่าสุด'
          : 'ข้อมูลทั้งหมด (All Time)';

  const lines: string[] = [];

  const esc = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

  // Section 1: Report Title
  lines.push(esc('รายงานภาพรวมผลการดำเนินงานและสถิติธุรกิจสำหรับผู้บริหาร (EXECUTIVE BI REPORT)'));
  lines.push(`${esc('วันที่ออกรายงาน:')},${esc(`${dateStr} เวลา ${timeStr}`)},${esc('ช่วงเวลา:')},${esc(rangeLabel)}`);
  lines.push('');

  // Section 2: Key Executive KPIs
  lines.push(esc('=== 1. สรุปตัวชี้วัดหลักทางธุรกิจ (KEY PERFORMANCE INDICATORS) ==='));
  lines.push([
    esc('ยอดขายรวม (บาท)'),
    esc('จำนวนออเดอร์ทั้งหมด'),
    esc('ออเดอร์ที่ชำระเงินแล้ว'),
    esc('ออเดอร์รอชำระเงิน'),
    esc('ยอดเฉลี่ยต่อออเดอร์ (AOV)'),
    esc('อัตราจัดส่งสำเร็จ (%)'),
    esc('ยอดรับชำระวันนี้ (บาท)'),
    esc('ออเดอร์ใหม่วันนี้'),
  ].join(','));
  lines.push([
    data.summary.totalRevenue,
    data.summary.totalOrders,
    data.summary.paidOrdersCount,
    data.summary.pendingPaymentCount,
    data.summary.avgOrderValue,
    `${data.summary.fulfillmentRate}%`,
    data.today.revenue,
    data.today.newOrders,
  ].join(','));
  lines.push('');

  // Section 3: Department Operations
  lines.push(esc('=== 2. สรุปการดำเนินงานแยกตามแผนก (DEPARTMENT OPERATIONS) ==='));
  lines.push([
    esc('แผนก'),
    esc('ตัวชี้วัด 1'),
    esc('ค่า 1'),
    esc('ตัวชี้วัด 2'),
    esc('ค่า 2'),
    esc('ตัวชี้วัด 3'),
    esc('ค่า 3'),
    esc('ตัวชี้วัด 4'),
    esc('ค่า 4'),
  ].join(','));
  lines.push([
    esc('แผนกจัดส่ง (Delivery)'),
    esc('รอจัดเตรียม/จัดส่ง'),
    data.departments.delivery.pending,
    esc('อยู่ระหว่างจัดส่ง'),
    data.departments.delivery.inTransit,
    esc('จัดส่งสำเร็จ'),
    data.departments.delivery.completed,
    esc('ยกเลิก'),
    data.departments.delivery.cancelled,
  ].join(','));
  lines.push([
    esc('แผนกคลังสินค้า (Stock)'),
    esc('รายการสินค้าทั้งหมด (SKU)'),
    data.departments.warehouse.totalProducts,
    esc('สต็อกรวมคงเหลือ (ชิ้น)'),
    data.departments.warehouse.totalItems,
    esc('มูลค่าสต็อกราคาขาย (บาท)'),
    data.departments.warehouse.totalRetailValue,
    esc('สินค้าใกล้หมด/หมดสต็อก'),
    `${data.departments.warehouse.lowStock} / ${data.departments.warehouse.outOfStock}`,
  ].join(','));
  lines.push([
    esc('แผนกการเงิน (Finance)'),
    esc('รายรับทั้งหมด (บาท)'),
    data.departments.finance.totalIncome,
    esc('ออเดอร์ที่ชำระแล้ว'),
    data.departments.finance.paidOrders,
    esc('ออเดอร์รอชำระ'),
    data.departments.finance.pendingPayments,
    esc('-'),
    esc('-'),
  ].join(','));
  lines.push('');

  // Section 4: Top Selling Products
  lines.push(esc('=== 3. อันดับสินค้าขายดี (TOP SELLING PRODUCTS) ==='));
  lines.push([
    esc('อันดับ'),
    esc('รหัสสินค้า'),
    esc('ชื่อสินค้า'),
    esc('หมวดหมู่'),
    esc('จำนวนที่ขายได้ (ชิ้น)'),
    esc('ยอดขายรวม (บาท)'),
    esc('สต็อกคงเหลือในคลัง'),
  ].join(','));
  if (data.topProducts.length === 0) {
    lines.push(esc('ไม่มีข้อมูลยอดขายในช่วยเวลานี้'));
  } else {
    data.topProducts.forEach((p, idx) => {
      lines.push([
        idx + 1,
        p.id,
        esc(p.name),
        esc(p.category || '-'),
        p.quantity,
        p.revenue,
        p.stockRemaining ?? '-',
      ].join(','));
    });
  }
  lines.push('');

  // Section 5: Sales by Category
  lines.push(esc('=== 4. ยอดขายแยกตามหมวดหมู่สินค้า (SALES BY CATEGORY) ==='));
  lines.push([
    esc('หมวดหมู่สินค้า'),
    esc('จำนวนที่ขายได้ (ชิ้น)'),
    esc('ยอดขายรวม (บาท)'),
    esc('สัดส่วนยอดขาย (%)'),
  ].join(','));
  if (data.categories.length === 0) {
    lines.push(esc('ไม่มีข้อมูลหมวดหมู่สินค้า'));
  } else {
    data.categories.forEach((c) => {
      lines.push([
        esc(c.category),
        c.itemsSold,
        c.revenue,
        `${c.percentage}%`,
      ].join(','));
    });
  }
  lines.push('');

  // Section 6: Order Status Breakdown
  lines.push(esc('=== 5. สรุปสถานะคำสั่งซื้อ (ORDER STATUS BREAKDOWN) ==='));
  lines.push([esc('สถานะคำสั่งซื้อ'), esc('จำนวนออเดอร์ (รายการ)')].join(','));
  data.statusSummary.forEach((s) => {
    lines.push([esc(s.status), s.count].join(','));
  });
  lines.push('');

  // Section 7: Recent Orders List
  lines.push(esc('=== 6. รายการคำสั่งซื้อล่าสุด (RECENT ORDERS) ==='));
  lines.push([
    esc('รหัสออเดอร์'),
    esc('วันเวลาที่สั่งซื้อ'),
    esc('ลูกค้า'),
    esc('จำนวนสินค้า'),
    esc('ยอดรวม (บาท)'),
    esc('สถานะการชำระเงิน'),
    esc('สถานะการจัดส่ง'),
  ].join(','));
  if (data.recentOrders.length === 0) {
    lines.push(esc('ไม่มีรายการคำสั่งซื้อ'));
  } else {
    data.recentOrders.forEach((o) => {
      lines.push([
        o.order_id,
        esc(o.order_date),
        esc(o.customer),
        o.itemsCount,
        o.total_amount,
        esc(o.payment_status === 'PAID' ? 'ชำระเงินแล้ว' : 'รอชำระเงิน'),
        esc(o.status),
      ].join(','));
    });
  }

  // Prepend UTF-8 BOM so Excel opens Thai characters cleanly
  const csvContent = '\uFEFF' + lines.join('\n');

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filenamePrefix}_${now.toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
