// backend/config/db.js
// MySQL connection pool. All credentials come from environment variables (.env) —
// never hard-code them here. This file is the single place the app talks to MySQL,
// reusing the pool that already existed in the original server.js.
require('dotenv').config();
const mysql = require('mysql2/promise');

const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length) {
  // Fail loudly on the server log, but never leak which secrets are set to the client.
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+07:00',
  charset: 'utf8mb4_general_ci',
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('Connected to MySQL Database:', process.env.DB_NAME);
    conn.release();
    return true;
  } catch (err) {
    // Log full detail server-side only; callers should surface a generic message.
    console.error('MySQL Connection Failed:', err.message);
    return false;
  }
}

module.exports = { pool, testConnection };
