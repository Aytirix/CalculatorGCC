import { clampProjectPercentage } from '@/utils/projectPercentage';

/**
 * Normalise un slug de projet pour permettre une comparaison plus permissive
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

/**
 * Vérifie si un projet local correspond à un projet de l'API
 * Le projet local doit être contenu dans le slug de l'API (pas forcément égal)
 * 
 * @param localSlug - Le slug du projet dans nos données locales
 * @param apiSlug - Le slug du projet retourné par l'API
 * @returns true si le projet local est trouvé dans le slug de l'API
 */
export const matchesProject = (localSlug: string, apiSlug: string): boolean => {
	const normalizedLocal = normalizeProjectSlug(localSlug);
	const normalizedApi = normalizeProjectSlug(apiSlug);

	// Les slugs courts (≤ 3 chars) ne doivent pas utiliser le matching permissif
	// pour éviter les faux positifs (ex: "rt" détecté dans "minirt")
	if (normalizedLocal.length <= 3) return false;

	const matches = normalizedApi.includes(normalizedLocal);
	return matches;
};

/**
 * Vérifie si un projet local correspond à au moins un slug/name de l'API
 * 
 * @param localSlug - Le slug ou name du projet dans nos données locales
 * @param apiIdentifiers - Liste des slugs ou names retournés par l'API
 * @returns true si le projet local correspond à au moins un identifiant de l'API
 */
export const isProjectCompleted = (localSlug: string, apiIdentifiers: string[]): boolean => {
	// D'abord chercher une correspondance exacte (case-insensitive)
	const exactMatch = apiIdentifiers.some(apiId =>
		apiId.toLowerCase() === localSlug.toLowerCase()
	);

	if (exactMatch) {
		return true;
	}

	// Sinon utiliser le matching permissif (normalisé)
	const matches = apiIdentifiers.some(apiId => matchesProject(localSlug, apiId));
	return matches;
};

/**
 * Trouve le pourcentage d'un projet en utilisant la normalisation
 * Cherche avec name, slug, id en utilisant la normalisation pour le matching
 * 
 * @param project - Le projet local avec name, slug et id
 * @param percentages - Record des pourcentages avec les clés de l'API
 * @param defaultValue - Valeur par défaut si aucun match (default: 100)
 * @returns Le pourcentage trouvé ou la valeur par défaut
 */
export const findProjectPercentage = (
	project: { name: string; slug?: string; id: string; maxPercentage?: number },
	percentages: Record<string, number>,
	defaultValue: number = 100
): number => {
	// 1. Chercher correspondance exacte avec name
	if (percentages[project.name] !== undefined) {
		return clampProjectPercentage(percentages[project.name], project);
	}

	// 2. Chercher correspondance exacte avec slug
	if (project.slug && percentages[project.slug] !== undefined) {
		return clampProjectPercentage(percentages[project.slug], project);
	}

	// 3. Chercher correspondance exacte avec id
	if (percentages[project.id] !== undefined) {
		return clampProjectPercentage(percentages[project.id], project);
	}

	// 4. Chercher avec normalisation
	const normalizedProjectName = normalizeProjectSlug(project.name);
	const normalizedProjectSlug = project.slug ? normalizeProjectSlug(project.slug) : '';

	for (const [key, value] of Object.entries(percentages)) {
		const normalizedKey = normalizeProjectSlug(key);

		// Vérifier si le nom normalisé du projet correspond
		if (normalizedKey === normalizedProjectName || normalizedKey.includes(normalizedProjectName)) {
			return clampProjectPercentage(value, project);
		}

		// Vérifier si le slug normalisé correspond
		if (normalizedProjectSlug && (normalizedKey === normalizedProjectSlug || normalizedKey.includes(normalizedProjectSlug))) {
			return clampProjectPercentage(value, project);
		}
	}

	console.warn(`📊 Aucun pourcentage trouvé pour "${project.name}", utilisation de la valeur par défaut: ${defaultValue}%`);
	return clampProjectPercentage(defaultValue, project);
};
