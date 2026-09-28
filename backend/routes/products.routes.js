// backend/routes/products.routes.js
// CRUD over the real `Inventory` table (id, name, price, stock, category,
// image_url, description). image_url and description were both added via
// non-destructive ALTER TABLEs (nullable, no data loss) — image_url earlier,
// description in sql/002_orders_and_description.sql — so products can carry a
// photo and a longer description shown on the User shop page. All queries are
// parameterized — never string-concatenated.
//
// GET routes are open to any authenticated user (admin or user) — the User
// shop needs to read the live catalog too. Mutations (create/update/delete)
// are admin-only: a plain "user" role must never be able to change price,
// stock, or delete a product, even by calling the API directly.
//
// "Deleting" a product is a real HARD delete (the row is actually removed
// from Inventory), per instructor requirement. Order_Details.product_id is a
// foreign key into this table, so deleting a product that has been ordered
// first removes every Order_Details row referencing it, then removes any
// Order left with zero line items as a result — the whole delete runs in one
// transaction so a product and its order history disappear together or not
// at all. Exception: a product in any order that already has a payment on
// file is refused with 409 (see the guard in DELETE /:id) so accounting
// history is never destroyed. is_active still exists on legacy rows from the old soft-delete
// scheme (see sql/004_soft_delete_products.sql) and every GET here still
// filters on it, but no code path sets it to 0 anymore.
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateProductInput } = require('../utils/validators');
const { computePriceTiers } = require('../services/priceClustering');
const { withTransaction, httpError } = require('../utils/transaction');
const { allocateSerials, releaseSerials } = require('../services/productUnits');

const router = express.Router();

const SELECT_COLUMNS =
  'id, name, price, original_price, stock, category, image_url, description, model, warranty_months, serial_prefix';

// serial_prefix is optional but must be unique across products when set —
// checked in the route (not just left to the DB's UNIQUE KEY) so the error
// message is one the admin/stock user can actually act on.
async function assertSerialPrefixAvailable(conn, serialPrefix, excludeId) {
  if (!serialPrefix) return;
  const params = excludeId ? [serialPrefix, excludeId] : [serialPrefix];
  const [rows] = await conn.query(
    `SELECT id FROM Inventory WHERE serial_prefix = ?${excludeId ? ' AND id <> ?' : ''}`,
    params
  );
  if (rows.length) throw httpError(409, `รหัสนำหน้า Serial "${serialPrefix}" ถูกใช้กับสินค้าอื่นแล้ว`);
}

router.use(requireAuth);

// ===== AI/ML Price Auto Cluster =====
// AI/ML Price Auto Cluster (K-Means) — attaches a `priceTier` field
// ('Budget' | 'Standard' | 'Premium' | null) to product rows without
// touching the database (no new column, nothing cached). Every call
// re-reads the full ACTIVE catalog's prices and re-runs K-Means fresh, so a
// product's tier always reflects the current price spread of the whole
// shop — not just whatever subset a search/category filter happens to
// return. See backend/services/priceClustering.js for the algorithm.
async function attachPriceTiers(rows) {
  const [activeProducts] = await pool.execute(
    'SELECT id, price FROM Inventory WHERE is_active = 1'
  );
  const tierByProductId = computePriceTiers(activeProducts);

  return rows.map((row) => ({
    ...row,
    priceTier: tierByProductId.get(row.id) ?? null,
  }));
}

// ===== ค้นหา (Search) =====
// GET /api/products?search=&category=
// search matches product name OR the numeric id (the closest thing this table
// has to a "product code") so the User search box can look up either.
router.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';

    const conditions = ['is_active = 1'];
    const params = [];

    if (search) {
      const searchAsId = Number(search);
      if (Number.isInteger(searchAsId) && String(searchAsId) === search) {
        conditions.push('(name LIKE ? OR category LIKE ? OR id = ?)');
        params.push(`%${search}%`, `%${search}%`, searchAsId);
      } else {
        conditions.push('(name LIKE ? OR category LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
      }
    }
    if (category && category.toLowerCase() !== 'all') {
      conditions.push('category = ?');
      params.push(category);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const [rows] = await pool.execute(
      `SELECT ${SELECT_COLUMNS} FROM Inventory ${where} ORDER BY id DESC`,
      params
    );

    res.json(await attachPriceTiers(rows));
  } catch (err) {
    next(err);
  }
});

