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
	if (!Number.isFinite(annees) || annees < 1) return 1;
	// Plafonné : la durée n'est pas validée côté serveur, et un `duration: 1e9`
	// affichait « 1 000 000 000 expériences professionnelles projetées » — y compris
	// à qui consulte le profil. Dix ans dépasse déjà tout parcours réel.
	return Math.min(10, Math.floor(annees));
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

/** Une expérience telle que l'API 42 la décrit, réduite à ce qui décide du décompte. */
export interface EntreeApi {
	nom: string;
	slug: string;
	validated: boolean;
}

/**
 * Ligne à ne JAMAIS compter : l'API 42 expose les sous-projets d'un stage
 * — « Duration », « Peer Video », « Contract Upload », les évaluations — comme des
 * projets à part entière, dont le slug répète celui du parent
 * (`work-experience-i-work-experience-i-duration`). Les compter ajoutait quatre
 * expériences professionnelles par stage.
 *
 * Les deux compteurs, validé et en cours, appliquaient cette exclusion chacun de
 * leur côté, dans un ordre différent : deux copies à maintenir pour une seule règle.
 */
export function estSousProjetOuEvaluation(nom: string, slug: string): boolean {
	const n = nom.toLowerCase();
	const s = slug.toLowerCase();
	if (n.includes('évaluation') || n.includes('evaluation')) return true;
	if (s.startsWith('work-experience-') && s.includes('-work-experience-', 16)) return true;
	return n.includes('peer video') || n.includes('contract upload') || n.includes('duration');
}

/** Cette ligne parle-t-elle d'un stage ou d'une alternance, validé ou non ? */
export function estExperienceApi(nom: string, slug: string): boolean {
	const n = nom.toLowerCase();
	const s = slug.toLowerCase();
	return (
		s.includes('stage') || s.includes('alternance') || s.includes('internship') ||
		s.startsWith('work-experience') || s.startsWith('fr-alternance') ||
		n.includes('stage') || n.includes('alternance') || n.includes('internship') ||
		n.includes('work experience')
	);
}

/** Une expérience professionnelle EN COURS : reconnue, non validée, pas un sous-projet. */
export function estExperienceEnCours(entree: EntreeApi): boolean {
	if (entree.validated) return false;
	if (estSousProjetOuEvaluation(entree.nom, entree.slug)) return false;
	const nom = entree.nom.toLowerCase();
	const slug = entree.slug.toLowerCase();
	return (
		nom.includes('alternance') || nom.includes('stage') || nom.includes('internship') ||
		slug.startsWith('work-experience-')
	);
}

/** Une expérience professionnelle ACQUISE selon l'API. */
export function estExperienceValidee(entree: EntreeApi): boolean {
	if (!entree.validated) return false;
	if (!estExperienceApi(entree.nom, entree.slug)) return false;
	return !estSousProjetOuEvaluation(entree.nom, entree.slug);
}

/** Le décompte d'un lot d'entrées, règle des années comprise. */
function compter(entrees: EntreeApi[]): number {
	return entrees.reduce((total, entree) => {
		const nom = entree.nom.toLowerCase();
		return total + nombreExperiences(nom.includes('alternance'), anneesDepuisNom(nom));
	}, 0);
}

/** Les expériences EN COURS côté API. */
export function compterExperiencesApi(entrees: EntreeApi[]): number {
	return compter(entrees.filter(estExperienceEnCours));
}

/**
 * Les expériences ACQUISES côté API.
 *
 * `.length` comptait une alternance de 2 ans pour UNE expérience, là où les trois
 * autres compteurs en voyaient deux : son titulaire perdait un point de prérequis
 * RNCP, sans aucun recours.
 */
export function compterExperiencesApiValidees(entrees: EntreeApi[]): number {
	return compter(entrees.filter(estExperienceValidee));
}
