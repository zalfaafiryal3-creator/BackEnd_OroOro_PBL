CREATE TABLE `Promotion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `store` VARCHAR(191) NOT NULL,
    `owner` VARCHAR(191) NOT NULL DEFAULT 'Pedagang Pasar',
    `category` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `banner_image` TEXT NULL,
    `status` VARCHAR(191) NOT NULL,
    `period_type` VARCHAR(191) NOT NULL,
    `period_display` VARCHAR(191) NOT NULL,
    `operating_hours` VARCHAR(191) NOT NULL,
    `terms` TEXT NOT NULL DEFAULT '',
    `code` VARCHAR(191) NOT NULL DEFAULT '',
    `quota` VARCHAR(191) NOT NULL DEFAULT '0 / 100',
    `discount_type` VARCHAR(191) NOT NULL DEFAULT '',
    `previous_status` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Promotion_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
