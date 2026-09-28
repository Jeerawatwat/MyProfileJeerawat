-- Rollback for 013_refund_bank_and_transfer_proof.sql
ALTER TABLE `Refunds`
  DROP COLUMN `bank_name`,
  DROP COLUMN `bank_account_number`,
  DROP COLUMN `bank_account_name`,
  DROP COLUMN `transfer_slip_path`;
