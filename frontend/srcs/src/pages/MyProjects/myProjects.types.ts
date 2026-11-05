import type { Project42 } from '@/services/backend-api42.service';
import type { RNCP, SimulatorProject } from '@/types/rncp.types';
import { normalizeProjectSlug } from '@/utils/projectMatcher';
import { graphSimulationId, isGraphSimulationId } from '@/utils/holyGraphSimulation';
import { bestMark, createProjectLookup } from '@/utils/projectIdentity';
import { isPoolCovered, simulatedPoolXP } from '@/services/xp.service';
import { simulatedGain } from '@/utils/simulationEdit';

/**
 * Assemblage de TOUT ce que l'utilisateur a comme relation avec un projet :
 * ce qu'il a validé, raté, commencé, simulé, ou pas encore touché.
 *
 * Trois sources se rejoignent ici :
 *  - le référentiel RNCP (ce qui compte pour un diplôme) ;
 *  - son instantané 42 (ce qu'il a réellement fait, y compris le tronc commun,
 *    absent du référentiel) ;
 *  - sa simulation (projets prévus, dont ceux ajoutés depuis le Holy Graph et
 *    les projets personnalisés d'avant).
 */

export type ProjectStatus =
	| 'validated'
	| 'failed'
	| 'in_progress'
	| 'simulated'
	| 'not_started';

export type ProjectSource = 'rncp' | 'extra42' | 'custom';

export interface MyProjectRow {
	/** Identifiant de simulation quand il en existe un, sinon un id d'affichage. */
	id: string;
	name: string;
	slug: string;
	xp: number;
	status: ProjectStatus;
	source: ProjectSource;
	/** Note finale 42 (projet réellement rendu). */
	finalMark: number | null;
	/**
	 * Le projet est-il dans la simulation ?
	 *
	 * ORTHOGONAL à `status` : un projet peut être « en cours » côté 42 ET simulé,
	 * ou même validé et encore coché dans la simulation. Tant que l'information
	 * vivait dans `status`, l'état 42 l'écrasait et le projet disparaissait du
	 * filtre « Simulé » alors qu'il y était bel et bien.
	 */
	isSimulated: boolean;
	/** Pourcentage de validation choisi dans la simulation. */
	simulatedPercentage: number | null;
	/** Date de référence : correction pour un projet fait, inscription sinon. */
	date: string | null;
	/** RNCP dans lesquels ce projet compte. */
	rncpNames: string[];
	/** true si le projet peut être retiré (projet personnalisé hérité). */
	isCustom: boolean;
	/**
	 * Identifiant sous lequel le projet est (ou serait) simulé : celui du
	 * référentiel, `42-<id 42>` hors référentiel, `custom-…` pour un projet perso.
	 * Différent de `id` pour les lignes `api-…` / `catalog-…`.
	 */
	simId: string;
	/** Bonus coalition coché dans la simulation. */
	coalitionBoost: boolean;
	/** Note perso de la simulation. */
	note: string;
	/** Piscine : elle se simule module par module, depuis le Dashboard. */
	isPool: boolean;
	/**
	 * Module d'une piscine du référentiel (même identifiant `42-<id>`) : le
	 * cocher ici le compterait EN PLUS de la piscine — double XP.
	 */
	isPoolModule: boolean;
	/** Note maximale du projet (125 % par défaut). */
	maxPercentage: number | null;
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
	validated: 'Validé',
	failed: 'Raté',
	in_progress: 'En cours',
	simulated: 'Simulé',
	not_started: 'Non commencé',
};

export const SOURCE_LABELS: Record<ProjectSource, string> = {
	rncp: 'Référentiel RNCP',
	extra42: 'Hors référentiel',
	custom: 'Projet personnalisé',
};

/** Pourquoi la case « simuler » d'une ligne est inactive, ou null si elle est utilisable. */
export function simulationBlocker(
	row: Pick<MyProjectRow, 'isPool' | 'status' | 'isSimulated'> & Partial<Pick<MyProjectRow, 'isPoolModule'>>,
	readOnly: boolean,
): string | null {
	if (readOnly) return 'Consultation : la simulation n’est pas modifiable.';
	if (row.isPool) return 'Piscine : coche ses modules depuis le Dashboard.';
	if (row.isPoolModule && !row.isSimulated) return 'Module de piscine : coche-le dans sa piscine, depuis le Dashboard.';
	// Un projet validé encore coché (réconciliation pas encore passée) peut être décoché.
	if (row.status === 'validated' && !row.isSimulated) return 'Déjà validé : rien à simuler.';
	return null;
}

export type SortKey = 'name' | 'xp' | 'date' | 'mark' | 'status';

