-- Taille actuelle du groupe sur un projet simulé : permet de distinguer un
-- groupe complet d'un groupe où il reste une place à prendre.
ALTER TABLE `simulated_project` ADD COLUMN `teamSize` INTEGER NULL;
