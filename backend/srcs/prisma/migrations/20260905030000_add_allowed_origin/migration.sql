-- Origines web autorisées à consommer l'API et à recevoir le retour de
-- connexion 42 (déploiements miroir qui proxifient /api vers ce backend).
CREATE TABLE `allowed_origin` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `origin` VARCHAR(255) NOT NULL,
  `label` VARCHAR(128) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `allowed_origin_origin_key`(`origin`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
