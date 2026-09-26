-- 006_delivery_role.sql
-- Run this in phpMyAdmin if the 'delivery' role is not yet added to Users.role ENUM.
-- Widens the Users.role ENUM to include 'delivery' and creates an optional initial delivery account.

ALTER TABLE `Users`
  MODIFY `role` ENUM('admin','user','accounting','manager','delivery') NOT NULL DEFAULT 'user';

-- Default sample delivery user (password: delivery123)
-- bcrypt hash for 'delivery123': $2a$10$7vN34kP8i4VfR9qIeP953.hW5G4u3C18jU20bB1F4X1D5A6e4f3a2
INSERT IGNORE INTO `Users` (`username`, `password`, `role`)
VALUES ('delivery', '$2a$10$MgdcoZx.Zpart122GNHsX.eCgQj50nilEygd.3QGSdjG6ZpQqxa7S', 'delivery');
