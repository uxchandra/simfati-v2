-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(255) NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    UNIQUE INDEX `roles_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Role sistem (sama seperti SIMFATI v1). Code dipakai oleh kode, jangan diubah.
INSERT INTO `roles` (`code`, `name`, `description`, `is_system`, `updated_at`) VALUES
    ('superadmin', 'Super Admin', 'Akses penuh ke semua menu', true, CURRENT_TIMESTAMP(3)),
    ('ast_leader', 'Ast. Leader', 'Melihat mesin dan membuat repair request', true, CURRENT_TIMESTAMP(3)),
    ('mekanik', 'Mekanik', 'Mengerjakan general checkup dan repair', true, CURRENT_TIMESTAMP(3)),
    ('subcont', 'Subcont', 'Mengerjakan repair dari perusahaan subcont', true, CURRENT_TIMESTAMP(3));

-- AlterTable: tambah kolom baru dulu (role_id sementara boleh kosong)
ALTER TABLE `users` ADD COLUMN `role_id` INTEGER NULL,
    ADD COLUMN `subcont_id` INTEGER NULL;

-- Pindahkan role lama: ADMIN -> superadmin, USER -> mekanik
UPDATE `users` u
    JOIN `roles` r ON r.`code` = IF(u.`role` = 'ADMIN', 'superadmin', 'mekanik')
    SET u.`role_id` = r.`id`;

-- Setelah semua terisi, role_id wajib dan kolom enum lama dibuang
ALTER TABLE `users` MODIFY `role_id` INTEGER NOT NULL,
    DROP COLUMN `role`;

-- CreateIndex
CREATE INDEX `users_role_id_idx` ON `users`(`role_id`);

-- CreateIndex
CREATE INDEX `users_subcont_id_idx` ON `users`(`subcont_id`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_subcont_id_fkey` FOREIGN KEY (`subcont_id`) REFERENCES `subcont`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
