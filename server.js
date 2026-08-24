<<<<<<< HEAD
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
=======
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
>>>>>>> bd44bbed68bd75eeb6040c36cf1ed18819af8790

const app = express();
const port = process.env.PORT || 3079;

<<<<<<< HEAD
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
=======
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// สร้าง การเชื่อมต่อกับ MySQL Database
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: "+07:00"
});

// ตรวจสอบการเชื่อมต่อ Database
(async function testMySQL() {
    try {
        const conn = await pool.getConnection();
        console.log('Connected to MySQL Database:', process.env.DB_NAME);
        conn.release();
    } catch(err) {
        console.error('MySQL Connection Failed:', err.message);
    }
})();

// API ดึงข้อมูลตาราง Inventory
app.get('/api/inventory', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Inventory');
        res.json(rows);
    } catch (error) {
        console.error('Fetch Inventory Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});

// Route เช็คสถานะ API
app.get('/api', (req, res) => {
    res.send("API is running");
});

// เริ่มทำงาน Server
app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
});
>>>>>>> bd44bbed68bd75eeb6040c36cf1ed18819af8790
