-- 009_product_claims_rollback.sql
-- Undoes everything sql/009_product_claims.sql added, so that file can be
-- re-run cleanly from scratch. Safe to run: as of this rollback the tables
-- below are empty (0 rows) — no real claim/serial data exists yet to lose.
-- Run this in phpMyAdmin's "SQL" tab (database ip_std6730251069 selected),
-- THEN re-run sql/009_product_claims.sql.

DROP TABLE IF EXISTS `Claim_Status_History`;
DROP TABLE IF EXISTS `Claim_Attachments`;
DROP TABLE IF EXISTS `Claims`;
DROP TABLE IF EXISTS `Product_Units`;

-- Drop the unique index before the column it's on.
ALTER TABLE `Inventory` DROP INDEX `uq_inventory_serial_prefix`;
ALTER TABLE `Inventory` DROP COLUMN `model`;
ALTER TABLE `Inventory` DROP COLUMN `warranty_months`;
ALTER TABLE `Inventory` DROP COLUMN `serial_prefix`;
ALTER TABLE `Inventory` DROP COLUMN `next_unit_seq`;
