-- AlterTable: rendre isPublic nullable, default NULL
-- Comportement: NULL = utilisateur n'a pas encore choisi (traité comme privé jusqu'à choix)
-- Les utilisateurs déjà à true gardent leur valeur.
ALTER TABLE `user_simulation`
  MODIFY COLUMN `isPublic` BOOLEAN NULL DEFAULT NULL;
