-- 013_refund_bank_and_transfer_proof.sql
-- Refunds: capture the customer's bank details when they request a refund,
-- and require accounting to attach proof once the money has actually been
-- transferred back.
ALTER TABLE `Refunds`
  ADD COLUMN `bank_name` VARCHAR(100) NULL AFTER `evidence_path`,
  ADD COLUMN `bank_account_number` VARCHAR(50) NULL AFTER `bank_name`,
  ADD COLUMN `bank_account_name` VARCHAR(150) NULL AFTER `bank_account_number`,
  ADD COLUMN `transfer_slip_path` VARCHAR(255) NULL AFTER `bank_account_name`;
