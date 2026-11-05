import { isReadOnlyMode, onBeforeViewSwitch, simulationService, type SimulationData } from './simulation.service';

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

/**
 * Champs que la sauvegarde générale ne doit PAS renvoyer : le serveur garde sa
 * valeur quand ils sont absents. Expériences et étapes du guide ont leur propre
 * route. Le guide, les % d'expérience et les expériences désactivées ne sont
 * modifiés que par le Dashboard :
 * les renvoyer depuis une autre page, c'était renvoyer la valeur de SON
 * chargement, et écraser un changement fait entre-temps ailleurs.
 */
function forSave(data: SimulationData, sendSettings: boolean): SimulationData {
	const { manualExperiences: _experiences, seenTourSteps: _steps, apiExpPercentages, hasSeenTour, disabledApiExperiences, ...rest } = data;
	void _experiences;
	void _steps;
	return sendSettings ? { ...rest, apiExpPercentages, hasSeenTour, disabledApiExperiences } : rest;
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

export interface SimulationSaverOptions {
	/** Réécrire la copie locale (non pour le Dashboard, qui tient la sienne). */
	writeCache?: boolean;
	/** Envoyer guide et % d'expérience (seul le Dashboard les modifie). */
	sendSettings?: boolean;
}

export function createSimulationSaver(
	save: (data: SimulationData) => Promise<unknown> = d => simulationService.save(d),
	delayMs = SAVE_DELAY_MS,
	{ writeCache = true, sendSettings = false }: SimulationSaverOptions = {},
): SimulationSaver {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pending: SimulationData | null = null;
	// Les pages sont recréées à chaque changement de profil consulté : un
	// enregistreur né en consultation n'enregistre JAMAIS. Sans ça, revenir à son
	// profil coupait la consultation avant le démontage de la page, et
	// l'enregistrement envoyé au départ portait la simulation de l'autre.
	const bornReadOnly = isReadOnlyMode();
	// Inscrit seulement tant qu'un envoi attend : passer sur le profil d'un autre
	// envoie d'abord ce qui attend (après, `save()` n'écrirait plus rien).
	let unregister: (() => void) | undefined;
	const run = () => {
		if (timer) clearTimeout(timer);
		timer = undefined;
		unregister?.();
		unregister = undefined;
		const data = pending;
		pending = null;
		if (!data) return;
		save(forSave(data, sendSettings)).catch(err => console.warn('[Simulation] Sauvegarde échouée :', err));
	};
	return {
		schedule(next) {
			if (bornReadOnly || isReadOnlyMode()) return;
			if (writeCache) writeSimulationCache(next);
			pending = next;
			if (timer) clearTimeout(timer);
			timer = setTimeout(run, delayMs);
			unregister ??= onBeforeViewSwitch(run);
		},
		flush: run,
	};
}
