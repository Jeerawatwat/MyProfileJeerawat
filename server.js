require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const port = process.env.PORT || 3079;

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