// backend/routes/orders.routes.js
// Real checkout flow against MySQL — Orders + Order_Details (see
// sql/002_orders_and_description.sql). Everything that matters for money/stock
// is decided from the database inside a single transaction, never from
// whatever the client sent:
//   - price always comes from the current Inventory row, never from req.body
//   - stock is re-checked with SELECT ... FOR UPDATE inside the transaction
//     (so two shoppers racing to buy the last unit can't both succeed)
//   - if ANY item doesn't have enough stock, the whole order is rolled back —
//     no partial order, no partial stock deduction
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_STATUSES = ['รอดำเนินการ', 'กำลังจัดเตรียมสินค้า', 'จัดส่งแล้ว', 'สำเร็จ', 'ยกเลิก'];
const CANCELLED_STATUS = 'ยกเลิก';
// Fulfilment steps that may only start once accounting has confirmed the
// money (Orders.payment_status = 'PAID', see sql/005_accounting_finance.sql).
const REQUIRES_PAYMENT_STATUSES = ['กำลังจัดเตรียมสินค้า', 'จัดส่งแล้ว', 'สำเร็จ'];

// Roles that may read every order. Accounting and manager read them for financial/management
// checking; delivery reads them for fulfilment and shipping operations.
const ALL_ORDERS_ROLES = ['admin', 'accounting', 'delivery', 'manager'];

router.use(requireAuth);

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { error: 'ตะกร้าสินค้าว่างเปล่า' };
  }

  // Merge duplicate product ids (e.g. the client sent the same product twice)
  // into a single line so we only lock/update each Inventory row once.
  const byProductId = new Map();
  for (const raw of rawItems) {
    const productId = Number(raw && raw.product_id);
    const quantity = Number(raw && raw.quantity);
    if (!Number.isInteger(productId) || productId <= 0) {
      return { error: 'สินค้าในตะกร้าไม่ถูกต้อง' };
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { error: 'จำนวนสินค้าต้องเป็นจำนวนเต็มบวก' };
    }
    byProductId.set(productId, (byProductId.get(productId) || 0) + quantity);
  }

  return { items: Array.from(byProductId.entries()).map(([productId, quantity]) => ({ productId, quantity })) };
}

