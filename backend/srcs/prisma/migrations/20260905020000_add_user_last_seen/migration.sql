-- Dernier passage d'un utilisateur dans l'application, pour les statistiques
-- d'usage agrégées (actifs du jour / de la semaine / du mois / de l'année).
ALTER TABLE `user_simulation` ADD COLUMN `lastSeenAt` DATETIME(3) NULL;
CREATE INDEX `user_simulation_lastSeenAt_idx` ON `user_simulation`(`lastSeenAt`);
