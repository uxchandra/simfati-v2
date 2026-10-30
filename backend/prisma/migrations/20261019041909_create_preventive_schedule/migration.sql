-- AlterTable
ALTER TABLE `assets` ADD COLUMN `checksheet_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `preventive_plans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `category_id` INTEGER NOT NULL,
    `tahun` INTEGER NOT NULL,
    `urutan` INTEGER NOT NULL,
    `grup` VARCHAR(150) NULL,
    `nama` VARCHAR(255) NOT NULL,
    `deskripsi` VARCHAR(255) NULL,
    `asset_id` INTEGER NULL,
    `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    INDEX `preventive_plans_category_id_tahun_urutan_idx`(`category_id`, `tahun`, `urutan`),
    INDEX `preventive_plans_asset_id_idx`(`asset_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `preventive_schedules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `plan_id` INTEGER NOT NULL,
    `bulan` INTEGER NOT NULL,
    `minggu` INTEGER NOT NULL,
    `tipe` ENUM('periodic', 'yearly') NOT NULL DEFAULT 'periodic',
    `status` ENUM('planned', 'in_progress', 'done') NOT NULL DEFAULT 'planned',
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    UNIQUE INDEX `preventive_schedules_plan_id_bulan_minggu_tipe_key`(`plan_id`, `bulan`, `minggu`, `tipe`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_checksheet_id_fkey` FOREIGN KEY (`checksheet_id`) REFERENCES `checksheets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `preventive_plans` ADD CONSTRAINT `preventive_plans_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `kategori_aset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `preventive_plans` ADD CONSTRAINT `preventive_plans_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `preventive_schedules` ADD CONSTRAINT `preventive_schedules_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `preventive_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
