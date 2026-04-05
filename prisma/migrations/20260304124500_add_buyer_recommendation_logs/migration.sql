CREATE TABLE `buyer_recommendation_logs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `buyer_id` INTEGER NOT NULL,
  `session_id` INTEGER NULL,
  `intent` VARCHAR(64) NOT NULL,
  `query_json` JSON NOT NULL,
  `results_json` JSON NOT NULL,
  `market_context_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `buyer_recommendation_logs_buyer_id_created_at_idx`(`buyer_id`, `created_at`),
  INDEX `buyer_recommendation_logs_session_id_idx`(`session_id`),
  INDEX `buyer_recommendation_logs_created_at_idx`(`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `buyer_recommendation_logs`
ADD CONSTRAINT `buyer_recommendation_logs_buyer_id_fkey`
FOREIGN KEY (`buyer_id`) REFERENCES `User`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `buyer_recommendation_logs`
ADD CONSTRAINT `buyer_recommendation_logs_session_id_fkey`
FOREIGN KEY (`session_id`) REFERENCES `buyer_chat_sessions`(`id`)
ON DELETE SET NULL ON UPDATE CASCADE;
