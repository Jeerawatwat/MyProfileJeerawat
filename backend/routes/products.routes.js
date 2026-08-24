// backend/routes/products.routes.js
// CRUD over the real `Inventory` table (id, name, price, stock, category,
// image_url). image_url was added via a non-destructive ALTER TABLE (nullable,
// no data loss) so products can carry a photo — either a pasted external URL
// or a path returned by POST /api/uploads/image. All queries are
// parameterized — never string-concatenated.
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { validateProductInput } = require('../utils/validators');

const router = express.Router();

const SELECT_COLUMNS = 'id, name, price, stock, category, image_url';

router.use(requireAuth);

// GET /api/products?search=&category=
router.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';

    const conditions = [];
    const params = [];

    if (search) {
      conditions.push('(name LIKE ? OR category LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category && category.toLowerCase() !== 'all') {
      conditions.push('category = ?');
      params.push(category);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
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

    const [rows] = await pool.execute(`SELECT ${SELECT_COLUMNS} FROM Inventory WHERE id = ?`, [id]);

    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { errors, data } = validateProductInput(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const [result] = await pool.execute(
      'INSERT INTO Inventory (name, price, stock, category, image_url) VALUES (?, ?, ?, ?, ?)',
      [data.name, data.price, data.stock, data.category, data.image_url]
    );

    const [rows] = await pool.execute(`SELECT ${SELECT_COLUMNS} FROM Inventory WHERE id = ?`, [
      result.insertId,
    ]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid product id' });

    const { errors, data } = validateProductInput(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const [result] = await pool.execute(
      'UPDATE Inventory SET name = ?, price = ?, stock = ?, category = ?, image_url = ? WHERE id = ?',
      [data.name, data.price, data.stock, data.category, data.image_url, id]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Product not found' });

    const [rows] = await pool.execute(`SELECT ${SELECT_COLUMNS} FROM Inventory WHERE id = ?`, [id]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid product id' });

    const [result] = await pool.execute('DELETE FROM Inventory WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Product not found' });

    res.json({ success: true });
  } catch (err) {
    if (err && err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'This product cannot be deleted because it is referenced elsewhere' });
    }
    next(err);
  }
});

module.exports = router;
