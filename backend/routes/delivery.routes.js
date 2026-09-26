// backend/routes/delivery.routes.js
// Dedicated backend endpoints for the delivery role.
// Accessible by users with 'delivery' or 'admin' roles.
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('delivery', 'admin'));

// Helper to attach order details (items in order)
async function attachOrderDetails(orders) {
  if (!orders || orders.length === 0) return [];
  const orderIds = orders.map((o) => o.order_id);
  const [items] = await pool.query(
    `SELECT od.order_id, od.product_id, od.quantity, od.price, od.subtotal, i.name, i.image_url
     FROM Order_Details od
     JOIN Inventory i ON i.id = od.product_id
     WHERE od.order_id IN (${orderIds.map(() => '?').join(',')})`,
    orderIds
  );

  const itemsByOrder = new Map();
  for (const item of items) {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
    itemsByOrder.get(item.order_id).push({
      product_id: item.product_id,
      name: item.name,
      price: Number(item.price),
      quantity: Number(item.quantity),
      subtotal: Number(item.subtotal),
      image_url: item.image_url,
    });
  }

  return orders.map((o) => ({
    ...o,
    items: itemsByOrder.get(o.order_id) || [],
  }));
}

// GET /api/delivery/dashboard — summary stats for delivery operations
router.get('/dashboard', async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('รอดำเนินการ', 'กำลังจัดเตรียมสินค้า') THEN 1 ELSE 0 END), 0) AS pendingDelivery,
        COALESCE(SUM(CASE WHEN status = 'จัดส่งแล้ว' THEN 1 ELSE 0 END), 0) AS outForDelivery,
        COALESCE(SUM(CASE WHEN status = 'สำเร็จ' AND DATE(order_date) = CURDATE() THEN 1 ELSE 0 END), 0) AS completedToday,
        COUNT(*) AS totalOrders
      FROM Orders
      WHERE status <> 'ยกเลิก'
    `);

    const stats = rows[0] || {};
    res.json({
      pendingDelivery: Number(stats.pendingDelivery) || 0,
      outForDelivery: Number(stats.outForDelivery) || 0,
      completedToday: Number(stats.completedToday) || 0,
      totalOrders: Number(stats.totalOrders) || 0,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/delivery/orders — list orders for delivery with items
router.get('/orders', async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT o.order_id, o.user_id, o.order_date, o.total_amount, o.status,
             o.payment_status, o.shipping_fee, o.discount, u.username
      FROM Orders o
      JOIN Users u ON u.id = o.user_id
    `;
    const params = [];

    if (status && typeof status === 'string' && status.trim() !== '') {
      query += ` WHERE o.status = ?`;
      params.push(status.trim());
    } else {
      query += ` WHERE o.status <> 'ยกเลิก'`;
    }

    query += ` ORDER BY o.order_date DESC`;

    const [rows] = await pool.query(query, params);
    const orders = rows.map((o) => ({
      ...o,
      total_amount: Number(o.total_amount),
      shipping_fee: Number(o.shipping_fee || 0),
      discount: Number(o.discount || 0),
    }));

    res.json(await attachOrderDetails(orders));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/delivery/orders/:id/status — update order delivery status
router.patch('/orders/:id/status', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'รหัสคำสั่งซื้อไม่ถูกต้อง' });

    const status = typeof req.body.status === 'string' ? req.body.status.trim() : '';
    const ALLOWED = ['รอดำเนินการ', 'กำลังจัดเตรียมสินค้า', 'จัดส่งแล้ว', 'สำเร็จ'];
    if (!ALLOWED.includes(status)) {
      return res.status(400).json({ error: `สถานะต้องเป็นหนึ่งใน: ${ALLOWED.join(', ')}` });
    }

    const [orderRows] = await pool.query('SELECT order_id, status, payment_status FROM Orders WHERE order_id = ?', [id]);
    const order = orderRows[0];
    if (!order) return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });

    // Ensure payment has been verified before moving to fulfilment/delivery
    if (order.payment_status !== 'PAID') {
      return res.status(409).json({ error: 'ยังเปลี่ยนสถานะไม่ได้ — ฝ่ายบัญชียังไม่ได้ยืนยันการชำระเงิน' });
    }

    await pool.query('UPDATE Orders SET status = ? WHERE order_id = ?', [status, id]);
    res.json({ success: true, order_id: id, status });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
