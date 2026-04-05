SET @table_exists := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'market_data'
);

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'market_data'
    AND column_name = 'ingest_hash'
);

SET @add_column_sql := IF(
  @table_exists > 0 AND @column_exists = 0,
  'ALTER TABLE `market_data` ADD COLUMN `ingest_hash` VARCHAR(64) NULL',
  'SELECT 1'
);
PREPARE stmt_add_column FROM @add_column_sql;
EXECUTE stmt_add_column;
DEALLOCATE PREPARE stmt_add_column;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'market_data'
    AND index_name = 'market_data_ingest_hash_unique'
);

SET @add_index_sql := IF(
  @table_exists > 0 AND @index_exists = 0,
  'CREATE UNIQUE INDEX `market_data_ingest_hash_unique` ON `market_data`(`ingest_hash`)',
  'SELECT 1'
);
PREPARE stmt_add_index FROM @add_index_sql;
EXECUTE stmt_add_index;
DEALLOCATE PREPARE stmt_add_index;
