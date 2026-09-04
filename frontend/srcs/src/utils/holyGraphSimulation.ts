import { RNCP_DATA } from '@/data/rncp.data';
import type { SimulatorProject } from '@/types/rncp.types';
import { normalizeProjectSlug } from './projectMatcher';

/**
 * Fait le pont entre un projet du Holy Graph (API 42) et la simulation du
 * Dashboard, qui raisonne sur les identifiants de nos données RNCP.
 *
 * Deux cas :
 *  - le projet existe dans nos données RNCP → on réutilise SON identifiant, et
 *    la simulation est exactement celle du Dashboard (XP, validation RNCP,
 *    réconciliation automatique quand le projet est réellement validé) ;
 *  - il n'y existe pas (tronc commun, examens, cursus secondaires) → on le
 *    simule sous l'identifiant `42-<id du projet 42>`, avec l'XP remonté par
 *    l'API 42 stocké dans `customProjects` pour que le Dashboard sache le
 *    compter.
 */

export interface GraphProjectRef {
	id: number;
	name: string;
	slug: string;
}

/** Identifiant de simulation d'un projet 42 absent de nos données RNCP. */
export const graphSimulationId = (projectId42: number): string => `42-${projectId42}`;

/** Un identifiant de simulation issu du Holy Graph (et pas des données RNCP) ? */
export const isGraphSimulationId = (id: string): boolean => /^42-\d+$/.test(id);

/**
 * Index nom/slug normalisé → projet RNCP. Construit une seule fois : les
 * données RNCP sont statiques.
 */
let rncpIndex: Map<string, SimulatorProject> | null = null;

function getRncpIndex(): Map<string, SimulatorProject> {
	if (rncpIndex) return rncpIndex;

	const index = new Map<string, SimulatorProject>();
	for (const rncp of RNCP_DATA) {
		for (const category of rncp.categories) {
			for (const project of category.projects) {
				for (const key of [project.id, project.slug, project.name]) {
					if (!key) continue;
					const normalized = normalizeProjectSlug(key);
					if (normalized && !index.has(normalized)) index.set(normalized, project);
				}
			}
		}
	}

	rncpIndex = index;
	return index;
}

/**
 * Projet RNCP correspondant à un projet du graphe, ou `null`.
 *
 * Les slugs de l'API 42 portent souvent un préfixe de cursus (`42cursus-kfs-1`)
 * que nos données n'ont pas (`kfs-1`) : on teste donc aussi la version sans
 * préfixe, en plus du nom.
 */
export function findRncpProject(project: GraphProjectRef): SimulatorProject | null {
	const index = getRncpIndex();
	const candidates = [project.slug.replace(/^42cursus-/, ''), project.slug, project.name];
	for (const candidate of candidates) {
		const found = index.get(normalizeProjectSlug(candidate));
		if (found) return found;
	}
	return null;
}
