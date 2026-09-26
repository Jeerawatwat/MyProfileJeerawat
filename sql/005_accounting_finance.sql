-- 005_accounting_finance.sql
-- Run this once in phpMyAdmin (with the app's database selected) using the
-- "SQL" tab. Safe / non-destructive: only widens the Users.role ENUM, ADDS
-- columns with defaults to Orders, and CREATEs new tables. No existing row is
-- deleted, and every existing order keeps its current `status`.
--
-- What this does:
--   1. Adds the 'accounting' and 'manager' roles to Users.role and seeds one accounting login
--      (username `accounting`, password `accounting123` — change it after the
--      first login by UPDATE-ing the row with a fresh bcrypt hash).
--   2. Adds money fields to Orders:
--        payment_status — the FINANCIAL state, separate from the existing
--                         `status` (the fulfilment state: รอดำเนินการ ->
--                         กำลังจัดเตรียมสินค้า -> ...). Values:
--                         PENDING_PAYMENT, PAID_PENDING_VERIFICATION, PAID,
--                         PAYMENT_REJECTED, REFUNDED
--        shipping_fee / discount — default 0, so every existing order's
--                         total_amount (= items + shipping_fee - discount)
--                         is still exactly right.
--   3. Creates Payments, Refunds, Expenses, Audit_Logs.
--
-- Same constraints as the earlier scripts on this server:
--   * No FOREIGN KEY constraints (the DB user lacks REFERENCES, #1142) —
--     integrity is enforced in the backend inside transactions.
--   * Plain ADD COLUMN, no "IF NOT EXISTS" (#1064 on this server). If you get
--     "Duplicate column name ..." the column is already there — skip that line.
--
-- Existing orders all start as PENDING_PAYMENT, because the database has no
-- record of whether they were ever paid. See the note at the bottom if some
-- of them were in fact paid before this system existed.

-- 1) Accounting role -------------------------------------------------------
ALTER TABLE `Users`
  MODIFY `role` ENUM('admin','user','accounting','manager') NOT NULL DEFAULT 'user';

INSERT IGNORE INTO `Users` (`username`, `password`, `role`)
VALUES ('accounting', '$2a$10$MgdcoZx.Zpart122GNHsX.eCgQj50nilEygd.3QGSdjG6ZpQqxa7S', 'accounting');

-- 2) Orders money fields ---------------------------------------------------
ALTER TABLE `Orders` ADD COLUMN `payment_status` VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT';
ALTER TABLE `Orders` ADD COLUMN `shipping_fee` DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE `Orders` ADD COLUMN `discount` DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE `Orders` ADD KEY `idx_orders_payment_status` (`payment_status`);

-- 3) Payments — one row per slip submitted. A rejected slip keeps its row
-- (history), and the buyer submits a new one. The backend guarantees at most
-- ONE row per order is ever PAID_PENDING_VERIFICATION or PAID.
-- `amount` is a snapshot of Orders.total_amount at submission time.
-- `receipt_no` is assigned exactly once, when the payment is confirmed.
CREATE TABLE IF NOT EXISTS `Payments` (
  `payment_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `payment_method` VARCHAR(30) NOT NULL DEFAULT 'QR',
  `payment_status` VARCHAR(30) NOT NULL DEFAULT 'PAID_PENDING_VERIFICATION',
  `slip_path` VARCHAR(255) NOT NULL,
  `transaction_reference` VARCHAR(100) NULL,
  `paid_at` DATETIME NULL,
  `verified_by` INT NULL,
  `verified_at` DATETIME NULL,
  `rejected_reason` TEXT NULL,
  `receipt_no` VARCHAR(30) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  UNIQUE KEY `uq_payments_receipt_no` (`receipt_no`),
  KEY `idx_payments_order` (`order_id`),
  KEY `idx_payments_user` (`user_id`),
  KEY `idx_payments_status_verified` (`payment_status`, `verified_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 4) Refunds — requested by the buyer against a PAID payment. Counted in the
-- financial report from the moment it's approved (approved_at).
CREATE TABLE IF NOT EXISTS `Refunds` (
  `refund_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `payment_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `refund_amount` DECIMAL(12,2) NOT NULL,
  `reason` TEXT NOT NULL,
  `evidence_path` VARCHAR(255) NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'REFUND_REQUESTED',
  `rejected_reason` TEXT NULL,
  `approved_by` INT NULL,
  `approved_at` DATETIME NULL,
  `refunded_by` INT NULL,
  `refunded_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`refund_id`),
  KEY `idx_refunds_order` (`order_id`),
  KEY `idx_refunds_payment` (`payment_id`),
  KEY `idx_refunds_status_approved` (`status`, `approved_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 5) Expenses — entered by accounting.
-- category: PRODUCT_COST, ADVERTISING, SHIPPING, EQUIPMENT, OTHER
CREATE TABLE IF NOT EXISTS `Expenses` (
  `expense_id` INT NOT NULL AUTO_INCREMENT,
  `expense_date` DATE NOT NULL,
  `category` VARCHAR(30) NOT NULL,
  `description` VARCHAR(500) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `attachment_path` VARCHAR(255) NULL,
  `created_by` INT NOT NULL,
  `updated_by` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`expense_id`),
  KEY `idx_expenses_date` (`expense_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 6) Audit_Logs — append-only history of every important money action.
-- `username` is copied in on purpose so the log still reads correctly even if
-- the user row is renamed/removed later.
CREATE TABLE IF NOT EXISTS `Audit_Logs` (
  `log_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `username` VARCHAR(50) NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `entity_type` VARCHAR(30) NOT NULL,
  `entity_id` INT NULL,
  `details` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_audit_created` (`created_at`),
  KEY `idx_audit_entity` (`entity_type`, `entity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Note on orders placed BEFORE this script:
-- They are PENDING_PAYMENT, and the backend only lets an admin move an order
-- into กำลังจัดเตรียมสินค้า / จัดส่งแล้ว / สำเร็จ once it is PAID. Orders that
-- were already past รอดำเนินการ keep their status untouched. Buyers can still
-- pay an old pending order through the normal slip flow.
