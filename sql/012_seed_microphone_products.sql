-- 012_seed_microphone_products.sql
-- Adds a "ไมโครโฟน" (Microphone) category with 2 wireless mics that pair
-- with Bluetooth/karaoke speakers — same pattern as
-- sql/010_seed_speaker_products.sql (RAND()-based "sale" pricing off a
-- realistic MSRP, so re-running this gives a slightly different sale price
-- each time). Run this once in phpMyAdmin's SQL tab.
--
-- serial_prefix is left NULL on purpose — the auto-generated prefix now
-- always includes the product's own id (see backend/services/productUnits.js),
-- so it can never collide with another product's prefix, unlike before.
--
-- image_url is left NULL — add a real product photo afterwards from the
-- admin Products page ("+ Add" / edit → Upload File).

INSERT INTO `Inventory`
  (`name`, `price`, `stock`, `category`, `image_url`, `description`, `model`, `warranty_months`, `serial_prefix`, `is_active`)
VALUES (
  'JBL PBM100 ไมโครโฟนไร้สายคาราโอเกะ',
  ROUND(2990 * (0.8 + RAND() * 0.15), -1), -- ~5-20% off the ฿2,990 MSRP
  FLOOR(15 + RAND() * 20),
  'ไมโครโฟน',
  NULL,
  'ไมโครโฟนไร้สาย JBL PBM100 จับคู่ผ่านบลูทูธกับลำโพง/ตู้ลำโพงคาราโอเกะ JBL ได้โดยตรง ไม่ต้องมีตัวรับสัญญาณแยก เสียงชัด หน่วงต่ำ แบตใช้งานต่อเนื่องได้นาน — ราคาพิเศษ ลดจากราคาปกติ ฿2,990',
  'PBM100',
  12,
  NULL,
  1
);

INSERT INTO `Inventory`
  (`name`, `price`, `stock`, `category`, `image_url`, `description`, `model`, `warranty_months`, `serial_prefix`, `is_active`)
VALUES (
  'Shure BLX288/PG58 ไมโครโฟนไร้สายคู่ระดับมืออาชีพ',
  ROUND(18900 * (0.75 + RAND() * 0.15), -1), -- ~10-25% off the ฿18,900 MSRP
  FLOOR(5 + RAND() * 10),
  'ไมโครโฟน',
  NULL,
  'ชุดไมโครโฟนไร้สายคู่ระดับมืออาชีพ Shure BLX288/PG58 พร้อมเครื่องรับสัญญาณ เชื่อมต่อกับลำโพง/มิกเซอร์ได้ทั้งสาย AUX และช่องไมค์มาตรฐาน เหมาะกับงานอีเวนต์และร้องคาราโอเกะระดับพรีเมียม — ราคาพิเศษ ลดจากราคาปกติ ฿18,900',
  'BLX288/PG58',
  12,
  NULL,
  1
);
