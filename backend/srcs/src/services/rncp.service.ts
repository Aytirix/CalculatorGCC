import { API42Service, SlimProject } from './api42.service.js';
import { api42CacheRepository } from '../db/api42CacheRepository.js';
import {
	RNCP_REFERENTIAL,
	RncpReferentialProject,
	RncpReferentialSubProject,
} from '../data/rncpReferential.js';

/**
 * Construit le référentiel RNCP complet : notre structure (quel RNCP exige quels
 * projets) enrichie du nom et de l'XP réels lus sur l'API 42.
 *
 * Avant, ces valeurs étaient recopiées à la main dans le front et divergeaient
 * de la réalité (kfs-3 à 3 570 XP au lieu de 35 700, corewar à 35 700 au lieu de
 * 17 500…). Elles viennent maintenant du catalogue du cursus, déjà mis en cache
 * un mois pour le Holy Graph : aucune requête supplémentaire vers 42.
 */

/** Cursus de référence : c'est là que vivent les projets du référentiel RNCP. */
const RNCP_CURSUS_ID = 21;

const CACHE_KEY = 'rncp_referential';

export interface RncpProject {
	id: string;
	name: string;
	xp: number;
	slug?: string;
	maxPercentage?: number;
	subProjects?: RncpProject[];
}

export interface RncpCategory {
	id: string;
	name: string;
	requiredCount: number;
	requiredXP: number;
	projects: RncpProject[];
}

export interface RncpEntry {
	id: string;
	name: string;
	level: number;
	requiredEvents: number;
	requiredProfessionalExperience: number;
	categories: RncpCategory[];
}

let memoryCache: { data: RncpEntry[]; at: number } | null = null;

/**
 * Le slug servi au front est celui de 42 SANS son préfixe de cursus
 * (`42cursus-libft` → `libft`) : c'est sous cette forme qu'il correspond aux
 * noms de projets validés remontés par l'API dans l'instantané utilisateur.
 */
function displaySlug(slug42: string): string {
	return slug42.replace(/^42cursus-/, '');
}

function buildProject(
	entry: RncpReferentialProject | RncpReferentialSubProject,
	catalog: Map<string, SlimProject>
): RncpProject | null {
	const source = entry.slug42 ? catalog.get(entry.slug42) : undefined;

	// Projet retiré du catalogue 42 (ex. gbmu) : on garde ce que le référentiel
	// en dit, sinon il disparaîtrait des exigences du RNCP.
	if (!source) {
		if (!entry.fallback) return null;
		return {
			id: entry.id,
			name: entry.fallback.name,
			xp: entry.fallback.xp,
			slug: entry.id,
			...('maxPercentage' in entry && entry.maxPercentage !== undefined
				? { maxPercentage: entry.maxPercentage }
				: {}),
		};
	}

	const subEntries = 'subProjects' in entry ? entry.subProjects : undefined;
	const subProjects = subEntries
		?.map((sub) => buildProject(sub, catalog))
		.filter((p): p is RncpProject => p !== null);

	// Une piscine porte un XP nul côté 42 : le sien est celui de ses modules.
	const xp =
		subProjects && subProjects.length > 0
			? subProjects.reduce((sum, sub) => sum + sub.xp, 0)
			: source.difficulty;

	return {
		id: entry.id,
		name: source.name.trim(),
		xp,
		slug: displaySlug(source.slug),
		...('maxPercentage' in entry && entry.maxPercentage !== undefined
			? { maxPercentage: entry.maxPercentage }
			: {}),
		...(subProjects && subProjects.length > 0 ? { subProjects } : {}),
	};
}

export const rncpService = {
	/**
	 * Référentiel complet, ou `null` tant que le catalogue du cursus n'est pas
	 * en cache (l'appelant relance alors sa récupération en tâche de fond).
	 */
	async build(): Promise<RncpEntry[] | null> {
		if (memoryCache) return memoryCache.data;

		const projects = API42Service.getCursusProjectsCached(RNCP_CURSUS_ID);
		if (!projects) {
			// Le catalogue n'est pas encore en mémoire : on se rabat sur le dernier
			// référentiel construit, pour ne pas laisser le Dashboard sans données
			// pendant qu'il se remplit (ou si l'API 42 est injoignable).
			const persisted = await api42CacheRepository.getFresh<RncpEntry[]>(CACHE_KEY);
			if (persisted) {
				memoryCache = { data: persisted, at: Date.now() };
				return persisted;
			}
			return null;
		}

		const catalog = new Map<string, SlimProject>();
		for (const project of projects) catalog.set(project.slug, project);

		const data: RncpEntry[] = RNCP_REFERENTIAL.map((rncp) => ({
			id: rncp.id,
			name: rncp.name,
			level: rncp.level,
			requiredEvents: rncp.requiredEvents,
			requiredProfessionalExperience: rncp.requiredProfessionalExperience,
			categories: rncp.categories.map((category) => ({
				id: category.id,
				name: category.name,
				requiredCount: category.requiredCount,
				requiredXP: category.requiredXP,
				projects: category.projects
					.map((project) => buildProject(project, catalog))
					.filter((p): p is RncpProject => p !== null),
			})),
		}));

		memoryCache = { data, at: Date.now() };
		await api42CacheRepository.set(CACHE_KEY, data);
		console.log(
			`[RNCP] Référentiel construit depuis le catalogue 42 : ${data.length} RNCP, ` +
			`${data.reduce((n, r) => n + r.categories.reduce((m, c) => m + c.projects.length, 0), 0)} projets`
		);
		return data;
	},

	/** Oublie le référentiel construit (refresh global de l'admin). */
	clearCache(): void {
		memoryCache = null;
	},

	/** Amorce la récupération du catalogue si nécessaire. */
	ensureCatalog(): void {
		API42Service.ensureCursusProjectsFetching(RNCP_CURSUS_ID);
	},
};
