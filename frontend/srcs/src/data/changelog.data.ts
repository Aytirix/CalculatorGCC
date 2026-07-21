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

// Pour publier une note : ajoute un objet EN TÊTE du tableau (le plus récent en
// premier) avec un `version` unique. Voir le bloc de doc ci-dessus.
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '2026-07-03',
		date: '3 juillet 2026',
		title: 'Stages Work Experience I & II : la durée, au clair',
		changes: [
			"La « Duration » d'un stage ne vaut pas simplement 100 % à 4 mois et 125 % à 6 mois comme le laisse croire le sujet : les vraies stats du campus montrent qu'elle varie en continu (un stage de 6 mois validé est presque toujours ≥ 110 %). Le simulateur affiche maintenant ces repères réels sous le champ Duration pour t'aider à estimer.",
			"Le Work Experience II est toujours un stage de 6 mois : le guide de durée a été corrigé (il proposait avant un choix 4 / 6 mois qui n'a pas lieu d'être pour le WE II).",
			"Correctif : en modifiant une expérience, le bouton « Annuler » referme bien la fenêtre au lieu de rouvrir le choix du niveau de stage.",
		],
	},
];

/** Version du changelog le plus récent (celle à comparer au « déjà vu » de l'utilisateur). */
export const LATEST_CHANGELOG_VERSION = CHANGELOG[0]?.version ?? '';
