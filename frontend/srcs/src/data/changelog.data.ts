/**
 * CHANGELOG — nouveautés affichées aux utilisateurs.
 *
 * COMMENT AJOUTER UNE ENTRÉE (à chaque déploiement notable) :
 *   1. Ajoute un objet EN TÊTE du tableau CHANGELOG (le plus récent en premier).
 *   2. Donne-lui un `version` UNIQUE (ex. la date ; si 2 entrées le même jour,
 *      suffixe : '2026-07-10.2'). C'est cette valeur qui sert à savoir si un
 *      utilisateur a déjà vu l'entrée — ne réutilise jamais une ancienne version.
 *   3. `date` = libellé affiché, `title` = résumé court, `changes` = liste des
 *      nouveautés côté utilisateur (langage simple, pas technique).
 *
 * Dès qu'une nouvelle entrée est en tête, elle s'affiche automatiquement (une
 * fois) à chaque utilisateur qui ne l'a pas encore acquittée. L'acquittement est
 * stocké côté serveur (donc valable sur tous ses appareils).
 */
export interface ChangelogEntry {
	/** Identifiant unique et immuable de l'entrée (sert au suivi « déjà vu »). */
	version: string;
	/** Libellé de date affiché (ex. « 3 juillet 2026 »). */
	date: string;
	/** Titre court de la mise à jour. */
	title: string;
	/** Liste des nouveautés, côté utilisateur. */
	changes: string[];
}

// Vide pour l'instant. Pour publier une note : ajoute un objet EN TÊTE du tableau
// (le plus récent en premier) avec un `version` unique. Voir le bloc de doc ci-dessus.
export const CHANGELOG: ChangelogEntry[] = [];

/** Version du changelog le plus récent (celle à comparer au « déjà vu » de l'utilisateur). */
export const LATEST_CHANGELOG_VERSION = CHANGELOG[0]?.version ?? '';
