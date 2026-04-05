CREATE TABLE IF NOT EXISTS `market_snapshot_daily` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `city` VARCHAR(128) NOT NULL,
  `district` VARCHAR(128) NOT NULL,
  `property_type` VARCHAR(128) NOT NULL,
  `snapshot_date` DATE NOT NULL,
  `avg_price_per_m2_syp` DOUBLE NOT NULL,
  `median_price_per_m2_syp` DOUBLE NOT NULL,
  `min_price_per_m2_syp` DOUBLE NOT NULL,
  `max_price_per_m2_syp` DOUBLE NOT NULL,
  `sample_count` INT NOT NULL,
  `volatility` DOUBLE NOT NULL,
  `trend_direction` VARCHAR(16) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `market_snapshot_daily_area_date_uq`(`city`, `district`, `property_type`, `snapshot_date`),
  INDEX `market_snapshot_daily_area_idx`(`city`, `district`, `property_type`),
  INDEX `market_snapshot_daily_snapshot_date_idx`(`snapshot_date`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
