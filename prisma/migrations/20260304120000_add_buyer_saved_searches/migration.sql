CREATE TABLE `buyer_saved_searches` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `buyer_id` INTEGER NOT NULL,
  `title` VARCHAR(191) NULL,
  `filters_json` JSON NOT NULL,
  `filters_hash` VARCHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `buyer_saved_searches_filters_hash_key`(`filters_hash`),
  INDEX `buyer_saved_searches_buyer_id_idx`(`buyer_id`),
  INDEX `buyer_saved_searches_buyer_id_created_at_idx`(`buyer_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `buyer_saved_searches`
ADD CONSTRAINT `buyer_saved_searches_buyer_id_fkey`
FOREIGN KEY (`buyer_id`) REFERENCES `User`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;
