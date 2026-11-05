import { isReadOnlyMode, simulationService, type SimulationData } from './simulation.service';

/**
 * Enregistrement de la simulation pour les pages AUTRES que le Dashboard
 * (Mes projets, Holy Graph).
 *
 * Deux choses à la fois :
 *  - la copie locale (mêmes clés que le Dashboard) est mise à jour TOUT DE
 *    SUITE : le Calendrier la lit en priorité — un projet simulé depuis le
 *    Holy Graph n'apparaissait dans « À placer » qu'après un passage par le
 *    Dashboard, qui seul réécrivait cette copie ;
 *  - la base reçoit la simulation COMPLÈTE (le serveur remplace tout), 800 ms
 *    après le dernier changement, et tout de suite si la page se ferme avant.
 *
 * Jamais en consultation du profil d'un autre : sa simulation remplacerait la
 * copie locale de l'utilisateur.
 */

const SAVE_DELAY_MS = 800;

/** Champs que la sauvegarde générale ne doit PAS renvoyer (ils ont leur propre route). */
function forSave(data: SimulationData): SimulationData {
	// Renvoyer les expériences chargées écraserait celles modifiées entre-temps
	// ailleurs : le serveur laisse la colonne intacte quand le champ est absent.
	const { manualExperiences: _experiences, seenTourSteps: _steps, ...rest } = data;
	void _experiences;
	void _steps;
	return rest;
}

/** Réécrit la copie locale de la simulation au format du Dashboard. */
export function writeSimulationCache(data: SimulationData): void {
	if (isReadOnlyMode()) return;
	const percentages: Record<string, number> = {};
	const boosts: Record<string, boolean> = {};
	const notes: Record<string, string> = {};
	for (const p of data.simulatedProjects) {
		if (p.percentage !== 100) percentages[p.projectId] = p.percentage;
		if (p.coalitionBoost) boosts[p.projectId] = true;
		if (p.note) notes[p.projectId] = p.note;
	}
	try {
		const ids = data.simulatedProjects.map(p => p.projectId);
		// Comme le Dashboard : liste vide = clé retirée.
		if (ids.length > 0) localStorage.setItem('simulated_projects', JSON.stringify(ids));
		else localStorage.removeItem('simulated_projects');
		localStorage.setItem('simulated_sub_projects', JSON.stringify(data.simulatedSubProjects ?? {}));
		localStorage.setItem('project_percentages', JSON.stringify(percentages));
		localStorage.setItem('coalition_boosts', JSON.stringify(boosts));
		localStorage.setItem('project_notes', JSON.stringify(notes));
		localStorage.setItem('custom_projects', JSON.stringify(data.customProjects ?? []));
	} catch { /* stockage plein ou bloqué : la base reste la référence */ }
}

export interface SimulationSaver {
	/** Copie locale tout de suite, base après un court délai. */
	schedule: (next: SimulationData) => void;
	/** Envoie tout de suite ce qui attend (fermeture de la page). */
	flush: () => void;
}

export function createSimulationSaver(
	save: (data: SimulationData) => Promise<unknown> = d => simulationService.save(d),
	delayMs = SAVE_DELAY_MS,
): SimulationSaver {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pending: SimulationData | null = null;
	const run = () => {
		timer = undefined;
		const data = pending;
		pending = null;
		if (!data) return;
		save(forSave(data)).catch(err => console.warn('[Simulation] Sauvegarde échouée :', err));
	};
	return {
		schedule(next) {
			if (isReadOnlyMode()) return;
			writeSimulationCache(next);
			pending = next;
			if (timer) clearTimeout(timer);
			timer = setTimeout(run, delayMs);
		},
		flush() {
			if (timer) clearTimeout(timer);
			run();
		},
	};
}
