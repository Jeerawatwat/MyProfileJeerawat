-- Rollback for 014_product_promotions.sql
-- Restore any products currently on sale to their normal price first, so no
-- discounted price is left stranded once the column disappears.
UPDATE `Inventory` SET `price` = `original_price` WHERE `original_price` IS NOT NULL;
ALTER TABLE `Inventory` DROP COLUMN `original_price`;
