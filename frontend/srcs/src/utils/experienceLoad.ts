import type { ProfessionalExperience } from '@/types/professionalExperience.types';

/**
 * Qui, du serveur ou du navigateur, fait autorité sur les expériences au
 * chargement — et ce qu'il faut écrire en conséquence.
 *
 * C'est la décision qui a produit le bug d'origine (« j'enregistre, j'actualise,
 * je perds l'information ») et chacune de ses rechutes : une liste vide venue du
 * serveur qu'on n'appliquait pas ressuscitait une suppression ; un drapeau de
 * synchronisation posé trop tôt transformait une panne réseau en perte
 * définitive. Elle vit donc hors du composant, où elle est éprouvable — les
 * tests de ce dépôt ne montent pas de DOM.
 */
export interface EtatChargement {
	/** On consulte le profil d'un AUTRE : rien de local ne doit apparaître ni être écrit. */
	viewingOther: boolean;
	/** Ce que la base renvoie, déjà normalisé. */
	distantes: ProfessionalExperience[];
	/** Ce que ce navigateur détient. Vide en consultation. */
	locales: ProfessionalExperience[];
	/** Ce navigateur a-t-il déjà poussé ses expériences au moins une fois ? */
	dejaSynchronise: boolean;
}

export interface VerdictChargement {
	/** Ce qu'on affiche. */
	afficher: ProfessionalExperience[];
	/** Faut-il recopier `afficher` dans le stockage local ? */
	ecrireLocal: boolean;
	/** Faut-il poser le drapeau de première synchronisation ? */
	marquerSynchronise: boolean;
	/** Liste à faire MONTER en base, ou `null`. Le drapeau attend sa réussite. */
	monter: ProfessionalExperience[] | null;
}

export function resoudreExperiences(etat: EtatChargement): VerdictChargement {
	// Profil d'un autre : ses expériences, et rien d'écrit nulle part. Y compris
	// quand il n'en a aucune — sinon les miennes, globales au navigateur, restent
	// à l'écran et faussent SON niveau projeté.
	if (etat.viewingOther) {
		return { afficher: etat.distantes, ecrireLocal: false, marquerSynchronise: false, monter: null };
	}

	// Première synchronisation de ce navigateur, base vide, expériences locales :
	// elles ne vivaient qu'ici avant que la persistance existe. On les fait monter
	// au lieu de les effacer. Le drapeau n'est PAS posé ici : il attend la réussite
	// de la montée, sans quoi une panne réseau vide définitivement le local au
	// chargement suivant.
	if (!etat.dejaSynchronise && etat.distantes.length === 0 && etat.locales.length > 0) {
		return {
			afficher: etat.locales,
			ecrireLocal: false,
			marquerSynchronise: false,
			monter: etat.locales,
		};
	}

	// Sinon la BASE fait autorité, liste vide comprise : une suppression faite sur
	// un appareil ne doit pas ressusciter depuis un autre resté ouvert.
	return { afficher: etat.distantes, ecrireLocal: true, marquerSynchronise: true, monter: null };
}
