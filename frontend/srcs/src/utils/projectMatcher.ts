/**
 * Normalise un nom ou un slug de projet (recherche texte, dernier recours du
 * rapprochement par nom EXACT dans `projectIdentity`). Les projets se
 * rapprochent par identifiant 42 : plus aucune comparaison « contient ».
 *
 * - Convertit en minuscules
 * - Retire tous les accents
 * - Retire tous les tirets, underscores et espaces
 * - Retire les caractères spéciaux
 */
export const normalizeProjectSlug = (slug: string): string => {
	return slug
		.toLowerCase()
		// Retirer les accents
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		// Retirer tous les tirets, underscores et espaces
		.replace(/[-_\s]/g, '')
		// Retirer les caractères spéciaux sauf lettres et chiffres
		.replace(/[^a-z0-9]/g, '');
};