/** Ordre des puces et du tri par statut : ce qui demande une action d'abord. */
export const STATUS_ORDER: ProjectStatus[] = ['in_progress', 'simulated', 'validated', 'failed', 'not_started'];
const statusRank = (row: MyProjectRow) =>
	STATUS_ORDER.indexOf(row.status === 'not_started' && row.isSimulated ? 'simulated' : row.status);

/**
 * Ordre de la liste. Un projet SANS date (jamais commencé) va toujours en fin
 * de liste, dans un sens comme dans l'autre : compté comme 1970, il passait en
 * tête du tri croissant.
 */
export function compareRows(a: MyProjectRow, b: MyProjectRow, sort: SortKey, direction: 'asc' | 'desc'): number {
	const sign = direction === 'asc' ? 1 : -1;
	const byName = a.name.localeCompare(b.name, 'fr');
	switch (sort) {
		case 'name': return sign * byName;
		case 'xp': return sign * (a.xp - b.xp) || byName;
		case 'mark': return sign * ((a.finalMark ?? -1) - (b.finalMark ?? -1)) || byName;
		case 'date': {
			const ta = a.date ? new Date(a.date).getTime() : NaN;
			const tb = b.date ? new Date(b.date).getTime() : NaN;
			const hasA = !Number.isNaN(ta);
			const hasB = !Number.isNaN(tb);
			if (hasA !== hasB) return hasA ? -1 : 1;
			return (hasA ? sign * (ta - tb) : 0) || byName;
		}
		default: return sign * (statusRank(a) - statusRank(b)) || byName;
	}
}

/**
 * XP qu'un projet simulé ajoute, calculé EXACTEMENT comme le Dashboard :
 * hors référentiel, l'XP vient de `customProjects` (pas d'entrée = rien,
 * c'est le cas d'un ancien module de piscine coché seul) ; la note est bornée
 * au maximum du projet.
 */
export function simulatedRowGain(row: MyProjectRow, customXp: Map<string, number>, defaultMax: number): number {
	if (!row.isSimulated || row.isPool || row.status === 'validated') return 0;
	const xp = row.source === 'rncp' ? row.xp : (customXp.get(row.simId) ?? 0);
	if (xp <= 0) return 0;
	const pct = Math.min(row.simulatedPercentage ?? 100, row.maxPercentage ?? defaultMax);
	return simulatedGain(xp, pct, row.coalitionBoost);
}

/**
 * XP des piscines simulées (modules cochés), calculé comme le Dashboard. Une
 * piscine qui apparaît dans plusieurs titres n'est comptée qu'une fois.
 */
export function simulatedPoolsGain(
	rncpData: RNCP[],
	simulatedSubProjects: Record<string, string[]>,
	percentages: Record<string, number>,
	boosts: Record<string, boolean>,
	/** Piscines déjà validées sur l'intra : elles ne rapportent plus rien (comme le Dashboard une fois réconcilié). */
	validatedPoolIds: ReadonlySet<string> = new Set(),
): number {
	const pools = new Map<string, SimulatorProject>();
	for (const rncp of rncpData) {
		for (const category of rncp.categories) {
			for (const project of category.projects) {
				if (project.subProjects?.length && !pools.has(project.id)) pools.set(project.id, project);
			}
		}
	}
	let total = 0;
	for (const [poolId, subIds] of Object.entries(simulatedSubProjects)) {
		const pool = pools.get(poolId);
		if (validatedPoolIds.has(poolId)) continue;
		if (pool && Array.isArray(subIds)) total += simulatedPoolXP(pool, subIds, percentages[poolId] ?? 100, !!boosts[poolId]);
	}
	return total;
}

/** Statut d'un projet d'après son entrée `projects_users` côté 42. */
function statusFromApi(entry: Project42): ProjectStatus {
	if (entry.validated === true) return 'validated';
	if (entry.status === 'finished') return 'failed';
	return 'in_progress';
}

interface BuildInput {
	rncpData: RNCP[];
	apiProjects: Project42[];
	simulatedIds: string[];
	percentages: Record<string, number>;
	customProjects: SimulatorProject[];
	/** XP des projets 42 hors référentiel (tronc commun, examens…), par slug normalisé. */
	xpBySlug: Map<string, number>;
	/** XP des projets du catalogue par identifiant `42-<id>` (prioritaire sur `xpBySlug`). */
	xpById?: Map<string, number>;
	/** Catalogue du campus : complète la liste avec les projets jamais touchés. */
	catalog: { id: number; name: string; slug: string; xp: number }[];
	/** Bonus coalition et notes perso de la simulation, par identifiant de simulation. */
	boosts?: Record<string, boolean>;
	notes?: Record<string, string>;
	/** Modules de piscine simulés (une piscine est simulée quand ils la couvrent). */
	simulatedSubProjects?: Record<string, string[]>;
}

