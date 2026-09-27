-- 007_stock_role_and_inventory.sql
-- Run this in phpMyAdmin to add the 'stock' role and stock adjustment tracking table.

-- 1) Add 'stock' to Users.role ENUM
ALTER TABLE `Users`
  MODIFY `role` ENUM('admin','user','accounting','manager','delivery','stock') NOT NULL DEFAULT 'user';

-- 2) Seed default warehouse user (username: stock, password: stock123)
-- Uses the same bcrypt test hash as accounting ($2a$10$MgdcoZx.Zpart122GNHsX.eCgQj50nilEygd.3QGSdjG6ZpQqxa7S = accounting123/stock123)
INSERT IGNORE INTO `Users` (`username`, `password`, `role`)
VALUES ('stock', '$2a$10$MgdcoZx.Zpart122GNHsX.eCgQj50nilEygd.3QGSdjG6ZpQqxa7S', 'stock');

-- 3) Create Stock_Logs table for stock adjustment history
CREATE TABLE IF NOT EXISTS `Stock_Logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `product_id` INT NOT NULL,
  `change_amount` INT NOT NULL,
  `previous_stock` INT NOT NULL,
  `new_stock` INT NOT NULL,
  `reason` VARCHAR(255) NOT NULL,
  `note` TEXT NULL,
  `created_by` VARCHAR(50) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_stock_logs_product` (`product_id`),
  KEY `idx_stock_logs_date` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
