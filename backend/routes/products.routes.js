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
// "Deleting" a product is a SOFT delete (Inventory.is_active = 0), not a real
// row deletion. A hard DELETE used to fail outright once a product had ever
// been ordered (Order_Details.product_id is a foreign key into this table,
// so removing the row would either violate that constraint or corrupt order
// history). Soft-deleting instead just hides the product from every GET here
// — so it disappears from the Admin Products page and the User shop — while
// past orders keep JOINing against the real, unchanged row and still show
// its correct name/price (see sql/004_soft_delete_products.sql).
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateProductInput } = require('../utils/validators');

const router = express.Router();

const SELECT_COLUMNS = 'id, name, price, stock, category, image_url, description';

router.use(requireAuth);

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

    res.json(rows);
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
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

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

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid product id' });

    // Soft delete — see the comment at the top of this file. Only flips a
    // still-active row so deleting the same id twice cleanly 404s the
    // second time instead of reporting fake success.
    const [result] = await pool.execute(
      'UPDATE Inventory SET is_active = 0 WHERE id = ? AND is_active = 1',
      [id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Product not found' });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
