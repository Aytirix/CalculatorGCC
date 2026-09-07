import type { PopperPlacement } from 'shepherd.js';

/**
 * Définition d'une étape du guide interactif.
 *
 * Pour ajouter un nouvel élément ciblable dans l'UI :
 *   1. Ajouter data-tour="nom-element" sur l'élément HTML
 *   2. Créer une entrée ici avec target: 'nom-element'
 */
export interface TourStepDef {
	/** Identifiant unique de l'étape */
	id: string;

	/** Valeur de l'attribut data-tour de l'élément ciblé.
	 *  Omis → tooltip centré à l'écran (aucun élément mis en avant) */
	target?: string;

	/** Titre affiché dans le tooltip */
	title: string;

	/** Texte affiché dans le tooltip (HTML autorisé) */
	text: string;

	/** Position du tooltip par rapport à l'élément ciblé (défaut: 'bottom') */
	position?: PopperPlacement;

	/**
	 * Type de validation pour passer à l'étape suivante :
	 * - 'button' (défaut) : bouton "Suivant" classique
	 * - 'click'           : l'utilisateur doit cliquer l'élément ciblé
	 */
	validation?: 'button' | 'click';

	/** Si false, le bouton × est masqué (empêche de fermer l'étape).
	 *  Défaut : true */
	canClose?: boolean;

	/** Si true ET validation='click', aucun bouton "Passer" n'est affiché.
	 *  L'utilisateur est bloqué jusqu'au clic sur l'élément. Défaut : false */
	blocking?: boolean;

	/**
	 * Si true, l'étape est TOTALEMENT non-passable :
	 * - Pas de bouton "Passer"
	 * - Pas de bouton × (fermer)
	 * - Touche Escape bloquée
	 *
	 * L'utilisateur DOIT interagir avec l'élément ciblé pour continuer.
	 * Implique automatiquement blocking: true et canClose: false.
	 */
	preventSkip?: boolean;
}

// ---------------------------------------------------------------------------
// Configuration des étapes du guide — Dashboard + Calendrier
// ---------------------------------------------------------------------------
// Pour ajouter un nouveau guide (ex: page spécifique), créer un nouveau
// tableau exporté séparément, puis le sélectionner dans TourContext
// selon la route active.
// ---------------------------------------------------------------------------

/**
 * Parcours de découverte, volontairement COURT.
 *
 * Il en comptait 21, dont cinq rien que pour le calendrier et plusieurs étapes
 * bloquantes qui exigeaient un clic précis pour avancer. Un guide qu'on
 * abandonne en route ne sert à rien : on couvre désormais l'essentiel de chaque
 * page en une étape, et on ne bloque plus que là où le geste est vraiment le
 * cœur de l'outil (cocher un projet).
 */
export const TOUR_STEPS: TourStepDef[] = [
	{
		id: 'step-welcome',
		title: 'Bienvenue sur CalculatorGCC',
		text: "Simule ta progression et ton <strong>niveau RNCP</strong> à partir de tes vraies données 42.<br><br>Ce guide fait le tour en une minute.",
		validation: 'button',
	},

	{
		id: 'step-nav',
		target: 'header-nav',
		title: 'Les cinq pages',
		// L'ordre et les libellés suivent NAV_ITEMS (Header.tsx) : les décrire de
		// mémoire garantissait de mentir dès le premier renommage.
		text:
			'<strong>RNCP</strong> — le simulateur<br>' +
			'<strong>Calendrier</strong> — ton planning de formation<br>' +
			'<strong>Mes projets</strong> — tout ton parcours, filtrable<br>' +
			'<strong>Holy Graph</strong> — le graphe officiel de 42<br>' +
			'<strong>Stats</strong> — les statistiques du site',
		position: 'bottom',
		validation: 'button',
	},

	{
		id: 'step-search',
		target: 'header-search',
		title: 'Rechercher partout',
		text: "Un projet, une page, un étudiant : tout se trouve ici. Le raccourci <kbd>Ctrl</kbd> + <kbd>K</kbd> l'ouvre depuis n'importe où.",
		position: 'bottom',
		validation: 'button',
	},

	{
		id: 'step-level',
		target: 'welcome-section',
		title: 'Niveau actuel et niveau projeté',
		text: "À gauche ton niveau réel, à droite celui que tu atteindrais en réalisant tout ce que tu simules. C'est ce chiffre que le reste de la page fait bouger.",
		position: 'bottom',
		validation: 'button',
	},

	{
		id: 'step-rncp-tabs',
		target: 'rncp-tabs',
		title: 'Les certifications',
		text: "Chaque onglet est un diplôme avec ses propres exigences. L'onglet <strong>Global</strong> réunit tous les projets, quel que soit le RNCP.",
		position: 'bottom',
		validation: 'button',
	},

	{
		id: 'step-select-project',
		target: 'calendar-test-project',
		title: 'Cocher un projet',
		text: "Un clic sur un projet que tu comptes faire envoie aussitôt son XP dans ton niveau projeté. Un second clic le retire.",
		position: 'right',
		// Le guide MONTRE, il n'impose pas. Exiger un clic sur un projet précis
		// bloquait l'utilisateur qui voulait simplement lire, et enfermait
		// carrément celui dont la cible n'était pas à l'écran.
		validation: 'button',
	},

	{
		id: 'step-project-line',
		target: 'project-details',
		title: 'Tout est sur la ligne',
		text:
			'<strong>👥</strong> trouver des teammates &nbsp;·&nbsp; ' +
			"<strong>☆</strong> simuler au maximum &nbsp;·&nbsp; " +
			'<strong>⚡</strong> boost de coalition (+4,2 %) &nbsp;·&nbsp; ' +
			'<strong>%</strong> ton pourcentage de validation<br><br>' +
			"Et l'<strong>engrenage</strong> ouvre le détail complet du projet : durée, taille d'équipe, prérequis, description.",
		position: 'left',
		validation: 'button',
	},

	{
		id: 'step-prof-exp',
		target: 'prof-exp-section',
		title: 'Stages et alternances',
		text: "Ils comptent lourd dans le RNCP : ajoute-les ici pour que la projection soit juste.",
		position: 'top',
		validation: 'button',
	},



	{
		id: 'step-end',
		title: "C'est tout !",
		text: "Le <strong>calendrier</strong> te laisse étaler ces projets dans le temps.<br><br>Bonne simulation.",
		validation: 'button',
	},
];
