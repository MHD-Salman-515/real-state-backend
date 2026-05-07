CREATE TABLE IF NOT EXISTS `districts` (
  `id`               INT AUTO_INCREMENT PRIMARY KEY,
  `nameAr`           VARCHAR(100) NOT NULL,
  `nameEn`           VARCHAR(100) NOT NULL,
  `city`             VARCHAR(50)  NOT NULL,
  `tier`             VARCHAR(20)  NOT NULL DEFAULT 'medium',
  `priceMultiplier`  FLOAT        NOT NULL DEFAULT 1.0,
  `lat`              FLOAT        NULL,
  `lng`              FLOAT        NULL,
  `isOrganized`      BOOLEAN      NOT NULL DEFAULT FALSE,
  `createdAt`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `districts_nameEn_city_unique` (`nameEn`, `city`),
  INDEX `districts_city_idx` (`city`),
  INDEX `districts_tier_idx` (`tier`)
);
