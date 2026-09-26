-- sql/008_stock_logs_trigger.sql
-- Trigger to automatically record every stock change into Stock_Logs
-- Run this in phpMyAdmin (Database: ip_std6730251069 -> SQL tab)

DELIMITER $$

DROP TRIGGER IF EXISTS `trg_inventory_stock_logs`$$

CREATE TRIGGER `trg_inventory_stock_logs`
AFTER UPDATE ON `Inventory`
FOR EACH ROW
BEGIN
  IF OLD.stock <> NEW.stock THEN
    INSERT INTO `Stock_Logs` (
      `product_id`,
      `change_amount`,
      `previous_stock`,
      `new_stock`,
      `reason`,
      `note`,
      `created_by`,
      `created_at`
    ) VALUES (
      NEW.id,
      NEW.stock - OLD.stock,
      OLD.stock,
      NEW.stock,
      IF(NEW.stock > OLD.stock, 'รับสินค้าเข้าคลัง (PO Inbound)', 'ตัดจ่าย/เบิกออกคลัง'),
      NULL,
      'stock',
      NOW()
    );
  END IF;
END$$

DELIMITER ;
