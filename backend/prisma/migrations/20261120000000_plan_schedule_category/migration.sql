-- Jadwal preventive kini dikelompokkan per kategori schedule (tiap kategori = satu submenu Schedule)

-- AlterTable: tambah kolom dulu (sementara boleh kosong)
ALTER TABLE `preventive_plans` ADD COLUMN `schedule_category_id` INTEGER NULL;

-- Kalau sudah ada jadwal tapi belum ada kategori schedule sama sekali, buat satu kategori default
INSERT INTO `schedule_categories` (`name`, `created_at`, `updated_at`)
SELECT 'Preventive', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE EXISTS (SELECT 1 FROM `preventive_plans`)
  AND NOT EXISTS (SELECT 1 FROM `schedule_categories`);

-- Jadwal lama dimasukkan ke kategori schedule pertama
UPDATE `preventive_plans`
SET `schedule_category_id` = (SELECT MIN(`id`) FROM `schedule_categories`);

-- Setelah semua terisi, kolom wajib diisi
ALTER TABLE `preventive_plans` MODIFY `schedule_category_id` INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX `preventive_plans_schedule_category_id_category_id_tahun_urut_idx` ON `preventive_plans`(`schedule_category_id`, `category_id`, `tahun`, `urutan`);

-- AddForeignKey
ALTER TABLE `preventive_plans` ADD CONSTRAINT `preventive_plans_schedule_category_id_fkey` FOREIGN KEY (`schedule_category_id`) REFERENCES `schedule_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
