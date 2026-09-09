-- Référentiel RNCP versionné.
--
-- `IF NOT EXISTS` : la table peut déjà exister sur un environnement où le
-- schéma a été poussé avec `prisma db push` avant que cette migration n'existe.
-- Sans cette clause, `migrate deploy` échouerait au déploiement et laisserait
-- l'application sans base — c'est déjà arrivé sur une autre colonne.
CREATE TABLE IF NOT EXISTS `rncp_referential_version` (
  `version`   INTEGER NOT NULL AUTO_INCREMENT,
  `payload`   JSON NOT NULL,
  `createdBy` VARCHAR(128) NOT NULL,
  `summary`   TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`version`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
