-- AlterTable
ALTER TABLE `configuration` ADD COLUMN `jwtSecretNext` VARCHAR(256) NULL;
ALTER TABLE `configuration` ADD COLUMN `jwtSecretExpiresAt` DATETIME(3) NULL;
