ALTER TABLE `market_data`
  ADD COLUMN `is_outlier` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX `market_data_is_outlier_idx`
  ON `market_data` (`is_outlier`);
