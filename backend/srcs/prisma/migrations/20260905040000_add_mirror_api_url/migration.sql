-- Mode miroir : URL de l'API d'une autre instance vers laquelle relayer les
-- routes applicatives. NULL = l'instance sert ses propres données.
ALTER TABLE `configuration` ADD COLUMN `mirrorApiUrl` VARCHAR(255) NULL;
