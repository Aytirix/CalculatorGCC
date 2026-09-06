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

/**
 * Nature d'un changement : sert au classement visuel des puces.
 *  - `new`      une fonctionnalité qui n'existait pas
 *  - `improved` quelque chose qui existait et qui est meilleur
 *  - `fixed`    un comportement qui était faux
 */
export type ChangeKind = 'new' | 'improved' | 'fixed';

export interface ChangelogChange {
	kind: ChangeKind;
	/** Formulation courte, à la première personne du point de vue de l'utilisateur. */
	text: string;
}

export interface ChangelogEntry {
	/** Identifiant unique et immuable de l'entrée (sert au suivi « déjà vu »). */
	version: string;
	/** Libellé de date affiché (ex. « 3 juillet 2026 »). */
	date: string;
	/** Titre court de la mise à jour. */
	title: string;
	/** Phrase d'accroche facultative, affichée sous le titre. */
	summary?: string;
	/** Liste des nouveautés, côté utilisateur. */
	changes: ChangelogChange[];
}

export const KIND_LABELS: Record<ChangeKind, string> = {
	new: 'Nouveau',
	improved: 'Amélioré',
	fixed: 'Corrigé',
};

// Pour publier une note : ajoute un objet EN TÊTE du tableau (le plus récent en
// premier) avec un `version` unique. Voir le bloc de doc ci-dessus.
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '2026-09-07',
		date: '7 septembre 2026',
		title: 'Holy Graph, Mes projets, recherche universelle',
		summary:
			"La plus grosse mise à jour depuis le lancement : trois nouvelles pages, une ligne de projet repensée, et une série de calculs remis d'aplomb.",
		changes: [
			{
				kind: 'new',
				text: "Page « Mes projets » : tout ton parcours en une liste — validés, ratés, en cours, simulés, jamais commencés — avec filtres, tris et recherche. Tes réglages sont mémorisés d'une visite à l'autre.",
			},
			{
				kind: 'new',
				text: "Holy Graph : le graphe officiel de 42 avec ton avancement. Clique un projet pour voir sa description, son temps estimé, sa taille d'équipe et ses prérequis — et le simuler sans quitter le graphe.",
			},
			{
				kind: 'new',
				text: 'Recherche universelle : un projet, une page, un étudiant. Depuis la loupe de la barre du haut ou avec Ctrl + K, de n\'importe où.',
			},
			{
				kind: 'new',
				text: "Page « Stats » : quelques statistiques anonymes sur l'utilisation du site.",
			},
			{
				kind: 'new',
				text: "Dans le simulateur, chaque projet a maintenant un engrenage : il ouvre toutes ses informations — XP, durée, taille d'équipe, nombre de correcteurs, délai avant de retenter, description, objectifs, prérequis, et un lien direct vers l'intra.",
			},
			{
				kind: 'improved',
				text: "Trouver des teammates : la fenêtre montre d'un côté ceux qui ont simulé le projet ici, de l'autre ceux réellement inscrits sur l'intra de ton campus. Tu peux signaler que tu as déjà ta team, et l'icône n'apparaît que sur les projets qui se font vraiment en groupe.",
			},
			{
				kind: 'improved',
				text: "La ligne d'un projet réunit tout : teammates, ☆ pour viser le maximum, ⚡ pour le boost de coalition, ton pourcentage de validation et l'XP correspondant.",
			},
			{
				kind: 'improved',
				text: "L'XP des projets vient désormais directement de l'API 42 : plus de valeurs figées qui vieillissent en silence.",
			},
			{
				kind: 'improved',
				text: 'Page de connexion, barre de navigation et guide de découverte refaits — le guide est deux fois plus court.',
			},
			{
				kind: 'fixed',
				text: "Un projet à la fois simulé et en cours apparaît enfin dans le filtre « Simulé » : les deux états coexistent au lieu de s'écraser. Et un projet simulé depuis le Holy Graph n'apparaît plus en double dans la liste.",
			},
			{
				kind: 'fixed',
				text: "Les projets manuels ajoutés autrefois n'étaient pas comptés dans le niveau projeté. Ils le sont.",
			},
			{
				kind: 'fixed',
				text: "Consulter le profil d'un ami affichait tes propres stages et alternances, ce qui faussait son niveau projeté. Ce sont les siens qui s'affichent.",
			},
			{
				kind: 'fixed',
				text: 'Music Room manquait dans le RNCP 6 option Mobile.',
			},
			{
				kind: 'fixed',
				text: 'Les compteurs de statuts suivent maintenant le RNCP sélectionné, au lieu de compter tous les projets.',
			},
			{
				kind: 'fixed',
				text: "Les lignes de projets sont alignées, qu'ils se fassent en groupe ou en solo.",
			},
			{
				kind: 'fixed',
				text: "Quand la connexion échoue, le message dit enfin pourquoi — serveur injoignable, session non reconnue, trop de requêtes — et une simple coupure réseau ne te déconnecte plus.",
			},
		],
	},
	{
		version: '2026-07-03',
		date: '3 juillet 2026',
		title: 'Stages Work Experience I & II : la durée, au clair',
		changes: [
			{
				kind: 'improved',
				text: "La « Duration » d'un stage ne vaut pas simplement 100 % à 4 mois et 125 % à 6 mois comme le laisse croire le sujet : les vraies stats du campus montrent qu'elle varie en continu (un stage de 6 mois validé est presque toujours ≥ 110 %). Le simulateur affiche maintenant ces repères réels sous le champ Duration pour t'aider à estimer.",
			},
			{
				kind: 'fixed',
				text: "Le Work Experience II est toujours un stage de 6 mois : le guide de durée a été corrigé (il proposait avant un choix 4 / 6 mois qui n'a pas lieu d'être pour le WE II).",
			},
			{
				kind: 'fixed',
				text: "En modifiant une expérience, le bouton « Annuler » referme bien la fenêtre au lieu de rouvrir le choix du niveau de stage.",
			},
		],
	},
];

/** Version du changelog le plus récent (celle à comparer au « déjà vu » de l'utilisateur). */
export const LATEST_CHANGELOG_VERSION = CHANGELOG[0]?.version ?? '';
