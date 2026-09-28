// backend/scripts/backfill-product-units.js
// One-time script: gives every order paid BEFORE the product-claims feature
// existed a Serial Number too (sql/009_product_claims.sql), so those old
// orders can still be looked up and claimed.
//
// Run once, after applying sql/009_product_claims.sql, from the server:
//   node backend/scripts/backfill-product-units.js
//
// Safe to re-run: it reuses the exact same assignUnitsForOrder() the app
// itself calls when an order first reaches จัดส่งแล้ว/สำเร็จ, which is
// idempotent — an order_detail that already has its units skips straight
// past. Only ever touches PAID orders (an unpaid/rejected/cancelled order was
// never actually received, so there's nothing there to warrant a claim on).
require('dotenv').config();
const { pool } = require('../config/db');
const { assignUnitsForOrder } = require('../services/productUnits');

async function main() {
  const [orders] = await pool.query("SELECT order_id FROM Orders WHERE payment_status = 'PAID' ORDER BY order_id ASC");
  console.log(`Found ${orders.length} paid order(s) to check...`);

  let done = 0;
  let failed = 0;
  for (const { order_id: orderId } of orders) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await assignUnitsForOrder(conn, orderId);
      await conn.commit();
      done += 1;
    } catch (err) {
      await conn.rollback().catch(() => {});
      failed += 1;
      console.error(`  Order #${orderId} failed: ${err.message}`);
    } finally {
      conn.release();
    }
  }

  console.log(`Done. ${done} order(s) backfilled, ${failed} failed.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