// POST /api/products/promotions/randomize — admin only. Re-rolls which
// products are "on sale". Always restores anything currently discounted
// first (so re-rolling never stacks a second discount on top of one already
// applied), then picks a random ~30–60% slice of the active, in-stock
// catalog and lowers Inventory.price itself by a random 10–35% — a real
// price cut honored at checkout, not just a badge shown on the shop page.
router.post('/promotions/randomize', requireRole('admin'), async (req, res, next) => {
  try {
    const promoted = await withTransaction(async (conn) => {
      await conn.query(
        'UPDATE Inventory SET price = original_price, original_price = NULL WHERE original_price IS NOT NULL'
      );

      const [candidates] = await conn.query('SELECT id, price FROM Inventory WHERE is_active = 1 AND stock > 0 FOR UPDATE');
      if (candidates.length === 0) return [];

      const shuffled = [...candidates].sort(() => Math.random() - 0.5);
      const share = 0.3 + Math.random() * 0.3;
      const count = Math.max(1, Math.round(shuffled.length * share));
      const picked = shuffled.slice(0, count);

      const results = [];
      for (const p of picked) {
        const discountPercent = 10 + Math.floor(Math.random() * 26); // 10–35%
        const originalPrice = Number(p.price);
        const newPrice = Math.max(1, Math.round((originalPrice * (100 - discountPercent)) / 100));
        await conn.query('UPDATE Inventory SET original_price = ?, price = ? WHERE id = ?', [originalPrice, newPrice, p.id]);
        results.push({ id: p.id, original_price: originalPrice, price: newPrice, discount_percent: discountPercent });
      }
      return results;
    });

    res.json({ success: true, promoted_count: promoted.length, promoted });
  } catch (err) {
    next(err);
  }
});

