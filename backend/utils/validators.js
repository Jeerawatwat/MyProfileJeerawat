// backend/utils/validators.js
// Shared, dependency-free validation used by both create and update product routes.
function validateProductInput(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  if (!partial || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) errors.push('Product name is required');
    data.name = name;
  }

  if (!partial || body.category !== undefined) {
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    if (!category) errors.push('Category is required');
    data.category = category;
  }

  if (!partial || body.price !== undefined) {
    const price = Number(body.price);
    if (Number.isNaN(price) || price < 0) errors.push('Price must be a non-negative number');
    data.price = price;
  }

  if (!partial || body.stock !== undefined) {
    const stock = Number(body.stock);
    if (!Number.isInteger(stock) || stock < 0) errors.push('Stock must be a non-negative integer');
    data.stock = stock;
  }

  if (!partial || body.image_url !== undefined) {
    const raw = typeof body.image_url === 'string' ? body.image_url.trim() : '';
    // Optional field — empty is fine (no photo). When present, it just needs
    // to look like an http(s) URL or a path our own /uploads route returned.
    if (raw && !/^(https?:\/\/|\/uploads\/)/i.test(raw)) {
      errors.push('Image must be a valid http(s) URL or an uploaded file');
    }
    data.image_url = raw || null;
  }

  if (!partial || body.description !== undefined) {
    // Optional free-text description shown to shoppers on the User side.
    const raw = typeof body.description === 'string' ? body.description.trim() : '';
    if (raw.length > 4000) errors.push('Description must be 4000 characters or fewer');
    data.description = raw || null;
  }

  // ---- Warranty claim fields (sql/009_product_claims.sql) ----
  if (!partial || body.model !== undefined) {
    // Optional "รุ่นสินค้า" shown on the claim form/PDF — distinct from the
    // free-text product name (e.g. name "Bluetooth Speaker X1", model "X1").
    const raw = typeof body.model === 'string' ? body.model.trim() : '';
    if (raw.length > 120) errors.push('Model must be 120 characters or fewer');
    data.model = raw || null;
  }

  if (!partial || body.warranty_months !== undefined) {
    // Only affects units sold AFTER this is set (see productUnits.js) —
    // never rewrites the warranty on units already assigned to an order.
    const raw = body.warranty_months;
    const months = raw === undefined || raw === null || raw === '' ? 12 : Number(raw);
    if (!Number.isInteger(months) || months < 0 || months > 120) {
      errors.push('Warranty months must be a whole number from 0 to 120');
    }
    data.warranty_months = Number.isInteger(months) ? months : 12;
  }

  if (!partial || body.serial_prefix !== undefined) {
    // Optional — leave blank to auto-generate one from the product id
    // instead (see defaultPrefix() in productUnits.js). When set, it must be
    // short, uppercase letters/digits only, and unique across products (the
    // route checks uniqueness; Inventory.uq_inventory_serial_prefix backs it
    // up at the DB level too).
    const raw = typeof body.serial_prefix === 'string' ? body.serial_prefix.trim().toUpperCase() : '';
    if (raw && !/^[A-Z0-9]{2,10}$/.test(raw)) {
      errors.push('Serial prefix must be 2-10 letters/digits (A-Z, 0-9)');
    }
    data.serial_prefix = raw || null;
  }

  return { errors, data };
}

// Username/password rules shared by register (and available for future use by
// an admin "create user" flow). Kept intentionally simple and dependency-free.
function validateCredentials({ username, password }) {
  const errors = [];
  const cleanUsername = typeof username === 'string' ? username.trim() : '';

  if (!cleanUsername) {
    errors.push('Username is required');
  } else if (cleanUsername.length < 3 || cleanUsername.length > 50) {
    errors.push('Username must be between 3 and 50 characters');
  } else if (!/^[a-zA-Z0-9_.]+$/.test(cleanUsername)) {
    errors.push('Username may only contain letters, numbers, underscore, and dot');
  }

  if (typeof password !== 'string' || password.length < 6) {
    errors.push('Password must be at least 6 characters');
  }

  return { errors, username: cleanUsername };
}

module.exports = { validateProductInput, validateCredentials };
