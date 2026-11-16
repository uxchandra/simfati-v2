-- AlterTable
ALTER TABLE `checkup_details` ADD COLUMN `ng_closed_at` DATETIME(3) NULL,
    ADD COLUMN `repair_action` ENUM('ganti_part', 'inhouse', 'outhouse') NULL;

-- CreateTable
CREATE TABLE `inhouse_repairs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `detail_id` INTEGER NOT NULL,
    `problem` TEXT NOT NULL,
    `perbaikan` TEXT NOT NULL,
    `user_id` INTEGER NULL,
    `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    UNIQUE INDEX `inhouse_repairs_detail_id_key`(`detail_id`),
    INDEX `inhouse_repairs_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outhouse_repairs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `detail_id` INTEGER NOT NULL,
    `subcont_id` INTEGER NOT NULL,
    `problem` TEXT NOT NULL,
    `perbaikan` TEXT NOT NULL,
    `status` ENUM('pending', 'on_progress', 'waiting_confirmation', 'completed') NOT NULL DEFAULT 'pending',
    `hasil` TEXT NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `confirmed_at` DATETIME(3) NULL,
    `user_id` INTEGER NULL,
    `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    UNIQUE INDEX `outhouse_repairs_detail_id_key`(`detail_id`),
    INDEX `outhouse_repairs_subcont_id_status_idx`(`subcont_id`, `status`),
    INDEX `outhouse_repairs_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `checkup_part_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `detail_id` INTEGER NOT NULL,
    `sparepart_id` BIGINT UNSIGNED NOT NULL,
    `quantity` INTEGER NOT NULL,
    `keterangan` TEXT NULL,
    `installed_at` DATETIME(3) NULL,
    `user_id` INTEGER NULL,
    `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    INDEX `checkup_part_requests_detail_id_idx`(`detail_id`),
    INDEX `checkup_part_requests_sparepart_id_idx`(`sparepart_id`),
    INDEX `checkup_part_requests_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `inhouse_repairs` ADD CONSTRAINT `inhouse_repairs_detail_id_fkey` FOREIGN KEY (`detail_id`) REFERENCES `checkup_details`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inhouse_repairs` ADD CONSTRAINT `inhouse_repairs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outhouse_repairs` ADD CONSTRAINT `outhouse_repairs_detail_id_fkey` FOREIGN KEY (`detail_id`) REFERENCES `checkup_details`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outhouse_repairs` ADD CONSTRAINT `outhouse_repairs_subcont_id_fkey` FOREIGN KEY (`subcont_id`) REFERENCES `subcont`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outhouse_repairs` ADD CONSTRAINT `outhouse_repairs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `checkup_part_requests` ADD CONSTRAINT `checkup_part_requests_detail_id_fkey` FOREIGN KEY (`detail_id`) REFERENCES `checkup_details`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `checkup_part_requests` ADD CONSTRAINT `checkup_part_requests_sparepart_id_fkey` FOREIGN KEY (`sparepart_id`) REFERENCES `spareparts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `checkup_part_requests` ADD CONSTRAINT `checkup_part_requests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

