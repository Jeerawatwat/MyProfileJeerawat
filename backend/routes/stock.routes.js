// backend/routes/stock.routes.js
// Dedicated backend endpoints for the warehouse & inventory management (Stock role).
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('stock', 'admin'));

// GET /api/stock/inventory — list inventory items with computed stats
router.get('/inventory', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, price, stock, category, image_url, description
       FROM Inventory
       WHERE is_active = 1 OR is_active IS NULL
       ORDER BY stock ASC, id ASC`
    );

    let totalItems = 0;
    let totalCostValue = 0;
    let totalRetailValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    const lowStockProducts = [];

    const products = rows.map((row) => {
      const id = Number(row.id);
      const stock = Number(row.stock) || 0;
      const price = Number(row.price) || 0;
      const minStock = 5;
      const costPrice = Math.round(price * 0.7);

      const sku = `SKU-${String(row.category || 'PRD').slice(0, 3).toUpperCase()}-${String(id).padStart(3, '0')}`;
      const location = `A-0${(id % 3) + 1}-0${(id % 9) + 1}`;

      let status = 'IN_STOCK';
      if (stock === 0) {
        status = 'OUT_OF_STOCK';
        outOfStockCount++;
      } else if (stock <= minStock) {
        status = 'LOW_STOCK';
        lowStockCount++;
        lowStockProducts.push({ id, name: row.name, stock, minStock });
      }

      totalItems += stock;
      totalCostValue += costPrice * stock;
      totalRetailValue += price * stock;

      return {
        id,
        name: row.name,
        description: row.description || '',
        category: row.category,
        image_url: row.image_url,
        price,
        cost_price: costPrice,
        stock,
        min_stock: minStock,
        sku,
        location,
        status,
      };
    });

    res.json({
      summary: {
        totalProducts: products.length,
        totalItems,
        totalCostValue,
        totalRetailValue,
        lowStockCount,
        outOfStockCount,
        lowStockProducts,
      },
      products,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/stock/inventory/:id — adjust stock quantity
router.patch('/inventory/:id', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'รหัสสินค้าไม่ถูกต้อง' });

  const { changeAmount, newStock, reason = 'ปรับยอดสต็อก', note = '' } = req.body || {};

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query('SELECT id, name, stock FROM Inventory WHERE id = ? FOR UPDATE', [id]);
    const product = rows[0];
    if (!product) {
      await conn.rollback();
      return res.status(404).json({ error: 'ไม่พบสินค้าในระบบ' });
    }

    const previousStock = Number(product.stock);
    let finalStock = previousStock;

    if (newStock !== undefined && newStock !== null) {
      finalStock = Math.max(0, Number(newStock));
    } else if (changeAmount !== undefined && changeAmount !== null) {
      finalStock = Math.max(0, previousStock + Number(changeAmount));
    }

    const delta = finalStock - previousStock;

    await conn.query('UPDATE Inventory SET stock = ? WHERE id = ?', [finalStock, id]);

    // Insert into Stock_Logs if the table exists
    try {
      await conn.query(
        `INSERT INTO Stock_Logs (product_id, change_amount, previous_stock, new_stock, reason, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, delta, previousStock, finalStock, reason, note || null, req.user?.username || 'stock']
      );
    } catch {
      // Table may not exist yet if migration hasn't been run; ignore gracefully
    }

    await conn.commit();
    res.json({ success: true, id, previousStock, newStock: finalStock, changeAmount: delta });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/stock/logs — history of stock adjustments
router.get('/logs', async (req, res, next) => {
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
    // If Stock_Logs table doesn't exist yet, return empty list
    res.json([]);
  }
});

module.exports = router;
