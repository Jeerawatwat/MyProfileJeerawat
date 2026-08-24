// backend/routes/dashboard.routes.js
// All dashboard numbers are live aggregates over the real Inventory table —
// nothing here is a placeholder or mock figure.
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const [[totals]] = await pool.query(
      `SELECT
         COUNT(*) AS totalProducts,
         COUNT(DISTINCT NULLIF(category, '')) AS totalCategories,
         SUM(CASE WHEN stock > 0 AND stock <= 10 THEN 1 ELSE 0 END) AS lowStock,
         SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) AS outOfStock
       FROM Inventory`
    );

    const [recentProducts] = await pool.execute(
      'SELECT id, name, price, stock, category, image_url FROM Inventory ORDER BY id DESC LIMIT 5'
    );

    res.json({
      totalProducts: Number(totals.totalProducts) || 0,
      totalCategories: Number(totals.totalCategories) || 0,
      lowStock: Number(totals.lowStock) || 0,
      outOfStock: Number(totals.outOfStock) || 0,
      recentProducts,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
