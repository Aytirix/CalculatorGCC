import type { SimulatorProject } from '@/types/rncp.types';
import type { MyProjectRow, ProjectStatus } from '@/pages/MyProjects/myProjects.types';
import { activeSubProjects, effectiveProjectXP } from '@/services/xp.service';
import { clampProjectPercentage } from '@/utils/projectPercentage';
import { findProjectPercentage } from '@/utils/projectMatcher';
import { simulatedGain } from '@/utils/simulationEdit';

/**
 * Une ligne de projet du Dashboard, au format de la fiche partagée avec Mes
 * projets (`MyProjectRow`), plus ce que seul le Dashboard affiche : modules
 * d'une piscine, XP compté dans la catégorie, projet retiré du référentiel.
 */
export interface DashRow extends MyProjectRow {
	project: SimulatorProject;
	/** XP que la ligne affiche : celui compté par la simulation s'il y a lieu. */
	shownXp: number;
	/** XP ajouté à la catégorie par la simulation de ce projet (0 s'il n'est pas simulable). */
	gain: number;
	retired: boolean;
	/** Piscine : modules actifs acquis ou cochés / modules actifs. */
	poolDone: number;
	poolTotal: number;
	/** Pourquoi la case est inactive, ou null. */
	blocker: string | null;
}

export interface DashRowContext {
	completedIds: ReadonlySet<string>;
	simulatedIds: ReadonlySet<string>;
	simulatedSubProjects: Record<string, string[]>;
	completedSubProjects: Record<string, string[]>;
	percentages: Record<string, number>;
	completedPercentages: Record<string, number>;
	boosts: Record<string, boolean>;
	notes: Record<string, string>;
	readOnly: boolean;
	/** Statut côté 42 d'un projet non validé : en cours, raté, ou rien. */
	apiStatus: (project: SimulatorProject) => 'in_progress' | 'failed' | null;
}

export function buildDashRow(project: SimulatorProject, where: string[], ctx: DashRowContext): DashRow {
	const isPool = !!project.subProjects?.length;
	const completed = ctx.completedIds.has(project.id);
	const active = isPool ? activeSubProjects(project) : [];
	const subs = ctx.simulatedSubProjects[project.id] ?? [];
	const doneSubs = ctx.completedSubProjects[project.id] ?? [];
	const poolDone = active.filter(s => subs.includes(s.id) || doneSubs.includes(s.id)).length;
	const isSimulated = isPool
		? !completed && active.length > 0 && active.every(s => subs.includes(s.id) || doneSubs.includes(s.id)) && subs.length > 0
		: ctx.simulatedIds.has(project.id);
	const retired = !!project.retired;
	const xp = effectiveProjectXP(project);
	const pct = clampProjectPercentage(ctx.percentages[project.id] ?? 100, project);
	const boost = !!ctx.boosts[project.id];

	let status: ProjectStatus;
	if (completed) status = 'validated';
	else {
		const api = isPool ? null : ctx.apiStatus(project);
		status = api ?? (isSimulated ? 'simulated' : 'not_started');
	}

	const gain = completed || retired
		? 0
		: isPool
			? (isSimulated ? xp : 0)
			: simulatedGain(xp, pct, boost);
	const shownXp = completed
		? Math.round((xp * findProjectPercentage(project, ctx.completedPercentages, 100)) / 100)
		: isSimulated && !isPool ? gain : xp;

	const blocker = ctx.readOnly
		? 'Consultation : la simulation n’est pas modifiable.'
		: completed
			? 'Déjà validé : rien à simuler.'
			: retired
				? 'Hors référentiel : ce projet ne compte plus pour ce titre.'
				: null;

	return {
		project,
		id: project.id,
		simId: project.id,
		name: project.name,
		slug: project.slug ?? project.id,
		xp,
		status,
		source: 'rncp',
		finalMark: completed ? findProjectPercentage(project, ctx.completedPercentages, 100) : null,
		isSimulated: isSimulated && !completed,
		simulatedPercentage: isSimulated && !isPool ? pct : null,
		date: null,
		rncpNames: where,
		isCustom: false,
		coalitionBoost: isSimulated && boost,
		note: ctx.notes[project.id] ?? '',
		isPool,
		isPoolModule: false,
		maxPercentage: project.maxPercentage ?? null,
		shownXp,
		gain,
		retired,
		poolDone,
		poolTotal: active.length,
		blocker,
	};
}

/**
 * Effet d'un projet sur sa catégorie : avant / après sa simulation. Le décompte
 * de la catégorie (`currentCount`, `currentXP`) inclut déjà la simulation ; on
 * en retire le projet s'il est simulé, on l'ajoute sinon.
 */
export function categoryEffect(row: DashRow, current: { count: number; xp: number }) {
	if (row.status === 'validated' || row.retired) return null;
	if (row.isPool && !row.isSimulated) return null;
	const before = row.isSimulated
		? { count: current.count - 1, xp: current.xp - row.gain }
		: current;
	const after = row.isSimulated
		? current
		: { count: current.count + 1, xp: current.xp + row.gain };
	return { before, after, gain: row.gain };
}
