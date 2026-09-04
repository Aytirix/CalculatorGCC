-- « J'ai déjà ma team » sur un projet simulé : permet de filtrer, dans la
-- recherche de teammates, les personnes qui ne cherchent plus de coéquipier.
ALTER TABLE `simulated_project` ADD COLUMN `hasTeam` BOOLEAN NOT NULL DEFAULT false;
