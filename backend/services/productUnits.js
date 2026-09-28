// backend/services/productUnits.js
// Serial Number pool for individual physical units of a product ("สินค้า
// รายชิ้น"), see sql/009_product_claims.sql. Inventory.stock stays a plain
// count exactly as before — checkout (orders.routes.js POST /) never touches
// this table, so that already-tested transaction is untouched by this
// feature. Units are only assigned to an order once it reaches
// "จัดส่งแล้ว"/"สำเร็จ" (see orders.routes.js's PATCH /:id/status), which is
// when a real shop would actually know which physical box went out.
const { pool } = require('../config/db');

// Falls back to a prefix derived from the product name (first letters) with
// the product id always appended — never just the letters alone, because two
// products can easily share the same first 3 letters (e.g. two products both
// named starting with "JBL ..."), which would make them mint the exact same
// serial numbers and collide on Product_Units' unique serial_no. The product
// id is unique by definition, so appending it makes every fallback prefix
// unique by construction, with no lookup needed.
function defaultPrefix(name, productId) {
  const letters = String(name || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);
  return `${letters || 'P'}${productId}`;
}

// Creates `count` brand-new IN_STOCK units for a product and returns their
// unit_ids. Serial numbers are `${prefix}-${seq}` where `seq` comes from
// Inventory.next_unit_seq, locked/incremented under `conn`'s transaction so
// two concurrent calls (e.g. two admins editing stock at once) can never hand
// out the same number. Prefix uniqueness across products is enforced at the
// DB level (Inventory.uq_inventory_serial_prefix) when an admin sets one
// explicitly; the id-based fallback needs no such check.
async function allocateSerials(conn, productId, count) {
  if (!count || count <= 0) return [];
  const [[inv]] = await conn.query(
    'SELECT next_unit_seq, serial_prefix, name FROM Inventory WHERE id = ? FOR UPDATE',
    [productId]
  );
  if (!inv) return [];
  const prefix = (inv.serial_prefix && inv.serial_prefix.trim()) || defaultPrefix(inv.name, productId);
  const startSeq = inv.next_unit_seq;
  await conn.query('UPDATE Inventory SET next_unit_seq = next_unit_seq + ? WHERE id = ?', [count, productId]);

  const unitIds = [];
  for (let i = 0; i < count; i += 1) {
    const serialNo = `${prefix}-${String(startSeq + i).padStart(6, '0')}`;
    const [result] = await conn.query(
      "INSERT INTO Product_Units (product_id, serial_no, status) VALUES (?, ?, 'IN_STOCK')",
      [productId, serialNo]
    );
    unitIds.push(result.insertId);
  }
  return unitIds;
}

// Removes up to `count` still-unsold (IN_STOCK) units for a product — used
// when an admin lowers a product's stock, so the Serial pool roughly tracks
// the stock count. Units already SOLD/CLAIMED are never touched, and if there
// aren't enough IN_STOCK units to remove, it just removes what it can — a
// mismatch here is harmless (see assignUnitsForOrder's shortfall handling).
async function releaseSerials(conn, productId, count) {
  if (!count || count <= 0) return;
  await conn.query(
    `DELETE FROM Product_Units WHERE unit_id IN (
       SELECT unit_id FROM (
         SELECT unit_id FROM Product_Units WHERE product_id = ? AND status = 'IN_STOCK'
         ORDER BY unit_id DESC LIMIT ?
       ) AS doomed
     )`,
    [productId, count]
  );
}

// Assigns real Serial Numbers to every line of an order once it's known to
// have shipped — called from orders.routes.js's PATCH /:id/status. Idempotent:
// an order_detail that already has its units assigned (e.g. the admin moves
// จัดส่งแล้ว -> สำเร็จ, or clicks the same status twice) is skipped. If the
// IN_STOCK pool for a product has fewer units than needed (e.g. it was added
// before this feature shipped, or stock/units drifted apart), the shortfall
// is minted fresh via allocateSerials so every paid order can still be
// claimed — there's always *a* serial per unit sold, even if it wasn't
// pre-printed on a physical label.
async function assignUnitsForOrder(conn, orderId) {
  const [[order]] = await conn.query('SELECT order_date FROM Orders WHERE order_id = ?', [orderId]);
  if (!order) return;

  const [details] = await conn.query(
    'SELECT order_detail_id, product_id, quantity FROM Order_Details WHERE order_id = ?',
    [orderId]
  );

  for (const detail of details) {
    const [[{ already }]] = await conn.query(
      'SELECT COUNT(*) AS already FROM Product_Units WHERE order_detail_id = ?',
      [detail.order_detail_id]
    );
    const need = detail.quantity - Number(already);
    if (need <= 0) continue;

    const [available] = await conn.query(
      "SELECT unit_id FROM Product_Units WHERE product_id = ? AND status = 'IN_STOCK' ORDER BY unit_id ASC LIMIT ? FOR UPDATE",
      [detail.product_id, need]
    );
    const unitIds = available.map((r) => r.unit_id);
    const shortfall = need - unitIds.length;
    if (shortfall > 0) {
      const minted = await allocateSerials(conn, detail.product_id, shortfall);
      unitIds.push(...minted);
    }
    if (unitIds.length === 0) continue;

    const [[inv]] = await conn.query('SELECT warranty_months FROM Inventory WHERE id = ?', [detail.product_id]);
    const warrantyMonths = inv ? inv.warranty_months : 12;

    await conn.query(
      `UPDATE Product_Units
         SET status = 'SOLD', order_id = ?, order_detail_id = ?, sold_at = NOW(),
             warranty_expires_at = DATE_ADD(?, INTERVAL ? MONTH)
       WHERE unit_id IN (${unitIds.map(() => '?').join(',')})`,
      [orderId, detail.order_detail_id, order.order_date, warrantyMonths, ...unitIds]
    );
  }
}

// Serial number lookup for the claim form's auto-fill and for the admin unit
// browser. Only ever returns a SOLD unit (an IN_STOCK one was never bought by
// anyone, so it has nothing to claim) together with the info the claim form
// needs to pre-fill and the warranty verdict.
async function findSoldUnitBySerial(serialNo) {
  const [rows] = await pool.query(
    `SELECT pu.unit_id, pu.serial_no, pu.status, pu.order_id, pu.order_detail_id, pu.warranty_expires_at,
            i.id AS product_id, i.name AS product_name, i.model AS product_model,
            o.order_date, o.user_id AS order_user_id, o.payment_status AS order_payment_status
     FROM Product_Units pu
     JOIN Inventory i ON i.id = pu.product_id
     JOIN Orders o ON o.order_id = pu.order_id
     WHERE pu.serial_no = ? AND pu.status = 'SOLD'`,
    [serialNo]
  );
  return rows[0] || null;
}

module.exports = { allocateSerials, releaseSerials, assignUnitsForOrder, findSoldUnitBySerial, defaultPrefix };
