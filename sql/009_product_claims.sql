-- 009_product_claims.sql
-- Run this once in phpMyAdmin (with the app's database selected) using the
-- "SQL" tab, THEN run `node backend/scripts/backfill-product-units.js` once
-- from the server (see that file's header comment) to give every unit
-- already sold before this feature existed a Serial Number too, so old
-- orders can still be claimed.
--
-- Numbered 009 because 006/007/008 are already taken by the delivery/stock
-- role migrations (sql/006_delivery_role.sql, sql/007_stock_role_and_inventory.sql,
-- sql/008_stock_logs_trigger.sql) — this file is independent of those and can
-- be run before or after them, in any order.
--
-- Safe / non-destructive: only ADDs columns with defaults to Inventory, and
-- CREATEs new tables. No existing row is deleted or changed.
--
-- Same constraints as the earlier scripts on this server:
--   * No FOREIGN KEY constraints (the DB user lacks REFERENCES, #1142) —
--     integrity is enforced in the backend inside transactions, exactly like
--     Payments/Refunds/Expenses in sql/005_accounting_finance.sql.
--   * Plain ADD COLUMN, no "IF NOT EXISTS" (#1064 on this server). If you get
--     "Duplicate column name ..." the column is already there — skip that line.
--
-- What this does:
--   1. Adds warranty/serial fields to Inventory:
--        model          — "รุ่นสินค้า" shown on the claim form/PDF (optional)
--        warranty_months — how many months a NEWLY sold unit of this product
--                          is covered for (default 12). Changing it later only
--                          affects units sold after the change.
--        serial_prefix  — optional custom prefix for this product's Serial
--                          Numbers (e.g. "SPK"). Leave blank to auto-generate
--                          one from the product id instead. Must be unique.
--        next_unit_seq  — internal counter used to hand out the next Serial
--                          Number for this product (SPK-000001, SPK-000002, …).
--                          Never edit this by hand.
--   2. Creates Product_Units — one row per PHYSICAL unit of a product ("สินค้า
--      รายชิ้น"), separate from Inventory.stock (which stays a plain count,
--      exactly as before — checkout is unaffected by this table, and so is
--      the delivery/stock role work in sql/006-008).
--        status: IN_STOCK (not sold yet) -> SOLD (assigned to an order, once
--        the order reaches "จัดส่งแล้ว"/"สำเร็จ" — see orders.routes.js).
--   3. Creates Claims, Claim_Attachments, Claim_Status_History. Claims are
--      handled by the 'admin' role (product condition is an admin/fulfilment
--      concern here, same as it already owns DELETE/POST on Inventory) — not
--      by 'manager', 'stock' or 'delivery'.

-- 1) Inventory: warranty + serial fields ------------------------------------
ALTER TABLE `Inventory` ADD COLUMN `model` VARCHAR(120) NULL;
ALTER TABLE `Inventory` ADD COLUMN `warranty_months` INT NOT NULL DEFAULT 12;
ALTER TABLE `Inventory` ADD COLUMN `serial_prefix` VARCHAR(20) NULL;
ALTER TABLE `Inventory` ADD COLUMN `next_unit_seq` INT NOT NULL DEFAULT 1;
ALTER TABLE `Inventory` ADD UNIQUE KEY `uq_inventory_serial_prefix` (`serial_prefix`);

-- 2) Product_Units — สินค้ารายชิ้น (Serial Number) ---------------------------
CREATE TABLE IF NOT EXISTS `Product_Units` (
  `unit_id` INT NOT NULL AUTO_INCREMENT,
  `product_id` INT NOT NULL,
  `serial_no` VARCHAR(60) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'IN_STOCK',
  `order_id` INT NULL,
  `order_detail_id` INT NULL,
  `sold_at` DATETIME NULL,
  `warranty_expires_at` DATE NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`unit_id`),
  UNIQUE KEY `uq_units_serial` (`serial_no`),
  KEY `idx_units_product_status` (`product_id`, `status`),
  KEY `idx_units_order` (`order_id`),
  KEY `idx_units_order_detail` (`order_detail_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3) Claims -------------------------------------------------------------
-- product_name_snapshot/product_model/purchased_at/serial_no_snapshot are
-- copied in at claim time (same reasoning as Audit_Logs.username) so a claim
-- still reads correctly even if the product is later renamed or removed.
-- status flow: PENDING_REVIEW -> INSPECTING -> APPROVED -> REPAIRING /
--   SHIPPING_REPLACEMENT -> COMPLETED   (or -> REJECTED from PENDING_REVIEW /
--   INSPECTING). resolution_type is set together with APPROVED: REPAIR,
--   REPLACEMENT, or REFUND — REFUND creates a normal row in Refunds (still
--   goes through accounting's own approve/reject/mark-refunded, unchanged).
CREATE TABLE IF NOT EXISTS `Claims` (
  `claim_id` INT NOT NULL AUTO_INCREMENT,
  `claim_no` VARCHAR(30) NULL,
  `order_id` INT NOT NULL,
  `order_detail_id` INT NOT NULL,
  `unit_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `customer_user_id` INT NOT NULL,
  `customer_name` VARCHAR(255) NOT NULL,
  `customer_phone` VARCHAR(30) NOT NULL,
  `product_name_snapshot` VARCHAR(255) NOT NULL,
  `product_model` VARCHAR(120) NULL,
  `serial_no_snapshot` VARCHAR(60) NOT NULL,
  `purchased_at` DATE NOT NULL,
  `claim_component` VARCHAR(50) NOT NULL,
  `issue_type` VARCHAR(50) NOT NULL,
  `issue_detail` TEXT NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW',
  `resolution_type` VARCHAR(20) NULL,
  `staff_note` TEXT NULL,
  `rejected_reason` TEXT NULL,
  `linked_refund_id` INT NULL,
  `handled_by` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`claim_id`),
  UNIQUE KEY `uq_claims_claim_no` (`claim_no`),
  KEY `idx_claims_order` (`order_id`),
  KEY `idx_claims_unit` (`unit_id`),
  KEY `idx_claims_customer` (`customer_user_id`),
  KEY `idx_claims_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 4) Claim_Attachments — evidence (from the customer) and inspection-result
-- photos (from the admin), both stored in private_uploads/claims/.
CREATE TABLE IF NOT EXISTS `Claim_Attachments` (
  `attachment_id` INT NOT NULL AUTO_INCREMENT,
  `claim_id` INT NOT NULL,
  `kind` VARCHAR(20) NOT NULL,
  `file_path` VARCHAR(255) NOT NULL,
  `uploaded_by` INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`attachment_id`),
  KEY `idx_attachments_claim` (`claim_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 5) Claim_Status_History — every status change, used to render the
-- customer-facing timeline (ส่งคำขอเคลม -> รอตรวจสอบ -> ... -> เคลมเสร็จสิ้น).
CREATE TABLE IF NOT EXISTS `Claim_Status_History` (
  `history_id` INT NOT NULL AUTO_INCREMENT,
  `claim_id` INT NOT NULL,
  `status` VARCHAR(30) NOT NULL,
  `note` TEXT NULL,
  `changed_by` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`history_id`),
  KEY `idx_claim_history_claim` (`claim_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
