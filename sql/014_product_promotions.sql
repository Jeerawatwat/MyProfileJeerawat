-- 014_product_promotions.sql
-- Real (checkout-honored) random promotions. `original_price` holds the
-- pre-discount price while a product is on sale; `price` itself is lowered
-- for real, so the discount is exactly what the customer pays at checkout —
-- never just a display trick. NULL means the product isn't on sale.
ALTER TABLE `Inventory`
  ADD COLUMN `original_price` DECIMAL(12,2) NULL AFTER `price`;
