-- AlterTable
ALTER TABLE `checkup_part_requests` ADD COLUMN `repair_request_id` INTEGER NULL,
    MODIFY `detail_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `inhouse_repairs` ADD COLUMN `repair_request_id` INTEGER NULL,
    MODIFY `detail_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `outhouse_repairs` ADD COLUMN `repair_request_id` INTEGER NULL,
    MODIFY `detail_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `repair_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kode` VARCHAR(50) NOT NULL,
    `asset_id` INTEGER NOT NULL,
    `problem` TEXT NOT NULL,
    `status` ENUM('pending', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    `repair_action` ENUM('ganti_part', 'inhouse', 'outhouse') NULL,
    `requested_by` INTEGER NOT NULL,
    `requested_at` DATETIME(3) NOT NULL,
    `completed_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    UNIQUE INDEX `repair_requests_kode_key`(`kode`),
    INDEX `repair_requests_status_idx`(`status`),
    INDEX `repair_requests_asset_id_idx`(`asset_id`),
    INDEX `repair_requests_requested_by_idx`(`requested_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `repair_request_photos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `repair_request_id` INTEGER NOT NULL,
    `path` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `repair_request_photos_repair_request_id_idx`(`repair_request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `checkup_part_requests_repair_request_id_idx` ON `checkup_part_requests`(`repair_request_id`);

-- CreateIndex
CREATE UNIQUE INDEX `inhouse_repairs_repair_request_id_key` ON `inhouse_repairs`(`repair_request_id`);

-- CreateIndex
CREATE UNIQUE INDEX `outhouse_repairs_repair_request_id_key` ON `outhouse_repairs`(`repair_request_id`);

-- AddForeignKey
ALTER TABLE `inhouse_repairs` ADD CONSTRAINT `inhouse_repairs_repair_request_id_fkey` FOREIGN KEY (`repair_request_id`) REFERENCES `repair_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outhouse_repairs` ADD CONSTRAINT `outhouse_repairs_repair_request_id_fkey` FOREIGN KEY (`repair_request_id`) REFERENCES `repair_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `checkup_part_requests` ADD CONSTRAINT `checkup_part_requests_repair_request_id_fkey` FOREIGN KEY (`repair_request_id`) REFERENCES `repair_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `repair_requests` ADD CONSTRAINT `repair_requests_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `repair_requests` ADD CONSTRAINT `repair_requests_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `repair_request_photos` ADD CONSTRAINT `repair_request_photos_repair_request_id_fkey` FOREIGN KEY (`repair_request_id`) REFERENCES `repair_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

