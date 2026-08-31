// server.js — Express API entrypoint.
// Kept at the project root (same place the original server.js lived) so the
// existing `npm start` / `node server.js` workflow keeps working.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const { pool, testConnection } = require('./backend/config/db');
const { notFoundHandler, errorHandler } = require('./backend/middleware/errorHandler');
const { requireAuth } = require('./backend/middleware/auth');

const authRoutes = require('./backend/routes/auth.routes');
const productsRoutes = require('./backend/routes/products.routes');
const categoriesRoutes = require('./backend/routes/categories.routes');
const dashboardRoutes = require('./backend/routes/dashboard.routes');
const uploadsRoutes = require('./backend/routes/uploads.routes');
const ordersRoutes = require('./backend/routes/orders.routes');

const app = express();
const port = process.env.PORT || 3079;

// Where uploaded product photos land — created on boot if it doesn't exist yet.
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Health check — safe to leave public.
app.get('/api', (req, res) => {
  res.send('API is running');
});

// Serves uploaded product photos back out over plain HTTP — this is public
// by design (the same way the pasted external image URLs are public), no
// auth/DB data lives in this folder.
app.use('/uploads', express.static(UPLOAD_DIR));

app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/orders', ordersRoutes);

// Legacy endpoint kept for backwards compatibility with the original server.js.
// It now requires auth (it used to be public), because it returns the same real
// inventory data that /api/products protects — an open, unauthenticated read of
// the whole inventory table was a real security gap worth closing.
app.get('/api/inventory', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, name, price, stock, category, image_url FROM Inventory');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

testConnection();

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
});
