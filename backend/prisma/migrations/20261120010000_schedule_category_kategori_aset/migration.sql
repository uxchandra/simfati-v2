-- Kategori schedule terhubung ke satu kategori aset (jembatan kategori schedule -> asset)

-- AlterTable: tambah kolom dulu (sementara boleh kosong)
ALTER TABLE `schedule_categories` ADD COLUMN `kategori_aset_id` INTEGER NULL;

-- Kategori schedule yang sudah punya jadwal: pakai kategori aset yang paling banyak dipakai jadwalnya
UPDATE `schedule_categories` sc
SET sc.`kategori_aset_id` = (
    SELECT p.`category_id`
    FROM `preventive_plans` p
    WHERE p.`schedule_category_id` = sc.`id`
    GROUP BY p.`category_id`
    ORDER BY COUNT(*) DESC, p.`category_id` ASC
    LIMIT 1
);

-- Yang belum punya jadwal: sementara pakai kategori aset pertama (bisa diubah di menu Kategori Schedule)
UPDATE `schedule_categories`
SET `kategori_aset_id` = (SELECT MIN(`id`) FROM `kategori_aset`)
WHERE `kategori_aset_id` IS NULL;

-- Setelah semua terisi, kolom wajib diisi
ALTER TABLE `schedule_categories` MODIFY `kategori_aset_id` INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE `schedule_categories` ADD CONSTRAINT `schedule_categories_kategori_aset_id_fkey` FOREIGN KEY (`kategori_aset_id`) REFERENCES `kategori_aset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
