CREATE TABLE IF NOT EXISTS `advisor_request_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `endpoint` VARCHAR(64) NOT NULL,
  `city_norm` VARCHAR(128) NULL,
  `district_norm` VARCHAR(128) NULL,
  `property_type_norm` VARCHAR(128) NULL,
  `area_key` VARCHAR(255) NULL,
  `area_m2` DOUBLE NULL,
  `sample_count` INTEGER NULL,
  `fx_used` DOUBLE NULL,
  `verdict` VARCHAR(16) NULL,
  `confidence` DOUBLE NULL,
  `status_code` INTEGER NOT NULL,
  `latency_ms` INTEGER UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `advisor_request_logs_created_at_idx`(`created_at`),
  INDEX `advisor_request_logs_endpoint_created_at_idx`(`endpoint`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
