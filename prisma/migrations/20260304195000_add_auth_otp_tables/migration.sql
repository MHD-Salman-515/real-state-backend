ALTER TABLE `User`
  ADD COLUMN `email_verified_at` DATETIME(3) NULL;

CREATE TABLE `email_otp` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(191) NOT NULL,
  `user_id` INT NULL,
  `code_hash` VARCHAR(128) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `max_attempts` INT NOT NULL DEFAULT 5,
  `last_sent_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `consumed_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `email_otp_email_idx` (`email`),
  INDEX `email_otp_expires_at_idx` (`expires_at`),
  INDEX `email_otp_created_at_idx` (`created_at`),
  CONSTRAINT `email_otp_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `User` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `refresh_tokens` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `token_hash` VARCHAR(128) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `revoked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `refresh_tokens_user_id_idx` (`user_id`),
  INDEX `refresh_tokens_expires_at_idx` (`expires_at`),
  INDEX `refresh_tokens_created_at_idx` (`created_at`),
  CONSTRAINT `refresh_tokens_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `User` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
