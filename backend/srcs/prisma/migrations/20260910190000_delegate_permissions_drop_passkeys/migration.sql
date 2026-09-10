-- Permissions par zone pour les délégués.
-- `secrets42` par défaut : c'était leur seul droit jusqu'ici (POST /setup/admin/configure),
-- les délégués déjà enregistrés le conservent donc à l'identique.
-- `IF NOT EXISTS` : MariaDB auto-commite chaque DDL, aucune transaction ne couvre
-- ce fichier. Si le process meurt entre les deux instructions, un rejeu échouait
-- en « Duplicate column » (1060).
--
-- Portée exacte : cela ne dispense PAS du `prisma migrate resolve` quand Prisma a
-- déjà inscrit la migration comme échouée — il répondra P3009 quoi qu'il arrive.
-- Ce que le mot-clé débloque, c'est l'étape d'après : une fois la migration
-- marquée `--rolled-back`, le rejeu passe, là où il butait indéfiniment sur 1060.
ALTER TABLE `admin_delegate`
  ADD COLUMN IF NOT EXISTS `permissions` VARCHAR(255) NOT NULL DEFAULT 'secrets42';

-- Retrait de l'authentification par passkey : le token console devient la seule
-- voie d'accès owner. La table ne sert plus à rien une fois le code retiré.
DROP TABLE IF EXISTS `admin_credential`;
