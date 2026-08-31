-- 002_orders_and_description.sql
-- Run this once in phpMyAdmin (database it_std6730251069) using the "SQL" tab.
-- Safe / non-destructive: only ADDS a nullable column and ADDS two new tables.
-- Nothing in the existing Users or Inventory data is touched or deleted.
--
-- What this does:
--   1. Makes sure Users / Inventory use the InnoDB engine (required for the
--      foreign keys below to work). This is a no-op if they already are.
--   2. Adds a nullable `description` column to Inventory so products can show
--      a longer description on the User shop page (existing rows just get
--      description = NULL, nothing else changes).
--   3. Creates Orders + Order_Details, linked to the real Users and Inventory
--      tables with foreign keys, exactly per the 1:N / N:1 relationship the
--      spec describes:
--        Users (1) -> (N) Orders (1) -> (N) Order_Details (N) -> (1) Inventory

-- 1) Ensure InnoDB (needed for FOREIGN KEY support)
ALTER TABLE `Users` ENGINE=InnoDB;
ALTER TABLE `Inventory` ENGINE=InnoDB;

-- 2) Add description column to Inventory (nullable => existing rows unaffected)
-- NOTE: plain ADD COLUMN, no "IF NOT EXISTS" — this server's MySQL/MariaDB
-- version rejected that syntax (#1064). The column doesn't exist yet, so this
-- doesn't need to be conditional; only run this line again if you ever get
-- "Duplicate column name 'description'" (means it's already there — skip it).
ALTER TABLE `Inventory` ADD COLUMN `description` TEXT NULL;

-- 3) Orders — one row per checkout
CREATE TABLE IF NOT EXISTS `Orders` (
  `order_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `order_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `total_amount` DECIMAL(12,2) NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'รอดำเนินการ',
  PRIMARY KEY (`order_id`),
  KEY `idx_orders_user` (`user_id`),
  CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Order_Details — line items for each order
CREATE TABLE IF NOT EXISTS `Order_Details` (
  `order_detail_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `quantity` INT NOT NULL,
  `price` DECIMAL(12,2) NOT NULL,
  `subtotal` DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (`order_detail_id`),
  KEY `idx_orderdetails_order` (`order_id`),
  KEY `idx_orderdetails_product` (`product_id`),
  CONSTRAINT `fk_orderdetails_order` FOREIGN KEY (`order_id`) REFERENCES `Orders` (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_orderdetails_product` FOREIGN KEY (`product_id`) REFERENCES `Inventory` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Notes:
-- * `status` starts as the Thai label 'รอดำเนินการ' (pending) to match what
--   the app's status list uses: รอดำเนินการ, กำลังจัดเตรียมสินค้า, จัดส่งแล้ว,
--   สำเร็จ, ยกเลิก.
-- * If table creation fails with an errno 150 (foreign key constraint
--   incorrectly formed), it almost always means Users.id or Inventory.id is
--   not exactly INT — open Structure on those tables and confirm the id
--   column type, then adjust user_id/product_id above to match before re-running.
