/**
 * Permissions du panneau admin.
 *
 * Deux façons d'entrer dans le panneau, et une seule liste de droits :
 *  - l'OWNER (session ouverte par token console) a tout, sans exception ;
 *  - un DÉLÉGUÉ (JWT 42 + login enregistré) n'a que les zones qu'on lui a cochées.
 *
 * Les permissions sont stockées en CSV sur `admin_delegate.permissions`. Un CSV
 * plutôt qu'une table de jointure : il y a sept valeurs, elles ne changent qu'au
 * rythme des zones du panneau, et une jointure obligerait à une requête de plus
 * sur un chemin qui s'exécute à chaque requête admin.
 */

/** Les zones du panneau, une par domaine fonctionnel. */
export const ADMIN_PERMISSIONS = [
	'secrets42',
	'referential',
	'refresh',
	'origins',
	'mirror',
	'audit',
	'delegates',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/** Libellés affichés dans le panneau, pour ne pas les réécrire côté front. */
export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, string> = {
	secrets42: 'Secrets 42',
	referential: 'Référentiel RNCP',
	refresh: 'Refresh global des données 42',
	origins: 'Origines autorisées',
	mirror: 'Mode miroir',
	audit: "Journal d'audit",
	delegates: 'Gestion des délégués',
};

function isPermission(value: string): value is AdminPermission {
	return (ADMIN_PERMISSIONS as readonly string[]).includes(value);
}

/**
 * Lit le CSV stocké en base.
 *
 * Tolérant à la relecture : espaces, doublons et valeurs inconnues sont écartés
 * plutôt que de faire échouer la requête. Une permission retirée du code après
 * un déploiement se retrouverait sinon à bloquer tout le panneau pour un délégué
 * dont la ligne la mentionne encore.
 */
export function parsePermissions(csv: string | null | undefined): AdminPermission[] {
	if (!csv) return [];
	const vues = new Set<AdminPermission>();
	for (const brut of csv.split(',')) {
		const valeur = brut.trim();
		if (isPermission(valeur)) vues.add(valeur);
	}
	return [...vues];
}

/** Normalise une liste reçue du panneau avant de l'écrire. Ordre stable. */
export function serializePermissions(permissions: readonly string[]): string {
	const gardees = ADMIN_PERMISSIONS.filter((p) => permissions.includes(p));
	return gardees.join(',');
}
