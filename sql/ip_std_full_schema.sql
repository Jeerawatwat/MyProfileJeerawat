-- ip_std_full_schema.sql
-- Run this once in phpMyAdmin, with database `ip_std6730251069` selected,
-- using the "SQL" tab. Creates every table this app needs from scratch —
-- equivalent to the original Users/Inventory tables plus everything added by
-- sql/002_orders_and_description.sql, sql/003_order_cancel_reason.sql and
-- sql/004_soft_delete_products.sql, combined into one script because
-- ip_std6730251069 starts empty (no base Users/Inventory tables to ALTER).
--
-- No FOREIGN KEY constraints: the `std6730251069` DB user has CREATE/INSERT
-- on ip_std6730251069 but not REFERENCES, so any `CONSTRAINT ... FOREIGN KEY`
-- here fails with "#1142 REFERENCES command denied". Plain KEY indexes are
-- kept for query performance; referential integrity (an Order_Details row
-- always pointing at a real Order/Inventory row) is instead enforced by the
-- backend itself — see the transaction in products.routes.js's DELETE /:id,
-- which manually removes Order_Details/Orders rows in the right order before
-- removing the Inventory row, exactly what the FK's ON DELETE CASCADE used
-- to do automatically on it_std6730251069.
--
-- All CREATE TABLEs use IF NOT EXISTS, so this is safe to re-run — e.g. after
-- the first run got as far as Inventory/Users before failing.

CREATE TABLE IF NOT EXISTS `Users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('admin','user') NOT NULL DEFAULT 'user',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `Inventory` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `price` DECIMAL(12,2) NOT NULL,
  `stock` INT NOT NULL DEFAULT 0,
  `category` VARCHAR(100) NOT NULL,
  `image_url` VARCHAR(500) NULL,
  `description` TEXT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `Orders` (
  `order_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `order_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `total_amount` DECIMAL(12,2) NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'รอดำเนินการ',
  `cancel_reason` TEXT NULL,
  PRIMARY KEY (`order_id`),
  KEY `idx_orders_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `Order_Details` (
  `order_detail_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `quantity` INT NOT NULL,
  `price` DECIMAL(12,2) NOT NULL,
  `subtotal` DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (`order_detail_id`),
  KEY `idx_orderdetails_order` (`order_id`),
  KEY `idx_orderdetails_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Seed one admin login so you can sign into the app right after this runs —
-- username `admin`, password `admin123`. Log in once and change it, or just
-- UPDATE this row's password later with a fresh bcrypt hash. INSERT IGNORE
-- so re-running this script after the username already exists is a no-op
-- instead of a duplicate-key error.
INSERT IGNORE INTO `Users` (`username`, `password`, `role`)
VALUES ('admin', '$2a$10$WpwymIdlnF9jDqrbd1pX9OBjDkXp9ckBWT751X/ARaVbkBidC6mvO', 'admin');
