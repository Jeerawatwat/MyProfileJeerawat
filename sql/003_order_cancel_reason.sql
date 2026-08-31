-- 003_order_cancel_reason.sql
-- Run this once in phpMyAdmin (database it_std6730251069) using the "SQL" tab.
-- Safe / non-destructive: only ADDS a nullable column to Orders. Nothing
-- existing is touched or deleted.
--
-- What this does:
--   Adds `cancel_reason` to Orders so that when an admin cancels an order,
--   the reason they typed can be stored and shown to the buyer on their
--   "My Orders" page. Existing rows just get cancel_reason = NULL.
--
-- NOTE: plain ADD COLUMN, no "IF NOT EXISTS" — this server's MySQL/MariaDB
-- version rejected that syntax before (#1064). Only run this again if you
-- get "Duplicate column name 'cancel_reason'" (means it's already there —
-- skip it, nothing more to do).

ALTER TABLE `Orders` ADD COLUMN `cancel_reason` TEXT NULL;
