-- L'utilisateur a cliqué « Ne plus me le rappeler » sur le bandeau
-- « Installer l'application ».
--
-- Mémorisé en base (et non seulement dans le localStorage) pour que le choix
-- suive le compte d'un appareil ou d'un navigateur à l'autre.
--
-- `IF NOT EXISTS` : la colonne peut déjà exister sur un environnement où le
-- schéma a été poussé avec `db push` avant que cette migration n'existe.
ALTER TABLE `user_simulation`
  ADD COLUMN IF NOT EXISTS `installPromptDismissed` BOOLEAN NOT NULL DEFAULT false;
