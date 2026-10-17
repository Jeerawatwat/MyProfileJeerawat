-- 015_claims_shipping_address.sql
-- Adds a `shipping_address` column to Claims so customers can enter a
-- return-shipping address when filing a claim. The column is nullable because
-- existing claims were filed before this column existed; new claims will store
-- the address the customer types in the claim form.
--
-- Safe / non-destructive: only ADDs a nullable column with no default.
-- If you get "Duplicate column name `shipping_address`" the column already
-- exists — skip this line.

ALTER TABLE `Claims`
  ADD COLUMN `shipping_address` TEXT NULL
  AFTER `customer_phone`;
