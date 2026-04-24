-- AlterTable
ALTER TABLE `user_simulation`
ADD COLUMN `firstName` VARCHAR(64) NULL,
ADD COLUMN `lastName` VARCHAR(64) NULL,
ADD COLUMN `isPublic` BOOLEAN NOT NULL DEFAULT true;
