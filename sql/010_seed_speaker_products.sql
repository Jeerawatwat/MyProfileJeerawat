-- 010_seed_speaker_products.sql
-- Adds 2 starter products to the "ลำโพง" (Speaker) category — JBL and
-- Marshall — each priced as a "sale" (a random discount off a realistic
-- MSRP, computed with RAND() so re-running this on a fresh database gives a
-- slightly different sale price each time, exactly like a real flash sale).
-- Run this once in phpMyAdmin's "SQL" tab, same as the other sql/ files.
--
-- Requires sql/009_product_claims.sql to have already been run (this uses
-- the model/warranty_months/serial_prefix columns it adds to Inventory).
-- Safe to run more than once — each run just adds two more rows (there's no
-- uniqueness constraint on product name), so only run it again if you
-- actually want more seed rows.
--
-- image_url is left NULL — add a real product photo afterwards from the
-- admin Products page ("+ Add" / edit → Upload File), the same way any other
-- product's photo is added; no placeholder image URL is invented here.

INSERT INTO `Inventory`
  (`name`, `price`, `stock`, `category`, `image_url`, `description`, `model`, `warranty_months`, `serial_prefix`, `is_active`)
VALUES (
  'JBL Flip 6 ลำโพงบลูทูธกันน้ำ',
  ROUND(4990 * (0.75 + RAND() * 0.15), -1), -- ~25% off the ฿4,990 MSRP, randomized a bit
  FLOOR(10 + RAND() * 20),
  'ลำโพง',
  NULL,
  'ลำโพงบลูทูธพกพา JBL Flip 6 เสียงหนักแน่น กันน้ำกันฝุ่นระดับ IP67 แบตเตอรี่ใช้งานได้นานสูงสุด 12 ชั่วโมง — ราคาพิเศษ ลดจากราคาปกติ ฿4,990',
  'Flip 6',
  12,
  'JBL',
  1
);

INSERT INTO `Inventory`
  (`name`, `price`, `stock`, `category`, `image_url`, `description`, `model`, `warranty_months`, `serial_prefix`, `is_active`)
VALUES (
  'Marshall Emberton II ลำโพงบลูทูธสไตล์วินเทจ',
  ROUND(9990 * (0.7 + RAND() * 0.2), -1), -- ~20-30% off the ฿9,990 MSRP, randomized a bit
  FLOOR(8 + RAND() * 15),
  'ลำโพง',
  NULL,
  'ลำโพงบลูทูธ Marshall Emberton II ดีไซน์วินเทจสไตล์ Marshall แท้ เสียงระดับพรีเมียม กันน้ำกันฝุ่นระดับ IP67 — ราคาพิเศษ ลดจากราคาปกติ ฿9,990',
  'Emberton II',
  12,
  'MARSHALL',
  1
);
