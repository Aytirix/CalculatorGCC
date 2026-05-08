-- AlterTable
-- isPublic: NULL = utilisateur n'a pas encore choisi (traité comme privé
-- jusqu'à un choix explicite via le modal au login).
ALTER TABLE `user_simulation`
ADD COLUMN `firstName` VARCHAR(64) NULL,
ADD COLUMN `lastName` VARCHAR(64) NULL,
ADD COLUMN `isPublic` BOOLEAN NULL DEFAULT NULL;
