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

export const TOUR_STEPS: TourStepDef[] = [

	// =========================================================================
	// SECTION 1 — Présentation générale
	// =========================================================================

	{
		id: 'step-welcome',
		title: 'Bienvenue sur CalculatorGCC',
		text: 'Ce simulateur vous permet de <strong>calculer et projeter votre niveau RNCP</strong> en fonction de vos projets 42 et de vos expériences professionnelles.<br><br>Suivez ce guide pour découvrir les fonctionnalités principales.',
		validation: 'button',
	},

	{
		id: 'step-nav',
		target: 'header-nav',
		title: 'Navigation',
		text: 'Accédez aux différentes pages de l\'application :<br>• <strong>Projets</strong> — simulateur RNCP<br>• <strong>Calendrier</strong> — visualisez votre planning de formation',
		position: 'bottom',
		validation: 'button',
	},

	{
		id: 'step-guide-button',
		target: 'guide-button',
		title: 'Relancer le guide',
		text: 'Ce bouton vous permet de <strong>relancer ce guide à tout moment</strong> depuis n\'importe quelle page.',
		position: 'bottom',
		validation: 'button',
	},

	// =========================================================================
	// SECTION 2 — Niveaux & onglets RNCP
	// =========================================================================

	{
		id: 'step-level',
		target: 'welcome-section',
		title: 'Niveau actuel et niveau projeté',
		text: 'Votre <strong>niveau actuel</strong> provient directement de l\'API 42.<br><br>Le <strong>niveau projeté</strong> se recalcule automatiquement dès que vous simulez des projets ou ajoutez des expériences professionnelles.',
		position: 'bottom',
		validation: 'button',
	},

	{
		id: 'step-rncp-tabs',
		target: 'rncp-tabs',
		title: 'Certifications RNCP disponibles',
		text: 'Ces onglets représentent les différentes certifications RNCP accessibles (niveaux 6 et 7).<br><br>Un <strong>✓</strong> apparaît sur l\'onglet dès que vous remplissez tous les critères de cette certification.',
		position: 'bottom',
		validation: 'button',
	},

	// =========================================================================
	// SECTION 3 — Vue globale & projets personnalisés
	// =========================================================================

	{
		id: 'step-rncp-global',
		target: 'rncp-global-tab',
		title: 'Vue globale',
		text: 'Cet onglet regroupe les <strong>projets communs à tous les RNCP</strong> (suite, projets de groupe…) ainsi qu\'une section <em>Autres projets</em>.<br><br><div class="gcc-tour-action-hint">👆 Cliquez sur cet onglet pour l\'explorer.</div>',
		position: 'bottom',
		// L'utilisateur doit cliquer l'onglet : ça le sélectionne et révèle la section "Autres projets"
		validation: 'click',
		canClose: true,
		blocking: false,
		preventSkip: true,
	},

	{
		id: 'step-add-custom',
		target: 'add-custom-project',
		title: 'Ajouter un projet non référencé',
		text: 'Vous avez fait un projet qui <strong>n\'est pas listé sur le site</strong> ? Ajoutez-le ici en renseignant son nom et son XP.<br><br>Il sera pris en compte dans le calcul de votre niveau projeté.',
		position: 'right',
		validation: 'button',
	},

	// =========================================================================
	// SECTION 4 — Fonctionnalités des cartes projets
	// =========================================================================

	{
		id: 'step-teammate',
		target: 'teammate-btn',
		title: '👥 Trouver des teammates',
		text: 'Ce bouton affiche la liste des <strong>personnes ayant simulé ce projet</strong> sur CalculatorGCC.<br><br><em>Attention : ce n\'est pas la liste officielle des inscrits sur l\'intranet 42. Ce sont uniquement les utilisateurs du simulateur qui ont coché ce projet.</em>',
		position: 'right',
		validation: 'button',
	},

	{
		id: 'step-star',
		target: 'project-star',
		title: '☆ Simuler à 125 %',
		text: 'L\'<strong>étoile</strong> permet de simuler un projet avec un score de <strong>125 %</strong> (note maximale à 42).<br><br>Cliquer à nouveau dessus repasse à 100 %. Vous pouvez aussi saisir manuellement n\'importe quel pourcentage dans le champ.',
		position: 'right',
		validation: 'button',
	},

	{
		id: 'step-boost',
		target: 'project-boost',
		title: '⚡ Boost coalition',
		text: 'L\'<strong>éclair</strong> active le bonus de coalition <strong>+4,2 %</strong> sur l\'XP de ce projet.<br><br>Ce boost s\'applique si vous faites partie d\'une coalition lors de la validation. Il s\'ajoute au-dessus du pourcentage saisi.',
		position: 'right',
		validation: 'button',
	},

	// =========================================================================
	// SECTION 5 — Expériences pro & outils
	// =========================================================================

	{
		id: 'step-prof-exp',
		target: 'prof-exp-section',
		title: 'Expériences professionnelles',
		text: 'Vos <strong>stages et alternances</strong> détectés via l\'API 42 apparaissent ici.<br><br>Vous pouvez en ajouter manuellement via <em>+ Stage</em> ou <em>+ Alternance</em> pour simuler leur impact sur votre niveau projeté.',
		position: 'top',
		validation: 'button',
	},

	{
		id: 'step-refresh',
		target: 'refresh-button',
		title: 'Rafraîchir les données',
		text: 'Recharge vos données depuis l\'<strong>API 42</strong> pour obtenir les informations les plus récentes (projets validés, expériences, niveau actuel…).',
		position: 'left',
		validation: 'button',
	},

	{
		id: 'step-reset',
		target: 'reset-button',
		title: 'Réinitialiser la simulation',
		text: 'Supprime toutes vos simulations : projets cochés, pourcentages personnalisés et notes.<br><br><em>Vos données réelles (validations API 42) ne sont pas affectées.</em>',
		position: 'left',
		validation: 'button',
	},

	// =========================================================================
	// SECTION 6 — Navigation vers le Calendrier
	// =========================================================================

	{
		id: 'step-go-calendar',
		target: 'nav-calendar',
		title: 'Découvrez le Calendrier',
		text: 'Le <strong>Calendrier</strong> vous permet de visualiser votre planning de formation en fonction des projets que vous avez simulés.<br><br><em>Assurez-vous d\'avoir simulé au moins un projet pour voir votre planning projeté.</em><br><br><div class="gcc-tour-action-hint">👆 Cliquez sur <strong>Calendrier</strong> pour continuer le guide.</div>',
		position: 'bottom',
		// L'utilisateur DOIT naviguer vers le calendrier — aucune échappatoire
		validation: 'click',
		preventSkip: true,
	},

	// =========================================================================
	// SECTION 7 — Fonctionnalités du Calendrier
	// =========================================================================

	{
		id: 'step-calendar-import',
		target: 'calendar-import-btn',
		title: 'Importer votre planning d\'alternance',
		text: 'Si vous êtes en alternance, vous pouvez importer votre planning depuis le site <strong>CFA 42</strong> :<br><ol style="margin: 0.5rem 0 0 1.2rem; padding: 0;"><li>Allez sur <strong>cfa.42.fr</strong></li><li>Cliquez sur <strong>Calendrier</strong></li><li>Cliquez sur <strong>Télécharger le calendrier</strong> (fichier .xlsx)</li><li>Importez-le ici avec ce bouton</li></ol><br>Vos semaines école / entreprise s\'afficheront alors sur le calendrier.',
		position: 'top',
		validation: 'button',
	},

	// =========================================================================
	// SECTION 8 — Fin du guide
	// =========================================================================

	{
		id: 'step-end',
		title: 'Vous êtes prêt !',
		text: 'Vous connaissez maintenant les fonctionnalités principales de <strong>CalculatorGCC</strong>.<br><br>Simulez vos projets, ajoutez vos expériences et projetez votre niveau RNCP.<br>Bonne simulation !',
		validation: 'button',
	},
];
