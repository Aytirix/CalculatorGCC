-- AlterTable
-- Rotation du secret OAuth 42 : un « Next Secret 42 » optionnel (chiffré comme le
-- courant) pris automatiquement en relais dès que le secret courant est refusé
-- (invalid_client). `credentialsInvalidSince` marque l'instant où plus aucun
-- secret ne fonctionne → sert de signal pour la bannière admin.
ALTER TABLE `configuration` ADD COLUMN `clientSecret42Next` TEXT NULL;
ALTER TABLE `configuration` ADD COLUMN `credentialsInvalidSince` DATETIME(3) NULL;
