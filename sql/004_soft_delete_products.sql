-- 004_soft_delete_products.sql
-- Run this once in phpMyAdmin (database it_std6730251069) using the "SQL" tab.
-- Safe / non-destructive: only ADDS a column with a default value. Nothing
-- existing is touched or deleted.
--
-- What this does:
--   Adds `is_active` to Inventory (1 = normal/visible, 0 = deleted/hidden).
--   Every existing row gets is_active = 1 automatically (DEFAULT 1), so
--   nothing currently in your shop disappears when you run this.
--
-- Why: deleting a product that was already ordered used to fail outright
-- (foreign key error), because Order_Details still points at it — deleting
-- the row for real would corrupt order history. Instead, "delete" now just
-- flips is_active to 0: the product disappears from the Admin Products page
-- and the User shop immediately, but every past order that included it still
-- shows the correct name/price, because the Inventory row never actually
-- goes away.

ALTER TABLE `Inventory` ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1;
