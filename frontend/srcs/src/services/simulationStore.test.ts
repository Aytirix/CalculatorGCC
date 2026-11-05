import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const memoire = new Map<string, string>();
const localStorageAvant = (globalThis as Record<string, unknown>).localStorage;
(globalThis as Record<string, unknown>).localStorage = {
	getItem: (k: string) => memoire.get(k) ?? null,
	setItem: (k: string, v: string) => { memoire.set(k, v); },
	removeItem: (k: string) => { memoire.delete(k); },
	clear: () => memoire.clear(),
};
afterAll(() => {
	if (localStorageAvant === undefined) delete (globalThis as Record<string, unknown>).localStorage;
	else (globalThis as Record<string, unknown>).localStorage = localStorageAvant;
});

let readOnly = false;
vi.mock('./simulation.service', () => ({
	isReadOnlyMode: () => readOnly,
	simulationService: { save: vi.fn(async (d: unknown) => d) },
}));

const { createSimulationSaver, writeSimulationCache } = await import('./simulationStore');
import type { SimulationData } from './simulation.service';

const data: SimulationData = {
	simulatedProjects: [
		{ projectId: '42-1383', percentage: 110, coalitionBoost: true, note: 'groupe' },
		{ projectId: '42-2551', percentage: 100, coalitionBoost: false },
	],
	simulatedSubProjects: { pool: ['m1'] },
	customProjects: [{ id: '42-2551', name: 'Python DS', slug: 'python-ds', xp: 3800 }],
	apiExpPercentages: {},
	hasSeenTour: true,
	manualExperiences: [{ id: 'exp' }],
	seenTourSteps: ['a'],
};

beforeEach(() => { memoire.clear(); readOnly = false; vi.useRealTimers(); });

describe('writeSimulationCache — copie locale au format du Dashboard', () => {
	it('écrit les mêmes clés que le Dashboard (le Calendrier les lit)', () => {
		writeSimulationCache(data);
		expect(JSON.parse(memoire.get('simulated_projects')!)).toEqual(['42-1383', '42-2551']);
		expect(JSON.parse(memoire.get('project_percentages')!)).toEqual({ '42-1383': 110 });
		expect(JSON.parse(memoire.get('coalition_boosts')!)).toEqual({ '42-1383': true });
		expect(JSON.parse(memoire.get('project_notes')!)).toEqual({ '42-1383': 'groupe' });
		expect(JSON.parse(memoire.get('custom_projects')!)).toHaveLength(1);
		expect(JSON.parse(memoire.get('simulated_sub_projects')!)).toEqual({ pool: ['m1'] });
	});

	it('simulation vide : clé des projets retirée, comme le Dashboard', () => {
		memoire.set('simulated_projects', '["x"]');
		writeSimulationCache({ ...data, simulatedProjects: [] });
		expect(memoire.has('simulated_projects')).toBe(false);
	});

	it('consultation d’un autre profil : la copie locale n’est jamais touchée', () => {
		readOnly = true;
		writeSimulationCache(data);
		expect(memoire.size).toBe(0);
	});
});

describe('createSimulationSaver', () => {
	it('copie locale tout de suite, base après le délai, une seule fois pour une rafale', async () => {
		vi.useFakeTimers();
		const save = vi.fn(async () => undefined);
		const saver = createSimulationSaver(save, 800);
		saver.schedule(data);
		saver.schedule({ ...data, simulatedProjects: data.simulatedProjects.slice(0, 1) });
		expect(memoire.get('simulated_projects')).toBe('["42-1383"]');
		expect(save).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(800);
		expect(save).toHaveBeenCalledOnce();
	});

	it('n’envoie ni les expériences ni les étapes du guide (routes à part, sinon écrasées)', () => {
		const save = vi.fn(async () => undefined);
		const saver = createSimulationSaver(save, 800);
		saver.schedule(data);
		saver.flush();
		const sent = (save.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
		expect(sent).not.toHaveProperty('manualExperiences');
		expect(sent).not.toHaveProperty('seenTourSteps');
		expect(sent.simulatedProjects).toEqual(data.simulatedProjects);
	});

	it('flush : envoie tout de suite ce qui attend (page fermée), puis plus rien', () => {
		const save = vi.fn(async () => undefined);
		const saver = createSimulationSaver(save, 800);
		saver.flush();
		expect(save).not.toHaveBeenCalled();
		saver.schedule(data);
		saver.flush();
		saver.flush();
		expect(save).toHaveBeenCalledOnce();
	});

	it('consultation : rien n’est enregistré', () => {
		readOnly = true;
		const save = vi.fn(async () => undefined);
		const saver = createSimulationSaver(save, 800);
		saver.schedule(data);
		saver.flush();
		expect(save).not.toHaveBeenCalled();
	});
});
