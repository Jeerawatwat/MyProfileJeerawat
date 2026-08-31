// backend/routes/categories.routes.js
// There is no separate Categories table in the real database — `category` is a
// plain VARCHAR column on Inventory, so "the category list" is the distinct set
// of values already in use. No hard-coded category names.
// is_active = 1 — a soft-deleted product (see products.routes.js) must not
// keep padding its category's product count or keep a category alive that
// only ever had deleted products in it.
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT category, COUNT(*) AS productCount
       FROM Inventory
       WHERE category IS NOT NULL AND category <> '' AND is_active = 1
       GROUP BY category
       ORDER BY category ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
