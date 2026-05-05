-- Add AGENT value to the Role enum on the User table
ALTER TABLE `User`
  MODIFY COLUMN `role` ENUM('ADMIN', 'ACCOUNTANT', 'AGENT', 'CLIENT', 'OWNER', 'SUPPLIER', 'WORKER') NOT NULL DEFAULT 'CLIENT';
