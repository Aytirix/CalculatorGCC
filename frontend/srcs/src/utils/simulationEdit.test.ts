import { describe, expect, it } from 'vitest';
import type { SimulationData } from '@/services/simulation.service';
import { setSimulated, simulatedGain, updateSimulated } from './simulationEdit';

const empty = (): SimulationData => ({
	simulatedProjects: [],
	simulatedSubProjects: {},
	customProjects: [],
	apiExpPercentages: {},
	hasSeenTour: true,
});

const rncp = { id: '42-1383', name: 'webserv', slug: 'webserv', xp: 21630, inRncp: true };
const extra = { id: '42-2551', name: 'Python Piscine for Data Science', slug: 'python-for-data-science', xp: 3800, inRncp: false };

describe('setSimulated', () => {
	it('projet du référentiel : simulé à 100 %, rien dans customProjects', () => {
		const d = setSimulated(empty(), rncp, true);
		expect(d.simulatedProjects).toEqual([{ projectId: '42-1383', percentage: 100, coalitionBoost: false }]);
		expect(d.customProjects).toEqual([]);
	});

	it('projet hors référentiel : nom, slug et XP déposés dans customProjects (XP, calendrier, réconciliation)', () => {
		const d = setSimulated(empty(), extra, true);
		expect(d.customProjects).toEqual([{ id: extra.id, name: extra.name, slug: extra.slug, xp: 3800 }]);
	});

	it('retirer : l’entrée 42-<id> part aussi, un vrai projet personnalisé reste', () => {
		const custom = { id: 'custom-1', name: 'Mon projet', xp: 500 };
		let d: SimulationData = { ...empty(), customProjects: [custom] };
		d = setSimulated(d, extra, true);
		d = setSimulated(d, { id: 'custom-1', name: 'Mon projet', slug: 'custom-1', xp: 500, inRncp: false }, true);
		d = setSimulated(d, extra, false);
		d = setSimulated(d, { id: 'custom-1', name: 'Mon projet', slug: 'custom-1', xp: 500, inRncp: false }, false);
		expect(d.simulatedProjects).toEqual([]);
		expect(d.customProjects).toEqual([custom]);
	});

	it('idempotent : simuler deux fois ne double rien', () => {
		const once = setSimulated(empty(), extra, true);
		expect(setSimulated(once, extra, true)).toBe(once);
	});

	it('ne touche pas au reste de la simulation (le serveur remplace tout)', () => {
		const base = { ...empty(), simulatedSubProjects: { pool: ['a'] }, apiExpPercentages: { x: 110 } };
		const d = setSimulated(base, rncp, true);
		expect(d.simulatedSubProjects).toEqual({ pool: ['a'] });
		expect(d.apiExpPercentages).toEqual({ x: 110 });
	});
});

describe('updateSimulated', () => {
	it('note visée, bonus et note perso ; une note vide est retirée', () => {
		let d = setSimulated(empty(), rncp, true);
		d = updateSimulated(d, rncp.id, { percentage: 110, coalitionBoost: true, note: 'groupe' });
		expect(d.simulatedProjects[0]).toEqual({ projectId: rncp.id, percentage: 110, coalitionBoost: true, note: 'groupe' });
		d = updateSimulated(d, rncp.id, { note: '  ' });
		expect(d.simulatedProjects[0].note).toBeUndefined();
	});

	it('projet non simulé : rien ne change', () => {
		const d = empty();
		expect(updateSimulated(d, 'nope', { percentage: 120 })).toBe(d);
	});
});

describe('simulatedGain — même calcul que le Dashboard', () => {
	it('pourcentage puis bonus, chacun arrondi', () => {
		expect(simulatedGain(21630, 110, false)).toBe(23793);
		expect(simulatedGain(24360, 100, true)).toBe(Math.round(24360 * 1.042));
		expect(simulatedGain(10000, 125, true)).toBe(Math.round(12500 * 1.042));
	});
});
