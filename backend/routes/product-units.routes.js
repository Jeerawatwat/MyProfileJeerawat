// backend/routes/product-units.routes.js
// Serial Number lookup — powers the claim form's auto-fill (spec point 3:
// type a Product ID/Serial, the form fills itself in) and the in-warranty
// check (spec point 9). Login required (see sql/009_product_claims.sql's
// header): a "user" may only look up a serial that belongs to one of their
// OWN orders — this never lets a signed-in shopper pull another customer's
// purchase history just by guessing a serial number.
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { findSoldUnitBySerial } = require('../services/productUnits');

const router = express.Router();

router.use(requireAuth);

// GET /api/product-units/:serial
router.get('/:serial', async (req, res, next) => {
  try {
    const serial = String(req.params.serial || '').trim();
    if (!serial) return res.status(400).json({ error: 'กรุณาระบุ Product ID / Serial Number' });

    const unit = await findSoldUnitBySerial(serial);
    const canSee = unit && (req.user.role === 'admin' || unit.order_user_id === req.user.id);
    if (!canSee) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลสินค้านี้ กรุณาตรวจสอบ Product ID หรือ Serial Number' });
    }

    const inWarranty = !!unit.warranty_expires_at && new Date(unit.warranty_expires_at) >= new Date(new Date().toDateString());

    const [previousClaims] = await pool.query(
      'SELECT claim_no, status, created_at FROM Claims WHERE unit_id = ? ORDER BY created_at DESC',
      [unit.unit_id]
    );

    res.json({
      unit_id: unit.unit_id,
      serial_no: unit.serial_no,
      order_id: unit.order_id,
      order_detail_id: unit.order_detail_id,
      product_id: unit.product_id,
      product_name: unit.product_name,
      product_model: unit.product_model,
      purchased_at: unit.order_date,
      warranty_expires_at: unit.warranty_expires_at,
      in_warranty: inWarranty,
      previous_claims: previousClaims,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
