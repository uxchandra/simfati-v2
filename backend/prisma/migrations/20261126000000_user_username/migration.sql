-- Login pakai username, bukan email.
-- Kolom email di-rename jadi username; nilai lama diambil bagian sebelum '@'
-- (contoh: admin@mail.com -> admin).
ALTER TABLE `users` RENAME COLUMN `email` TO `username`;
ALTER TABLE `users` RENAME INDEX `users_email_key` TO `users_username_key`;
UPDATE `users` SET `username` = SUBSTRING_INDEX(`username`, '@', 1) WHERE `username` LIKE '%@%';