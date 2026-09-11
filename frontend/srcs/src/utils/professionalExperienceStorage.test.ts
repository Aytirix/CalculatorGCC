import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import type { ProfessionalExperience } from '@/types/professionalExperience.types';

/**
 * Le STOCKAGE local des expériences — la porte d'entrée de la migration.
 *
 * `getAll()` normalise à la LECTURE : sans cela, les enregistrements antérieurs à
 * l'interrupteur remontent avec un `isSimulation: false` que personne n'a choisi,
 * et `realCount()` les compte comme réellement acquis — une projection validait
 * le prérequis d'expérience professionnelle du RNCP.
 *
 * L'appel à `normaliserExperiences` peut être neutralisé sans qu'un seul caractère
 * du fichier change d'apparence (`const _mort = normaliserExperiences;`) : seul
 * un test qui LIT le résultat le voit.
 */

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

const { professionalExperienceStorage } = await import('./professionalExperienceStorage');

const CLE = 'professional_experiences';
const brut = (p: Partial<ProfessionalExperience>) => ({
	id: 'x', type: 'alternance', startDate: '', duration: 2,
	validationPercentage: 110, coalitionBoost: 0, isSimulation: false, xpEarned: 90_000, ...p,
});

beforeEach(() => memoire.clear());

describe('professionalExperienceStorage.getAll — normalisation à la lecture', () => {
	it('BASCULE en simulation un enregistrement sans choix explicite', () => {
		localStorage.setItem(CLE, JSON.stringify([brut({ isSimulation: false })]));
		const [lu] = professionalExperienceStorage.getAll();
		expect(lu.isSimulation).toBe(true);
		expect(lu.simulationExplicite).toBe(true);
	});

	it('RESPECTE un choix explicite « acquise »', () => {
		localStorage.setItem(CLE, JSON.stringify([brut({ isSimulation: false, simulationExplicite: true })]));
		expect(professionalExperienceStorage.getAll()[0].isSimulation).toBe(false);
	});

	it('normalise AUSSI ce que renvoient add / update / remove', () => {
		// Le Dashboard utilise directement ces retours pour peupler son état : une
		// liste non normalisée y ferait réapparaître un acquis subi.
		localStorage.setItem(CLE, JSON.stringify([brut({ id: 'ancien', isSimulation: false })]));
		const apresAjout = professionalExperienceStorage.add(
			brut({ id: 'neuf', isSimulation: true, simulationExplicite: true }) as ProfessionalExperience
		);
		expect(apresAjout.find(e => e.id === 'ancien')?.isSimulation).toBe(true);

		const apresRetrait = professionalExperienceStorage.remove('neuf');
		expect(apresRetrait.map(e => e.id)).toEqual(['ancien']);
		expect(apresRetrait[0].isSimulation).toBe(true);
	});

	it('ne compte PAS comme acquise une expérience héritée', () => {
		// La conséquence chiffrée, celle qui décide du prérequis RNCP.
		localStorage.setItem(CLE, JSON.stringify([brut({ isSimulation: false })]));
		const liste = professionalExperienceStorage.getAll();
		expect(liste.filter(e => !e.isSimulation)).toHaveLength(0);
	});

	it('rend une liste vide sur un contenu illisible, sans lever', () => {
		localStorage.setItem(CLE, '{pas du json');
		expect(professionalExperienceStorage.getAll()).toEqual([]);
	});
});
