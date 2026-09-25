// backend/utils/transaction.js
// Runs `fn(conn)` inside one MySQL transaction — commit if it resolves, roll
// back if it throws. Same begin/commit/rollback/release dance the existing
// routes (orders.routes.js) write out by hand, pulled into one place for the
// finance routes, which do it on almost every write.
//
// To bail out with a specific HTTP error from inside `fn`, throw
// httpError(status, message) — the transaction rolls back and the route's
// catch passes it to errorHandler, which sends `message` to the client.
const { pool } = require('../config/db');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}

async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // ignore rollback failure — the original error is what matters
    }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { withTransaction, httpError };
