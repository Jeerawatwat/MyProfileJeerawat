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

  return { errors, data };
}

module.exports = { validateProductInput };
