import { prisma } from './connection.js';

/**
 * Cache PERSISTANT des données de référence 42 (catalogue d'un cursus, layout
 * officiel du Holy Graph).
 *
 * Ces données sont identiques pour tous les utilisateurs et ne bougent
 * quasiment jamais : les garder en base évite qu'un simple redémarrage du
 * backend relance des dizaines de requêtes vers l'API 42. La durée de vie est
 * volontairement longue (un mois) ; l'admin peut forcer un renouvellement
 * avant terme via le refresh global.
 */
export const API42_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const CACHE_KEY_PROJECT_DATA = 'project_data';
export const cacheKeyCursusProjects = (cursusId: number) => `cursus_projects:${cursusId}`;
/** Compétences (= « layers » du graphe officiel) par projet, pour un cursus et un campus. */
export const cacheKeyProjectSkills = (cursusId: number, campusId: number | null) =>
	`project_skills:${cursusId}:${campusId ?? 'all'}`;

export const api42CacheRepository = {
	/** Contenu du cache s'il existe ET qu'il est encore frais, sinon `null`. */
	async getFresh<T>(key: string): Promise<T | null> {
		const row = await prisma.api42Cache.findUnique({ where: { key } });
		if (!row) return null;
		if (Date.now() - row.fetchedAt.getTime() >= API42_CACHE_TTL_MS) return null;
		return row.payload as T;
	},

	async set(key: string, payload: unknown): Promise<void> {
		const data = { payload: payload as any, fetchedAt: new Date() };
		await prisma.api42Cache.upsert({
			where: { key },
			create: { key, ...data },
			update: data,
		});
	},

	/** Invalide une entrée (refresh global de l'admin). */
	async invalidate(key: string): Promise<void> {
		await prisma.api42Cache.deleteMany({ where: { key } });
	},

	/** Invalide tout le cache de référence. */
	async invalidateAll(): Promise<void> {
		await prisma.api42Cache.deleteMany({});
	},

	/** Dates de dernier remplissage, pour l'affichage côté admin. */
	async listEntries(): Promise<{ key: string; fetchedAt: Date }[]> {
		return prisma.api42Cache.findMany({
			select: { key: true, fetchedAt: true },
			orderBy: { key: 'asc' },
		});
	},
};
