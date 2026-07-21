-- Retrait de la voie de bootstrap `/setup` localhost (faille « B1 » : verrou basé sur
-- le header `Host`, usurpable). Le bootstrap owner passe désormais par `/admin` :
-- token console régénéré à chaque démarrage (jamais persisté) puis passkey WebAuthn.
--
-- La colonne est CONSERVÉE inerte (même parti-pris que `jwtSecretNext` : pas de DROP
-- destructif en prod), mais sa valeur est purgée : c'était un secret de bootstrap
-- stocké en clair, désormais sans aucun usage.
UPDATE `configuration` SET `setupToken` = NULL WHERE `setupToken` IS NOT NULL;
