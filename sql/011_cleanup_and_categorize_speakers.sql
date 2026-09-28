-- 011_cleanup_and_categorize_speakers.sql
-- Cleans up the old demo/test catalog (coffee items, "fsf"/"fsdf" test
-- products, etc.) so the shop is speaker-only, and splits the two seed
-- speakers (sql/010_seed_speaker_products.sql) into their own brand
-- categories so the category filter becomes "ทั้งหมด / JBL / Marshall"
-- automatically (categories.routes.js derives the filter chips straight
-- from Inventory.category — no frontend change needed for this).
--
-- Run this ONCE in phpMyAdmin's SQL tab, after sql/010_seed_speaker_products.sql.
--
-- Safety rule (same one products.routes.js's own DELETE /:id already
-- enforces): a product that was ever part of a PAID/attempted order has
-- real Payments/Refunds/Claims history pointing at it — deleting it would
-- corrupt that history (e.g. it would break the CLM-20260927-000001 test
-- claim if that's the product it was filed against). Products like that are
-- only HIDDEN here (is_active = 0), never deleted. Only products with
-- ZERO order history anywhere are actually removed.
--
-- Literal model names used directly (no SET @variable) — some MySQL setups
-- give session user-variables a different default collation than the
-- table's columns, which throws #1267 "Illegal mix of collations" on
-- `column = @variable`; plain `column = 'literal'` doesn't have that problem.
-- Adjust the two literals below first if your JBL/Marshall rows ended up
-- with different `model` values than sql/010's.

-- 1) Re-categorize the two seed speakers by brand.
UPDATE `Inventory` SET `category` = 'JBL' WHERE `model` = 'Flip 6';
UPDATE `Inventory` SET `category` = 'Marshall' WHERE `model` = 'Emberton II';

-- 2) Hard-delete every OTHER product that has NEVER appeared in a single
-- order (completely safe — nothing else in the database can reference it).
DELETE FROM `Product_Units`
WHERE `product_id` IN (
  SELECT id FROM (
    SELECT i.id FROM `Inventory` i
    WHERE (i.model IS NULL OR i.model NOT IN ('Flip 6', 'Emberton II'))
      AND i.id NOT IN (SELECT DISTINCT product_id FROM `Order_Details`)
  ) AS never_ordered
);

DELETE FROM `Inventory`
WHERE (`model` IS NULL OR `model` NOT IN ('Flip 6', 'Emberton II'))
  AND `id` NOT IN (SELECT DISTINCT product_id FROM `Order_Details`);

-- 3) Everything left over that isn't a speaker WAS part of a real order (or
-- step 2 would have removed it) — hide it from the shop/admin list instead
-- of deleting it, so old order/claim history still reads correctly.
UPDATE `Inventory`
SET `is_active` = 0
WHERE `model` IS NULL OR `model` NOT IN ('Flip 6', 'Emberton II');
