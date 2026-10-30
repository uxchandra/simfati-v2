-- CreateTable
CREATE TABLE `spareparts` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `kode_barang` VARCHAR(255) NOT NULL,
    `nama_barang` VARCHAR(255) NULL,
    `spec` VARCHAR(255) NULL,
    `stok` INTEGER NULL,
    `minimal_stok` INTEGER NULL,
    `maksimal_stok` INTEGER NULL,
    `uom` VARCHAR(50) NULL,
    `keterangan` TEXT NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL,

    INDEX `spareparts_kode_barang_idx`(`kode_barang`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
