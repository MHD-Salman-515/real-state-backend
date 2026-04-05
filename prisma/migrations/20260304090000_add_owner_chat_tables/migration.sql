CREATE TABLE IF NOT EXISTS `chat_sessions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `owner_id` INT NOT NULL,
  `title` VARCHAR(191) NULL,
  `status` ENUM('ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `chat_sessions_owner_id_idx`(`owner_id`),
  INDEX `chat_sessions_owner_id_updated_at_idx`(`owner_id`, `updated_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `chat_sessions_owner_id_fkey`
    FOREIGN KEY (`owner_id`) REFERENCES `User`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `session_id` INT NOT NULL,
  `role` ENUM('USER', 'ASSISTANT', 'TOOL') NOT NULL,
  `content` TEXT NOT NULL,
  `meta_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `chat_messages_session_id_idx`(`session_id`),
  INDEX `chat_messages_session_id_created_at_idx`(`session_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `chat_messages_session_id_fkey`
    FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
);
