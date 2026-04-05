CREATE TABLE IF NOT EXISTS `buyer_chat_sessions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `buyer_id` INT NOT NULL,
  `title` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `buyer_chat_sessions_buyer_id_idx`(`buyer_id`),
  INDEX `buyer_chat_sessions_buyer_id_created_at_idx`(`buyer_id`, `created_at`),
  CONSTRAINT `buyer_chat_sessions_buyer_id_fkey`
    FOREIGN KEY (`buyer_id`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `buyer_chat_messages` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `session_id` INT NOT NULL,
  `role` ENUM('USER', 'ASSISTANT') NOT NULL,
  `content` TEXT NOT NULL,
  `intent` VARCHAR(64) NULL,
  `payload_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `buyer_chat_messages_session_id_idx`(`session_id`),
  INDEX `buyer_chat_messages_session_id_created_at_idx`(`session_id`, `created_at`),
  CONSTRAINT `buyer_chat_messages_session_id_fkey`
    FOREIGN KEY (`session_id`) REFERENCES `buyer_chat_sessions`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
