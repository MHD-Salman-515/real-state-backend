CREATE TABLE IF NOT EXISTS `owner_market_watch` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `owner_id` INT NOT NULL,
  `city` VARCHAR(128) NOT NULL,
  `district` VARCHAR(128) NOT NULL,
  `property_type` VARCHAR(128) NOT NULL,
  `days_window` INT NOT NULL DEFAULT 90,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `owner_market_watch_owner_id_idx`(`owner_id`),
  UNIQUE INDEX `owner_market_watch_owner_city_district_type_uq`(`owner_id`, `city`, `district`, `property_type`),
  PRIMARY KEY (`id`),
  CONSTRAINT `owner_market_watch_owner_id_fkey`
    FOREIGN KEY (`owner_id`) REFERENCES `User`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
);
