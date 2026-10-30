-- CreateTable
CREATE TABLE `checksheets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `category_id` INTEGER NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    UNIQUE INDEX `checksheets_category_id_name_key`(`category_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `checksheet_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `checksheet_id` INTEGER NOT NULL,
    `urutan` INTEGER NOT NULL,
    `bagian` VARCHAR(150) NOT NULL,
    `poin` TEXT NOT NULL,
    `metode` TEXT NULL,
    `standar` TEXT NULL,
    `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    INDEX `checksheet_items_checksheet_id_urutan_idx`(`checksheet_id`, `urutan`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `checksheets` ADD CONSTRAINT `checksheets_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `kategori_aset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `checksheet_items` ADD CONSTRAINT `checksheet_items_checksheet_id_fkey` FOREIGN KEY (`checksheet_id`) REFERENCES `checksheets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
