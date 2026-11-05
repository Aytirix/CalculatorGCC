-- Expériences professionnelles détectées sur l'intra que l'utilisateur a
-- désactivées (identifiants `projects_users`) : une alternance enregistrée
-- pour 2 ans alors qu'elle n'en durera qu'un, par exemple. Elles ne comptent
-- plus ; l'utilisateur ajoute la sienne à la place.
--
-- `IF NOT EXISTS` : la colonne peut déjà exister sur un environnement où le
-- schéma a été poussé avec `db push` avant que cette migration n'existe.
ALTER TABLE `user_simulation`
  ADD COLUMN IF NOT EXISTS `disabledApiExperiences` JSON NULL;
