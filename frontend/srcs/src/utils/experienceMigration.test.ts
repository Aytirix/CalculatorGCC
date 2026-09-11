import { describe, it, expect } from 'vitest';
import { normaliserExperiences } from './experienceMigration';
import type { ProfessionalExperience } from '@/types/professionalExperience.types';

/**
 * Bascule des expériences saisies avant l'interrupteur.
 *
 * `isSimulation` était codé en dur à `false` dans les deux formulaires et aucune
 * interface ne proposait le choix : tout ce qui existe porte donc un `false` que
 * personne n'a décidé. Or `realCount()` s'en sert pour compter les expériences
 * « réellement acquises » — une simulation faisait passer au vert le prérequis
 * d'expérience professionnelle du RNCP.
 */

const exp = (p: Partial<ProfessionalExperience>): ProfessionalExperience => ({
	id: 'x', type: 'alternance', startDate: '', duration: 1,
	validationPercentage: 100, coalitionBoost: 0, isSimulation: false, xpEarned: 90_000, ...p,
});

describe('normaliserExperiences', () => {
	it('bascule en simulation un enregistrement sans choix explicite', () => {
		const [r] = normaliserExperiences([exp({ isSimulation: false })]);
		expect(r.isSimulation).toBe(true);
		expect(r.simulationExplicite).toBe(true);
	});

	it('RESPECTE un choix explicite « acquise »', () => {
		// LE cas qui justifie le marqueur : sans lui, la bascule écraserait ce
		// choix à chaque chargement, et sur chaque appareil.
		const [r] = normaliserExperiences([exp({ isSimulation: false, simulationExplicite: true })]);
		expect(r.isSimulation).toBe(false);
	});

	it('respecte un choix explicite « simulation »', () => {
		const [r] = normaliserExperiences([exp({ isSimulation: true, simulationExplicite: true })]);
		expect(r.isSimulation).toBe(true);
	});

	it('est IDEMPOTENTE', () => {
		// Appliquée à chaque entrée de liste, elle passe plusieurs fois sur la même
		// donnée : le second passage ne doit rien changer.
		const une = normaliserExperiences([exp({})]);
		expect(normaliserExperiences(une)).toEqual(une);
	});

	it('ne touche à rien d’autre', () => {
		const avant = exp({ xpEarned: 62_175, validationPercentage: 125, duration: 2 });
		const [apres] = normaliserExperiences([avant]);
		expect({ ...apres, isSimulation: false, simulationExplicite: undefined })
			.toEqual({ ...avant, simulationExplicite: undefined });
	});

	it('ne modifie pas la liste reçue', () => {
		const origine = exp({ isSimulation: false });
		normaliserExperiences([origine]);
		expect(origine.isSimulation).toBe(false);
	});

	it('accepte une liste vide', () => {
		expect(normaliserExperiences([])).toEqual([]);
	});
});
