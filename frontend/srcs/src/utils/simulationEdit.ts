import type { SimulatedProjectData, SimulationData } from '@/services/simulation.service';
import type { SimulatorProject } from '@/types/rncp.types';
import { isGraphSimulationId } from './holyGraphSimulation';

/**
 * Modifications de la simulation, sans effet de bord (testables) : chaque
 * fonction renvoie une NOUVELLE simulation complète, prête à être enregistrée.
 *
 * Même modèle que le Holy Graph : un projet du référentiel RNCP est simulé
 * sous son identifiant ; un projet hors référentiel sous `42-<id 42>`, avec son
 * nom, son slug et son XP déposés dans `customProjects` — seul endroit où le
 * Dashboard (XP), le Calendrier (« À placer ») et la réconciliation automatique
 * (projet réellement validé, retrouvé par son slug) peuvent les relire.
 */

export interface SimulationTarget {
	/** Identifiant de simulation (référentiel, `42-<id>` ou `custom-…`). */
	id: string;
	name: string;
	slug: string;
	xp: number;
	/** Projet du référentiel RNCP : rien à déposer dans `customProjects`. */
	inRncp: boolean;
}

/** Coefficient du bonus coalition (+4,2 %), comme le Dashboard. */
export const COALITION_BOOST = 1.042;

/** XP rapportée par un projet simulé : même arrondi que le Dashboard. */
export function simulatedGain(xp: number, percentage: number, boost: boolean): number {
	const base = Math.round((xp * percentage) / 100);
	return boost ? Math.round(base * COALITION_BOOST) : base;
}

function customsOf(data: SimulationData): SimulatorProject[] {
	return (data.customProjects as SimulatorProject[] | undefined) ?? [];
}

export function findSimulated(data: SimulationData, id: string): SimulatedProjectData | undefined {
	return data.simulatedProjects.find(p => p.projectId === id);
}

/** Ajoute (`on`) ou retire un projet de la simulation. */
export function setSimulated(data: SimulationData, target: SimulationTarget, on: boolean): SimulationData {
	const already = !!findSimulated(data, target.id);
	const customs = customsOf(data);
	if (!on) {
		if (!already) return data;
		return {
			...data,
			simulatedProjects: data.simulatedProjects.filter(p => p.projectId !== target.id),
			// Seulement les entrées `42-<id>` déposées pour la simulation : un vrai
			// projet personnalisé (`custom-…`) garde sa fiche.
			customProjects: customs.filter(p => !(isGraphSimulationId(p.id) && p.id === target.id)),
		};
	}
	if (already) return data;
	const needsCustom = !target.inRncp && isGraphSimulationId(target.id) && !customs.some(p => p.id === target.id);
	return {
		...data,
		simulatedProjects: [...data.simulatedProjects, { projectId: target.id, percentage: 100, coalitionBoost: false }],
		customProjects: needsCustom
			? [...customs, { id: target.id, name: target.name, slug: target.slug, xp: target.xp }]
			: customs,
	};
}

/** Change la note visée, le bonus ou la note perso d'un projet simulé. */
export function updateSimulated(
	data: SimulationData,
	id: string,
	patch: Partial<Pick<SimulatedProjectData, 'percentage' | 'coalitionBoost' | 'note'>>,
): SimulationData {
	if (!findSimulated(data, id)) return data;
	return {
		...data,
		simulatedProjects: data.simulatedProjects.map(p => {
			if (p.projectId !== id) return p;
			const next = { ...p, ...patch };
			if (patch.note !== undefined && patch.note.trim() === '') delete next.note;
			return next;
		}),
	};
}
