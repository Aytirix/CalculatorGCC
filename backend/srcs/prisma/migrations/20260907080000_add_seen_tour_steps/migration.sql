-- Étapes du guide déjà vues par l'utilisateur, séparées par des virgules.
--
-- `hasSeenTour` (booléen) ne disait que « a déjà vu LE guide ». Quand le guide
-- gagne des étapes, on ne peut donc ni les proposer ni rejouer le tour entier
-- sans importuner tout le monde. La liste des étapes vues permet de ne montrer
-- que ce qui est nouveau.
--
-- `IF NOT EXISTS` : la colonne peut déjà exister sur un environnement où le
-- schéma a été poussé avec `db push` avant que cette migration n'existe.
ALTER TABLE `user_simulation`
  ADD COLUMN IF NOT EXISTS `seenTourSteps` TEXT NULL;
