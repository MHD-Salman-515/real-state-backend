-- CreateTable
CREATE TABLE `learned_vocabulary` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `raw_term` VARCHAR(255) NOT NULL,
    `mapped_to` VARCHAR(255) NOT NULL,
    `category` VARCHAR(50) NOT NULL,
    `confidence` DOUBLE NOT NULL DEFAULT 0.5,
    `usage_count` INTEGER NOT NULL DEFAULT 1,
    `confirmed_count` INTEGER NOT NULL DEFAULT 0,
    `rejected_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `learned_vocabulary_raw_term_mapped_to_key`(`raw_term`, `mapped_to`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vocabulary_learning_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `term_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `action` VARCHAR(20) NOT NULL,
    `context` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `vocabulary_learning_log` ADD CONSTRAINT `vocabulary_learning_log_term_id_fkey` FOREIGN KEY (`term_id`) REFERENCES `learned_vocabulary`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
