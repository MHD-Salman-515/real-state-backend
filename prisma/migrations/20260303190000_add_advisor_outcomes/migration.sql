CREATE TABLE IF NOT EXISTS `advisor_outcomes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `log_id` VARCHAR(64) NOT NULL,
  `action` VARCHAR(32) NOT NULL,
  `final_price_syp` BIGINT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `advisor_outcomes_log_id_idx`(`log_id`),
  INDEX `advisor_outcomes_action_created_at_idx`(`action`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