/**
 * Projets administratifs (contrats d'alternance, stages) : ils apparaissent dans
 * `projects_users` mais ne sont pas des projets au sens où on l'entend ici — ils
 * ont leur propre section « Expériences professionnelles ».
 */
const ADMIN_PROJECT_RE =
	/^(FR - Alternance|FR Apprentissage|Apprentissage |Work Experience|Part_Time|Startup Experience|Internship|Hive Internship|Hive Startup|Contract Upload|Duration|Évaluation|Evaluation)/i;

export function buildMyProjects({
	rncpData,
	apiProjects,
	simulatedIds,
	percentages,
	customProjects,
	xpBySlug,
	xpById = new Map(),
	catalog,
	boosts = {},
	notes = {},
	simulatedSubProjects = {},
}: BuildInput): MyProjectRow[] {
	const simulated = new Set(simulatedIds);
	const simExtras = (simId: string) => ({
		simId,
		coalitionBoost: simulated.has(simId) && !!boosts[simId],
		note: simulated.has(simId) ? (notes[simId] ?? '') : '',
	});

	// Modules des piscines du référentiel : ils se simulent DANS leur piscine.
	const poolModuleIds = new Set<string>();
	const poolModuleNames = new Set<string>();
	for (const rncp of rncpData) {
		for (const category of rncp.categories) {
			for (const project of category.projects) {
				for (const sub of project.subProjects ?? []) {
					poolModuleIds.add(sub.id);
					const key = normalizeProjectSlug(sub.name);
					if (key) poolModuleNames.add(key);
				}
			}
		}
	}
	const isPoolModule = (simId: string, name: string) =>
		poolModuleIds.has(simId) || poolModuleNames.has(normalizeProjectSlug(name));

	// Entrées de l'intra par IDENTIFIANT 42 (repli : nom exact unique). Un projet
	// repassé a plusieurs inscriptions : la validée prime, sinon la plus récente.
	const recent = (e: Project42) => Date.parse(e.marked_at ?? e.created_at ?? '') || 0;
	const lookup = createProjectLookup(
		apiProjects.filter((entry) => !ADMIN_PROJECT_RE.test(entry.project.name.trim())),
		// Validée d'abord ; deux validations : la meilleure note (comme le
		// Dashboard) ; sinon la plus récente.
		(candidate, current) => (candidate.validated === true) !== (current.validated === true)
			? candidate.validated === true
			: candidate.validated === true
				? bestMark(candidate, current)
				: recent(candidate) >= recent(current),
	);

	const rows: MyProjectRow[] = [];
	const usedApiProjects = new Set<number>();
	const seenIds = new Set<string>();

	// 1) Le référentiel RNCP, enrichi de ce que l'utilisateur en a fait.
	for (const rncp of rncpData) {
		for (const category of rncp.categories) {
			for (const project of category.projects) {
				const existing = rows.find((r) => r.id === project.id);
				if (existing) {
					if (!existing.rncpNames.includes(rncp.name)) existing.rncpNames.push(rncp.name);
					continue;
				}

				const entry = lookup.find(project);
				// Le PROJET est vu, pas une inscription : un projet repassé ne doit
				// pas réapparaître plus bas avec une autre de ses inscriptions.
				if (entry) usedApiProjects.add(entry.project.id);

				const isPool = !!project.subProjects?.length;
				const subs = simulatedSubProjects[project.id];
				const isSimulated = simulated.has(project.id)
					|| (isPool && !!subs && isPoolCovered(project, subId => subs.includes(subId)));
				rows.push({
					...simExtras(project.id),
					isPool,
					isPoolModule: false,
					maxPercentage: project.maxPercentage ?? null,
					id: project.id,
					name: project.name,
					slug: project.slug ?? project.id,
					xp: project.xp,
					status: entry ? statusFromApi(entry) : isSimulated ? 'simulated' : 'not_started',
					source: 'rncp',
					isSimulated,
					finalMark: entry?.final_mark ?? null,
					simulatedPercentage: isSimulated ? (percentages[project.id] ?? 100) : null,
					date: entry?.marked_at ?? entry?.created_at ?? null,
					rncpNames: [rncp.name],
					isCustom: false,
				});
				seenIds.add(project.id);
			}
		}
	}

	// 2) Ce que l'utilisateur a fait en dehors du référentiel : tronc commun,
	//    examens, projets d'autres cursus. C'est l'essentiel de son parcours.
	for (const entry of lookup.byId.values()) {
		if (usedApiProjects.has(entry.project.id)) continue;
		const name = entry.project.name.trim();
		if (ADMIN_PROJECT_RE.test(name)) continue;
		const id = `api-${entry.project.id}`;
		if (seenIds.has(id)) continue;
		seenIds.add(id);

		const slug = (entry.project.slug ?? '').replace(/^42cursus-/, '');
		const simId = graphSimulationId(entry.project.id);
		rows.push({
			...simExtras(simId),
			isPool: false,
			isPoolModule: isPoolModule(simId, name),
			maxPercentage: null,
			id,
			name,
			slug,
			// L'XP vient du catalogue du campus : ces projets ne sont pas dans le
			// référentiel RNCP, mais ils comptent bel et bien dans le niveau.
			// Par identifiant ; le nom exact (normalisé) n'est qu'un dernier recours.
			xp:
				xpById.get(simId) ??
				xpBySlug.get(normalizeProjectSlug(slug)) ??
				xpBySlug.get(normalizeProjectSlug(name)) ??
				0,
			status: statusFromApi(entry),
			source: 'extra42',
			// Hors référentiel, la simulation vit sous l'identifiant du Holy Graph
			// (« 42-<id 42> »). L'ignorer produisait DEUX lignes pour le même
			// projet : celle-ci, et une ligne « simulé » créée plus bas.
			isSimulated: simulated.has(simId),
			finalMark: entry.final_mark ?? null,
			// Le pourcentage simulé vit sous `42-<id>` : il n'était jamais affiché.
			simulatedPercentage: simulated.has(simId) ? (percentages[simId] ?? 100) : null,
			date: entry.marked_at ?? entry.created_at ?? null,
			rncpNames: [],
			isCustom: false,
		});
	}

	// 3) Le reste du catalogue du campus : les projets que l'utilisateur n'a
	//    jamais touchés. Ils sont masqués par défaut, mais leur présence rend la
	//    page exhaustive — et rend chaque projet trouvable depuis la recherche.
	const knownNames = new Set(rows.map((r) => normalizeProjectSlug(r.name)));
	for (const project of catalog) {
		const key = normalizeProjectSlug(project.name);
		if (!key || knownNames.has(key)) continue;
		// Contrats d'alternance, stages… : pas des projets (section Expériences).
		if (ADMIN_PROJECT_RE.test(project.name.trim())) continue;
		// Module de piscine : déjà dans sa piscine (le cocher ici = double XP).
		if (isPoolModule(graphSimulationId(project.id), project.name)) continue;
		knownNames.add(key);
		const simId = graphSimulationId(project.id);
		rows.push({
			...simExtras(simId),
			isPool: false,
			isPoolModule: false,
			maxPercentage: null,
			id: `catalog-${project.id}`,
			name: project.name,
			slug: project.slug.replace(/^42cursus-/, ''),
			xp: project.xp,
			status: simulated.has(simId) ? 'simulated' : 'not_started',
			source: 'extra42',
			isSimulated: simulated.has(simId),
			finalMark: null,
			simulatedPercentage: simulated.has(simId) ? (percentages[simId] ?? 100) : null,
			date: null,
			rncpNames: [],
			isCustom: false,
		});
	}

	// 4) Projets personnalisés hérités, et projets simulés depuis le Holy Graph.
	//    Une simulation du Holy Graph portant sur un projet DÉJÀ listé plus haut
	//    (parcours 42 ou catalogue du campus) est ignorée ici : la ligne existante
	//    la porte via son `isSimulated`. Sans ça, le même projet apparaissait deux
	//    fois — « en cours » d'un côté, « simulé » de l'autre.
	const idsFromApiOrCatalog = new Set(
		rows
			.filter((r) => r.id.startsWith('api-') || r.id.startsWith('catalog-'))
			.map((r) => `42-${r.id.replace(/^(api|catalog)-/, '')}`)
	);
	for (const custom of customProjects) {
		if (seenIds.has(custom.id)) continue;
		if (isGraphSimulationId(custom.id) && idsFromApiOrCatalog.has(custom.id)) continue;
		seenIds.add(custom.id);
		const isSimulated = simulated.has(custom.id);
		rows.push({
			...simExtras(custom.id),
			isPool: false,
			// Un vrai projet perso (`custom-…`) n'est jamais un module, même s'il
			// en porte le nom : le bloquer empêchait de le simuler.
			isPoolModule: isGraphSimulationId(custom.id) && isPoolModule(custom.id, custom.name),
			maxPercentage: null,
			id: custom.id,
			name: custom.name,
			slug: custom.slug ?? custom.id,
			xp: custom.xp,
			status: isSimulated ? 'simulated' : 'not_started',
			source: isGraphSimulationId(custom.id) ? 'extra42' : 'custom',
			isSimulated,
			finalMark: null,
			simulatedPercentage: isSimulated ? (percentages[custom.id] ?? 100) : null,
			date: null,
			rncpNames: [],
			isCustom: !isGraphSimulationId(custom.id),
		});
	}

	return rows;
}
