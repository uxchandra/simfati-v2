-- CreateTable
CREATE TABLE `general_checkups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kode` VARCHAR(50) NOT NULL,
    `schedule_id` INTEGER NULL,
    `asset_id` INTEGER NOT NULL,
    `checksheet_name` VARCHAR(150) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `shift` ENUM('morning', 'afternoon', 'night') NOT NULL,
    `status` ENUM('on_progress', 'completed') NOT NULL DEFAULT 'on_progress',
    `notes` TEXT NULL,
    `started_at` DATETIME(3) NOT NULL,
    `submitted_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    UNIQUE INDEX `general_checkups_kode_key`(`kode`),
    UNIQUE INDEX `general_checkups_schedule_id_key`(`schedule_id`),
    INDEX `general_checkups_status_idx`(`status`),
    INDEX `general_checkups_asset_id_idx`(`asset_id`),
    INDEX `general_checkups_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `checkup_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `checkup_id` INTEGER NOT NULL,
    `urutan` INTEGER NOT NULL,
    `bagian` VARCHAR(150) NOT NULL,
    `poin` TEXT NOT NULL,
    `metode` TEXT NULL,
    `standar` TEXT NULL,
    `result` ENUM('PENDING', 'OK', 'NG') NOT NULL DEFAULT 'PENDING',
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    INDEX `checkup_details_checkup_id_urutan_idx`(`checkup_id`, `urutan`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `checkup_photos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `checkup_id` INTEGER NOT NULL,
    `path` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `checkup_photos_checkup_id_idx`(`checkup_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `general_checkups` ADD CONSTRAINT `general_checkups_schedule_id_fkey` FOREIGN KEY (`schedule_id`) REFERENCES `preventive_schedules`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `general_checkups` ADD CONSTRAINT `general_checkups_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `general_checkups` ADD CONSTRAINT `general_checkups_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `checkup_details` ADD CONSTRAINT `checkup_details_checkup_id_fkey` FOREIGN KEY (`checkup_id`) REFERENCES `general_checkups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `checkup_photos` ADD CONSTRAINT `checkup_photos_checkup_id_fkey` FOREIGN KEY (`checkup_id`) REFERENCES `general_checkups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