// POST /api/products/promotions/clear — admin only. Restores every
// currently-discounted product back to its normal price.
router.post('/promotions/clear', requireRole('admin'), async (req, res, next) => {
  try {
    const restoredCount = await withTransaction(async (conn) => {
      const [result] = await conn.query(
        'UPDATE Inventory SET price = original_price, original_price = NULL WHERE original_price IS NOT NULL'
      );
      return result.affectedRows;
    });
    res.json({ success: true, restored_count: restoredCount });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/stock/logs — stock adjustment logs fallback
router.get('/stock/logs', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT sl.id, sl.product_id, sl.change_amount, sl.previous_stock, sl.new_stock,
             sl.reason, sl.note, sl.created_by, sl.created_at, i.name AS product_name
      FROM Stock_Logs sl
      LEFT JOIN Inventory i ON i.id = sl.product_id
      ORDER BY sl.created_at DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch {
    res.json([]);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid product id' });

    const [rows] = await pool.execute(
      `SELECT ${SELECT_COLUMNS} FROM Inventory WHERE id = ? AND is_active = 1`,
      [id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
    const [withTier] = await attachPriceTiers(rows);
    res.json(withTier);
  } catch (err) {
    next(err);
  }
});

// ===== เพิ่ม (Add / Create) =====
// Also mints one Product_Units row (Serial Number) per initial stock unit —
// sql/009_product_claims.sql / backend/services/productUnits.js — so every
// physical piece of this product can be identified later for a warranty claim.
router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { errors, data } = validateProductInput(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const productId = await withTransaction(async (conn) => {
      await assertSerialPrefixAvailable(conn, data.serial_prefix, null);
      const [result] = await conn.query(
        `INSERT INTO Inventory (name, price, stock, category, image_url, description, model, warranty_months, serial_prefix, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [data.name, data.price, data.stock, data.category, data.image_url, data.description, data.model, data.warranty_months, data.serial_prefix]
      );
      await allocateSerials(conn, result.insertId, data.stock);
      return result.insertId;
    });

    const [rows] = await pool.execute(`SELECT ${SELECT_COLUMNS} FROM Inventory WHERE id = ?`, [productId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ===== แก้ไข (Edit / Update) =====
// Also used by the 'stock' role to adjust stock counts (see role-guard.tsx /
// stock/inventory.tsx) — every stock change here is logged to Stock_Logs
// (both this route's own row with a human reason/note, AND
// sql/008_stock_logs_trigger.sql's DB trigger fires too; that's an existing
// double-log from the delivery/stock feature, not something this claims work
// changes). If stock goes UP, this also mints new Serial Numbers for the
// extra units; if it goes DOWN, it best-effort removes that many still-unsold
// (IN_STOCK) units — see releaseSerials()'s comment for why a mismatch here
// is harmless. Everything below runs in one transaction so a partial update
// (e.g. product row updated but stock log/serials not) can't happen.
router.put('/:id', requireRole('admin', 'stock'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid product id' });

    const { errors, data } = validateProductInput(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const found = await withTransaction(async (conn) => {
      const [existingRows] = await conn.query('SELECT stock FROM Inventory WHERE id = ? FOR UPDATE', [id]);
      if (!existingRows[0]) return false;
      await assertSerialPrefixAvailable(conn, data.serial_prefix, id);
      const prevStock = Number(existingRows[0].stock);

      // A manual price edit always exits promo state — original_price would
      // otherwise keep pointing at a now-stale "before" price.
      await conn.query(
        `UPDATE Inventory
         SET name = ?, price = ?, original_price = NULL, stock = ?, category = ?, image_url = ?, description = ?,
             model = ?, warranty_months = ?, serial_prefix = ?
         WHERE id = ?`,
        [data.name, data.price, data.stock, data.category, data.image_url, data.description, data.model, data.warranty_months, data.serial_prefix, id]
      );

      const newStock = Number(data.stock);
      const stockDelta = newStock - prevStock;
      if (stockDelta > 0) await allocateSerials(conn, id, stockDelta);
      else if (stockDelta < 0) await releaseSerials(conn, id, -stockDelta);

      // Record adjustment to Stock_Logs if stock changed (the 'stock' role's
      // own screen sends reason/note; other callers get a generic reason).
      if (stockDelta !== 0) {
        const reason = req.body?.reason || (stockDelta > 0 ? 'รับสินค้าเข้าคลัง (PO Inbound)' : 'ตัดจ่าย/เบิกออกคลัง');
        const note = req.body?.note || null;
        try {
          await conn.query(
            `INSERT INTO Stock_Logs (product_id, change_amount, previous_stock, new_stock, reason, note, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, stockDelta, prevStock, newStock, reason, note, req.user?.username || 'stock']
          );
        } catch {
          // Table might not exist yet on a server that hasn't run
          // sql/007_stock_role_and_inventory.sql — ignore safely.
        }
      }
      return true;
    });

    if (!found) return res.status(404).json({ error: 'Product not found' });

    const [rows] = await pool.execute(`SELECT ${SELECT_COLUMNS} FROM Inventory WHERE id = ?`, [id]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ===== ลบ (Delete) =====
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid product id' });

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query('SELECT id FROM Inventory WHERE id = ? FOR UPDATE', [id]);
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Product not found' });
    }

    // Remove every Order_Details row that references this product, then any
    // Order left with zero line items as a result, before removing the
    // product itself — otherwise the Order_Details.product_id foreign key
    // would reject the delete outright.
    const [affectedOrders] = await conn.query(
      'SELECT DISTINCT order_id FROM Order_Details WHERE product_id = ?',
      [id]
    );

    // Financial records guard: an order that has any payment on file (a
    // submitted slip, a confirmed payment with a receipt, or a rejected
    // attempt) is part of the accounting history. Deleting it would change
    // past income/refund figures and orphan receipts, so such products can't
    // be hard-deleted. Products only in never-paid orders delete as before.
    if (affectedOrders.length > 0) {
      const orderIds = affectedOrders.map((o) => o.order_id);
      const [[{ paidCount }]] = await conn.query(
        `SELECT COUNT(*) AS paidCount FROM Payments WHERE order_id IN (${orderIds.map(() => '?').join(',')})`,
        orderIds
      );
      if (Number(paidCount) > 0) {
        await conn.rollback();
        return res.status(409).json({
          error: 'ลบสินค้านี้ไม่ได้ เพราะอยู่ในคำสั่งซื้อที่มีข้อมูลการชำระเงินแล้ว (ต้องเก็บไว้เป็นหลักฐานทางบัญชี) — แนะนำให้ตั้งสต๊อกเป็น 0 แทน',
        });
      }
    }
    await conn.query('DELETE FROM Order_Details WHERE product_id = ?', [id]);

    // Every Product_Units row for this product is safe to remove at this
    // point too: the paid-order guard above already refused the delete if
    // any unit here was SOLD as part of a paid order (which is the only kind
    // a Claim can reference — Claims require a PAID order — so no claim
    // history is ever orphaned by this).
    await conn.query('DELETE FROM Product_Units WHERE product_id = ?', [id]);

    for (const { order_id } of affectedOrders) {
      const [[{ remaining }]] = await conn.query(
        'SELECT COUNT(*) AS remaining FROM Order_Details WHERE order_id = ?',
        [order_id]
      );
      if (remaining === 0) {
        await conn.query('DELETE FROM Orders WHERE order_id = ?', [order_id]);
      }
    }

    await conn.query('DELETE FROM Inventory WHERE id = ?', [id]);

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
