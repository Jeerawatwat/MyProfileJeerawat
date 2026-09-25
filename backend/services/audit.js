// backend/services/audit.js
// Appends one row to Audit_Logs. Pass the transaction's `conn` when the action
// being logged runs in a transaction, so the log row commits (or rolls back)
// together with the change it describes — a confirmed payment can never exist
// without its log line, and a failed one never leaves a misleading log line.
const { pool } = require('../config/db');

// Every action name the app writes — kept in one list so the audit screen and
// any future filtering have a single source of truth.
const AUDIT_ACTIONS = {
  CONFIRM_PAYMENT: 'CONFIRM_PAYMENT',
  REJECT_PAYMENT: 'REJECT_PAYMENT',
  APPROVE_REFUND: 'APPROVE_REFUND',
  REJECT_REFUND: 'REJECT_REFUND',
  MARK_REFUNDED: 'MARK_REFUNDED',
  CREATE_EXPENSE: 'CREATE_EXPENSE',
  EDIT_EXPENSE: 'EDIT_EXPENSE',
  DELETE_EXPENSE: 'DELETE_EXPENSE',
  EXPORT_FINANCIAL_REPORT: 'EXPORT_FINANCIAL_REPORT',
};

async function logAudit(conn, user, action, entityType, entityId, details) {
  const db = conn || pool;
  await db.query(
    'INSERT INTO Audit_Logs (user_id, username, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
    [user.id, user.username, action, entityType, entityId ?? null, details ? JSON.stringify(details) : null]
  );
}

module.exports = { logAudit, AUDIT_ACTIONS };
