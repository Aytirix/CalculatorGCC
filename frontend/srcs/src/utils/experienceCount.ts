/**
 * Combien d'expériences professionnelles vaut une entrée ?
 *
 * LA RÈGLE, unique : une alternance compte pour son nombre d'ANNÉES — 2 ans font
 * 2 expériences, 1 an en fait 1 — et tout le reste compte pour 1.
 *
 * Elle vivait en QUATRE exemplaires qui ne disaient pas la même chose : les
 * expériences validées de l'API comptaient `.length` (une alternance de 2 ans
 * valait 1), celles en cours extrayaient les années du nom, les simulations
 * manuelles codaient `duration === 2 ? 2 : 1` — donc 1 pour une alternance de
 * 3 ans — et les manuelles acquises ajoutaient `duration`. Un même parcours
 * donnait donc un décompte différent selon d'où venait la donnée, et une
 * alternance de 2 ans validée dans l'API faisait perdre un point de prérequis
 * RNCP sans recours.
 */

/** Une entrée manuelle ou de l'API, ramenée à son nombre d'expériences. */
export function nombreExperiences(estAlternance: boolean, annees: number): number {
	if (!estAlternance) return 1;
	// Une durée absente, nulle ou aberrante vaut une année : mieux vaut compter
	// l'expérience une fois que de la faire disparaître du décompte.
	return Number.isFinite(annees) && annees >= 1 ? Math.floor(annees) : 1;
}

/**
 * Nombre d'années lu dans le nom d'un projet 42 (« Alternance 2 ans »).
 *
 * L'API ne porte pas la durée dans un champ : elle est dans le libellé. Sans
 * correspondance, on compte une année.
 */
export function anneesDepuisNom(nom: string): number {
	const trouve = nom.toLowerCase().match(/(\d+)\s*an/);
	return trouve ? parseInt(trouve[1], 10) : 1;
}
