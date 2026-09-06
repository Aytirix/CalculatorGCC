-- Rattrapage : le travail sur le Holy Graph a modifié `schema.prisma` sans
-- migration correspondante. Le développement tournant sur `prisma db push`,
-- l'écart est resté invisible jusqu'au déploiement — où la connexion 42
-- échouait, l'upsert de `user_simulation` écrivant une colonne absente.
--
-- Écrit avec IF NOT EXISTS : les bases déjà alignées par `db push` doivent
-- pouvoir appliquer cette migration sans erreur.

-- Campus principal, relevé à la connexion (sert au filtrage du Holy Graph).
ALTER TABLE `user_simulation` ADD COLUMN IF NOT EXISTS `campusId` INTEGER NULL;

-- Cache partagé des données de référence 42 (catalogue, layout du Holy Graph,
-- sessions, compétences). Sans lui, chaque redémarrage relançait des dizaines
-- de requêtes vers l'API 42.
CREATE TABLE IF NOT EXISTS `api42_cache` (
    `key` VARCHAR(64) NOT NULL,
    `payload` JSON NOT NULL,
    `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- État du refresh global déclenché par l'admin.
CREATE TABLE IF NOT EXISTS `global_refresh` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `startedBy` VARCHAR(128) NULL,
    `usersTotal` INTEGER NOT NULL DEFAULT 0,
    `usersDone` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- NOTE : `prisma migrate diff` proposera toujours des « MODIFY … JSON » sur les
-- colonnes JSON de ce schéma. C'est un faux positif propre à MariaDB, où `JSON`
-- n'est qu'un alias de `LONGTEXT` avec contrainte de validation : la colonne se
-- relit donc en `longtext` juste après avoir été convertie, et le diff ne peut
-- pas converger. Rien à corriger de ce côté.