// POST /api/orders — checkout. Body: { items: [{ product_id, quantity }, ...] }
router.post('/', async (req, res, next) => {
  const { items, error } = normalizeItems(req.body && req.body.items);
  if (error) return res.status(400).json({ error });

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Lock every product row involved before checking stock, so a concurrent
    // checkout on the same product waits instead of racing past this check.
    const lockedProducts = [];
    for (const { productId, quantity } of items) {
      const [rows] = await conn.query(
        'SELECT id, name, price, stock, is_active FROM Inventory WHERE id = ? FOR UPDATE',
        [productId]
      );
      const product = rows[0];
      if (!product) {
        await conn.rollback();
        return res.status(400).json({ error: `ไม่พบสินค้า #${productId} ในระบบแล้ว` });
      }
      // Soft-deleted (Inventory.is_active = 0) — an item a user still has
      // sitting in their local cart from before an admin removed it must
      // never be purchasable, even though its row still exists for order
      // history to reference.
      if (!product.is_active) {
        await conn.rollback();
        return res.status(400).json({ error: `สินค้า "${product.name}" ถูกนำออกจากร้านค้าแล้ว ไม่สามารถสั่งซื้อได้` });
      }
      if (product.stock < quantity) {
        await conn.rollback();
        return res.status(409).json({
          error: `สินค้า "${product.name}" มีไม่เพียงพอ (คงเหลือ ${product.stock} ชิ้น)`,
        });
      }
      lockedProducts.push({ ...product, quantity });
    }

    const totalAmount = lockedProducts.reduce((sum, p) => sum + Number(p.price) * p.quantity, 0);

    const [orderResult] = await conn.query(
      'INSERT INTO Orders (user_id, total_amount, status) VALUES (?, ?, ?)',
      [req.user.id, totalAmount, ALLOWED_STATUSES[0]]
    );
    const orderId = orderResult.insertId;

    for (const p of lockedProducts) {
      const subtotal = Number(p.price) * p.quantity;
      await conn.query(
        'INSERT INTO Order_Details (order_id, product_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)',
        [orderId, p.id, p.quantity, p.price, subtotal]
      );
      await conn.query('UPDATE Inventory SET stock = stock - ? WHERE id = ?', [p.quantity, p.id]);
    }

    await conn.commit();

    // shipping_fee / discount / payment_status are left to their column
    // defaults (0, 0, PENDING_PAYMENT), so total_amount above is already the
    // full amount due: items + shipping_fee - discount.
    res.status(201).json({
      order_id: orderId,
      total_amount: totalAmount,
      status: ALLOWED_STATUSES[0],
      payment_status: 'PENDING_PAYMENT',
      items: lockedProducts.map((p) => ({
        product_id: p.id,
        name: p.name,
        quantity: p.quantity,
        price: Number(p.price),
        subtotal: Number(p.price) * p.quantity,
      })),
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // ignore rollback failure — the original error is what matters
      }
    }
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

async function attachOrderDetails(orders) {
  if (orders.length === 0) return orders;
  const orderIds = orders.map((o) => o.order_id);
  const placeholders = orderIds.map(() => '?').join(',');
  const [detailRows] = await pool.query(
    `SELECT od.order_id, od.product_id, od.quantity, od.price, od.subtotal, i.name AS product_name
     FROM Order_Details od
     LEFT JOIN Inventory i ON i.id = od.product_id
     WHERE od.order_id IN (${placeholders})
     ORDER BY od.order_detail_id ASC`,
    orderIds
  );
  const byOrder = new Map();
  for (const row of detailRows) {
    if (!byOrder.has(row.order_id)) byOrder.set(row.order_id, []);
    byOrder.get(row.order_id).push({
      product_id: row.product_id,
      // Falls back to a readable placeholder if the product was later deleted —
      // the order history must never break just because a product no longer exists.
      name: row.product_name || `Product #${row.product_id}`,
      quantity: row.quantity,
      price: Number(row.price),
      subtotal: Number(row.subtotal),
    });
  }

  // Latest payment attempt per order (a rejected slip followed by a new one
  // shows the new one) and every refund request, so both the buyer's and
  // accounting's order screens can show money state without extra calls.
  const [paymentRows] = await pool.query(
    `SELECT payment_id, order_id, amount, payment_method, payment_status, rejected_reason, receipt_no, verified_at, created_at
     FROM Payments WHERE order_id IN (${placeholders}) ORDER BY payment_id DESC`,
    orderIds
  );
  const latestPayment = new Map();
  for (const p of paymentRows) {
    if (!latestPayment.has(p.order_id)) latestPayment.set(p.order_id, { ...p, amount: Number(p.amount) });
  }

  const [refundRows] = await pool.query(
    `SELECT refund_id, order_id, refund_amount, reason, status, rejected_reason, created_at
     FROM Refunds WHERE order_id IN (${placeholders}) ORDER BY refund_id ASC`,
    orderIds
  );
  const refundsByOrder = new Map();
  for (const r of refundRows) {
    if (!refundsByOrder.has(r.order_id)) refundsByOrder.set(r.order_id, []);
    refundsByOrder.get(r.order_id).push({ ...r, refund_amount: Number(r.refund_amount) });
  }

  return orders.map((o) => {
    const items = byOrder.get(o.order_id) || [];
    return {
      ...o,
      shipping_fee: Number(o.shipping_fee),
      discount: Number(o.discount),
      product_amount: Math.round(items.reduce((sum, i) => sum + i.subtotal * 100, 0)) / 100,
      items,
      payment: latestPayment.get(o.order_id) || null,
      refunds: refundsByOrder.get(o.order_id) || [],
    };
  });
}

const ORDER_COLUMNS = 'o.order_id, o.user_id, o.order_date, o.total_amount, o.status, o.cancel_reason, o.payment_status, o.shipping_fee, o.discount';

// GET /api/orders — admin and accounting see every order (with the buyer's
// username); a regular user only ever sees their own. Enforced server-side,
// not just hidden in the UI, so a "user" role can never read someone else's
// order history.
router.get('/', async (req, res, next) => {
  try {
    let orders;
    if (ALL_ORDERS_ROLES.includes(req.user.role)) {
      const [rows] = await pool.query(
        `SELECT ${ORDER_COLUMNS}, u.username
         FROM Orders o
         JOIN Users u ON u.id = o.user_id
         ORDER BY o.order_date DESC`
      );
      orders = rows;
    } else {
      const [rows] = await pool.execute(
        `SELECT ${ORDER_COLUMNS}
         FROM Orders o WHERE o.user_id = ? ORDER BY o.order_date DESC`,
        [req.user.id]
      );
      orders = rows;
    }
    orders = orders.map((o) => ({ ...o, total_amount: Number(o.total_amount) }));
    res.json(await attachOrderDetails(orders));
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'รหัสคำสั่งซื้อไม่ถูกต้อง' });

    const [rows] = await pool.execute(
      `SELECT ${ORDER_COLUMNS}, u.username
       FROM Orders o JOIN Users u ON u.id = o.user_id WHERE o.order_id = ?`,
      [id]
    );
    const order = rows[0];
    // A "user" asking for someone else's order gets the same 404 as an order
    // that doesn't exist — never confirm/deny another user's order id.
    if (!order || (!ALL_ORDERS_ROLES.includes(req.user.role) && order.user_id !== req.user.id)) {
      return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
    }
    order.total_amount = Number(order.total_amount);
    const [withDetails] = await attachOrderDetails([order]);
    res.json(withDetails);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/orders/:id/status — admin and delivery.
// Delivery staff updates fulfilment to 'จัดส่งแล้ว' and 'สำเร็จ'.
// Cancelling an order (-> 'ยกเลิก') gives every item's quantity back to
// Inventory.stock in the same transaction as the status change, and requires
// a reason (stored on Orders.cancel_reason so the buyer can see why). Moving
// an order back OUT of 'ยกเลิก' does the mirror operation — it re-deducts the
// stock, and is blocked (409) if that stock was sold to someone else in the
// meantime. A normal transition between the other statuses never touches
// stock at all.
router.patch('/:id/status', requireRole('admin', 'delivery'), async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'รหัสคำสั่งซื้อไม่ถูกต้อง' });

  const status = typeof req.body.status === 'string' ? req.body.status.trim() : '';
  if (!ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({ error: `สถานะต้องเป็นหนึ่งใน: ${ALLOWED_STATUSES.join(', ')}` });
  }
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [orderRows] = await conn.query('SELECT order_id, status, payment_status FROM Orders WHERE order_id = ? FOR UPDATE', [id]);
    const order = orderRows[0];
    if (!order) {
      await conn.rollback();
      return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
    }

    // The order must not move on to fulfilment until accounting has
    // confirmed the payment — checked here, not just hidden in the UI.
    if (status !== order.status && REQUIRES_PAYMENT_STATUSES.includes(status) && order.payment_status !== 'PAID') {
      await conn.rollback();
      return res.status(409).json({
        error: 'ยังเปลี่ยนสถานะนี้ไม่ได้ — ฝ่ายบัญชียังไม่ได้ยืนยันการชำระเงินของคำสั่งซื้อนี้',
      });
    }

    const wasCancelled = order.status === CANCELLED_STATUS;
    const willBeCancelled = status === CANCELLED_STATUS;

    // Cancelling for the first time — require a reason and give stock back.
    if (willBeCancelled && !wasCancelled) {
      if (!reason) {
        await conn.rollback();
        return res.status(400).json({ error: 'กรุณาระบุเหตุผลที่ยกเลิกคำสั่งซื้อ' });
      }
      const [items] = await conn.query('SELECT product_id, quantity FROM Order_Details WHERE order_id = ?', [id]);
      for (const item of items) {
        await conn.query('UPDATE Inventory SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
      }
    }

    // Un-cancelling — re-deduct stock, but only if it's actually still available
    // (someone else may have bought it while this order sat cancelled).
    if (wasCancelled && !willBeCancelled) {
      const [items] = await conn.query(
        `SELECT od.product_id, od.quantity, i.name, i.stock
         FROM Order_Details od JOIN Inventory i ON i.id = od.product_id
         WHERE od.order_id = ? FOR UPDATE`,
        [id]
      );
      for (const item of items) {
        if (item.stock < item.quantity) {
          await conn.rollback();
          return res.status(409).json({
            error: `เปลี่ยนสถานะไม่ได้ เพราะสินค้า "${item.name}" มีไม่พอแล้ว (คงเหลือ ${item.stock} ชิ้น) — มีคนอื่นซื้อไปหลังจากคำสั่งซื้อนี้ถูกยกเลิก`,
          });
        }
      }
      for (const item of items) {
        await conn.query('UPDATE Inventory SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);
      }
    }

    // cancel_reason: set/updated whenever the target status is 'ยกเลิก' (so an
    // admin can also just correct the reason text without re-cancelling);
    // cleared whenever the order leaves 'ยกเลิก'.
    const cancelReasonToStore = willBeCancelled ? reason || null : null;

    await conn.query('UPDATE Orders SET status = ?, cancel_reason = ? WHERE order_id = ?', [
      status,
      cancelReasonToStore,
      id,
    ]);

    await conn.commit();
    res.json({ success: true, order_id: id, status, cancel_reason: cancelReasonToStore });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // ignore rollback failure — the original error is what matters
      }
    }
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
