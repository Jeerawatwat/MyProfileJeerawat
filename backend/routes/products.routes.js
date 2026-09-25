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

const router = express.Router();

const SELECT_COLUMNS = 'id, name, price, stock, category, image_url, description';

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
router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { errors, data } = validateProductInput(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const [result] = await pool.execute(
      'INSERT INTO Inventory (name, price, stock, category, image_url, description, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [data.name, data.price, data.stock, data.category, data.image_url, data.description]
    );

    const [rows] = await pool.execute(`SELECT ${SELECT_COLUMNS} FROM Inventory WHERE id = ?`, [
      result.insertId,
    ]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ===== แก้ไข (Edit / Update) =====
router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid product id' });

    const { errors, data } = validateProductInput(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const [result] = await pool.execute(
      'UPDATE Inventory SET name = ?, price = ?, stock = ?, category = ?, image_url = ?, description = ? WHERE id = ?',
      [data.name, data.price, data.stock, data.category, data.image_url, data.description, id]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Product not found' });

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
