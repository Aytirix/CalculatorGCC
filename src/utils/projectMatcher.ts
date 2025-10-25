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
  
  // Le projet local doit au moins être contenu dans le slug de l'API
  const matches = normalizedApi.includes(normalizedLocal);
  
  if (matches) {
    console.log(`✅ Match trouvé: "${localSlug}" → "${apiSlug}" (normalisés: "${normalizedLocal}" ⊂ "${normalizedApi}")`);
  }
  
  return matches;
};

/**
 * Vérifie si un projet local correspond à au moins un slug de l'API
 * 
 * @param localSlug - Le slug du projet dans nos données locales
 * @param apiSlugs - Liste des slugs retournés par l'API
 * @returns true si le projet local correspond à au moins un slug de l'API
 */
export const isProjectCompleted = (localSlug: string, apiSlugs: string[]): boolean => {
  return apiSlugs.some(apiSlug => matchesProject(localSlug, apiSlug));
};
