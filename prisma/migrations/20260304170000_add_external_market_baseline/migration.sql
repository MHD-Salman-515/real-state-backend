CREATE TABLE IF NOT EXISTS `external_market_sources` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `source_type` VARCHAR(64) NULL,
  `base_url` VARCHAR(1024) NULL,
  `reliability_score` DOUBLE NOT NULL DEFAULT 1,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `methodology_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `external_market_sources_is_active_idx`(`is_active`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `external_market_observations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `source_id` INT NOT NULL,
  `city` VARCHAR(128) NULL,
  `district` VARCHAR(128) NULL,
  `property_type` VARCHAR(128) NULL,
  `metric` VARCHAR(64) NOT NULL,
  `value` DOUBLE NOT NULL,
  `value_unit` VARCHAR(32) NULL,
  `url` VARCHAR(1024) NULL,
  `published_at` DATETIME(3) NOT NULL,
  `ingest_hash` VARCHAR(64) NOT NULL,
  `raw_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `external_market_observations_ingest_hash_uq`(`ingest_hash`),
  INDEX `external_market_observations_source_id_idx`(`source_id`),
  INDEX `external_market_observations_area_metric_idx`(`city`, `district`, `property_type`, `metric`),
  INDEX `external_market_observations_published_at_idx`(`published_at`),
  CONSTRAINT `external_market_observations_source_id_fkey`
    FOREIGN KEY (`source_id`) REFERENCES `external_market_sources`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `external_baseline_index` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `city` VARCHAR(128) NOT NULL,
  `district` VARCHAR(128) NOT NULL,
  `property_type` VARCHAR(128) NOT NULL,
  `metric` VARCHAR(64) NOT NULL,
  `period_start` DATETIME(3) NOT NULL,
  `period_end` DATETIME(3) NOT NULL,
  `value_mean` DOUBLE NOT NULL,
  `value_median` DOUBLE NOT NULL,
  `sample_count` INT NOT NULL,
  `methodology_json` JSON NOT NULL,
  `sources_json` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `external_baseline_index_area_metric_uq`(`city`, `district`, `property_type`, `metric`),
  INDEX `external_baseline_index_area_idx`(`city`, `district`, `property_type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
