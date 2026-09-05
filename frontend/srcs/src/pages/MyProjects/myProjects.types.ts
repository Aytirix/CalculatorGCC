import type { Project42 } from '@/services/backend-api42.service';
import type { RNCP, SimulatorProject } from '@/types/rncp.types';
import { normalizeProjectSlug } from '@/utils/projectMatcher';
import { isGraphSimulationId } from '@/utils/holyGraphSimulation';

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
	/** Pourcentage de validation choisi dans la simulation. */
	simulatedPercentage: number | null;
	/** Date de référence : correction pour un projet fait, inscription sinon. */
	date: string | null;
	/** RNCP dans lesquels ce projet compte. */
	rncpNames: string[];
	/** true si le projet peut être retiré (projet personnalisé hérité). */
	isCustom: boolean;
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
	/** Catalogue du campus : complète la liste avec les projets jamais touchés. */
	catalog: { id: number; name: string; slug: string; xp: number }[];
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
	catalog,
}: BuildInput): MyProjectRow[] {
	const simulated = new Set(simulatedIds);

	// Index des entrées 42 par nom et slug normalisés, pour rapprocher un projet
	// du référentiel de ce que l'utilisateur en a réellement fait.
	const apiByKey = new Map<string, Project42>();
	for (const entry of apiProjects) {
		if (ADMIN_PROJECT_RE.test(entry.project.name.trim())) continue;
		for (const key of [entry.project.name, entry.project.slug]) {
			if (!key) continue;
			const normalized = normalizeProjectSlug(key.replace(/^42cursus-/, ''));
			// La plus récente prime : une entrée peut exister en double (rejeu).
			if (normalized) apiByKey.set(normalized, entry);
		}
	}

	const rows: MyProjectRow[] = [];
	const usedApiEntries = new Set<number>();
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

				const keys = [project.slug, project.id, project.name].filter(Boolean) as string[];
				const entry = keys
					.map((k) => apiByKey.get(normalizeProjectSlug(k)))
					.find(Boolean);
				if (entry) usedApiEntries.add(entry.id);

				const isSimulated = simulated.has(project.id);
				rows.push({
					id: project.id,
					name: project.name,
					slug: project.slug ?? project.id,
					xp: project.xp,
					status: entry ? statusFromApi(entry) : isSimulated ? 'simulated' : 'not_started',
					source: 'rncp',
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
	for (const entry of apiProjects) {
		if (usedApiEntries.has(entry.id)) continue;
		const name = entry.project.name.trim();
		if (ADMIN_PROJECT_RE.test(name)) continue;
		const id = `api-${entry.project.id}`;
		if (seenIds.has(id)) continue;
		seenIds.add(id);

		const slug = (entry.project.slug ?? '').replace(/^42cursus-/, '');
		rows.push({
			id,
			name,
			slug,
			// L'XP vient du catalogue du campus : ces projets ne sont pas dans le
			// référentiel RNCP, mais ils comptent bel et bien dans le niveau.
			xp:
				xpBySlug.get(normalizeProjectSlug(slug)) ??
				xpBySlug.get(normalizeProjectSlug(name)) ??
				0,
			status: statusFromApi(entry),
			source: 'extra42',
			finalMark: entry.final_mark ?? null,
			simulatedPercentage: null,
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
		knownNames.add(key);
		rows.push({
			id: `catalog-${project.id}`,
			name: project.name,
			slug: project.slug.replace(/^42cursus-/, ''),
			xp: project.xp,
			status: 'not_started',
			source: 'extra42',
			finalMark: null,
			simulatedPercentage: null,
			date: null,
			rncpNames: [],
			isCustom: false,
		});
	}

	// 4) Projets personnalisés hérités, et projets simulés depuis le Holy Graph.
	for (const custom of customProjects) {
		if (seenIds.has(custom.id)) continue;
		seenIds.add(custom.id);
		const isSimulated = simulated.has(custom.id);
		rows.push({
			id: custom.id,
			name: custom.name,
			slug: custom.slug ?? custom.id,
			xp: custom.xp,
			status: isSimulated ? 'simulated' : 'not_started',
			source: isGraphSimulationId(custom.id) ? 'extra42' : 'custom',
			finalMark: null,
			simulatedPercentage: isSimulated ? (percentages[custom.id] ?? 100) : null,
			date: null,
			rncpNames: [],
			isCustom: !isGraphSimulationId(custom.id),
		});
	}

	return rows;
}
