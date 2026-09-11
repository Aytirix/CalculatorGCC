import type { ProfessionalExperience } from '@/types/professionalExperience.types';

/**
 * Les décisions des formulaires d'expérience, sorties des composants.
 *
 * Ce n'est pas du rangement : un audit par mutation a montré que tant que le
 * bornage et le calcul d'XP vivaient dans le corps du composant, on pouvait
 * remplacer `Math.min` par `Math.max`, `0` par `-Infinity` ou le facteur de boost
 * par n'importe quoi sans faire tomber un seul test. Les tests de ce dépôt ne
 * montent pas de DOM ; ce qui n'est pas une fonction pure n'est pas éprouvé.
 */

export const POURCENTAGE_MIN = 0;
export const POURCENTAGE_MAX = 125;

/** XP d'une alternance validée à 100 %, pour une année. */
export const XP_PAR_AN = 90_000;

/** Le boost de coalition, en pourcentage de l'XP de base. */
export const BOOST_COALITION = 4.2;

/** Ramène un pourcentage dans [0, 125]. */
export function bornerPourcentage(valeur: number): number {
	if (!Number.isFinite(valeur)) return POURCENTAGE_MIN;
	return Math.min(POURCENTAGE_MAX, Math.max(POURCENTAGE_MIN, valeur));
}

/**
 * Le pourcentage RÉELLEMENT en vigueur pendant la frappe.
 *
 * Un champ vidé conserve la valeur précédente au lieu de tomber à zéro : « tout
 * sélectionner, effacer, regarder ailleurs » faisait sinon chuter le pourcentage
 * à 0 % et l'XP à 0. Le bornage n'a lieu qu'ici — borner à chaque frappe rendait
 * la valeur inatteignable, depuis 100 taper un chiffre donnait « 1002 » ramené à
 * 125, d'où l'on ne sortait plus.
 */
export function pourcentageEffectif(texte: string, precedent: number): number {
	const saisi = parseInt(texte, 10);
	if (!Number.isFinite(saisi)) return precedent;
	return bornerPourcentage(saisi);
}

/** L'XP d'une alternance : 90 000 par an, au prorata de la note, boost compris. */
export function xpAlternance(annees: number, pourcentage: number, boost: boolean): number {
	const base = XP_PAR_AN * annees * (pourcentage / 100);
	return Math.round(base + (boost ? (base * BOOST_COALITION) / 100 : 0));
}

/**
 * L'interrupteur « Expérience déjà acquise » à l'ouverture du formulaire.
 *
 * `simulationExplicite` distingue un `isSimulation: false` CHOISI d'un `false`
 * qui n'était qu'une valeur codée en dur dans les formulaires d'avant. Sans cette
 * distinction, rouvrir une vieille expérience la déclarait acquise et la faisait
 * compter dans les prérequis RNCP alors que personne ne l'avait jamais dit.
 */
export function dejaAcquiseInitiale(initialValues?: ProfessionalExperience | null): boolean {
	return initialValues?.simulationExplicite === true ? !initialValues.isSimulation : false;
}
