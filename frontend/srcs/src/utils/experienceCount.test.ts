import { describe, it, expect } from 'vitest';
import { nombreExperiences, anneesDepuisNom } from './experienceCount';

/**
 * « Alternance 2 ans = 2 expériences pro, 1 an = 1 expérience pro. »
 *
 * Règle énoncée par l'utilisateur, et qui existait en quatre versions
 * divergentes : `.length` pour les expériences validées de l'API, les années
 * extraites du nom pour celles en cours, `duration === 2 ? 2 : 1` pour les
 * simulations manuelles, `+ duration` pour les manuelles acquises.
 */

describe('nombreExperiences', () => {
	it('compte une alternance pour ses années', () => {
		expect(nombreExperiences(true, 1)).toBe(1);
		expect(nombreExperiences(true, 2)).toBe(2);
		expect(nombreExperiences(true, 3)).toBe(3);
	});

	it('compte un stage pour 1, quelle que soit sa durée', () => {
		// Un stage se mesure en mois : sa durée n'est pas un nombre d'expériences.
		expect(nombreExperiences(false, 6)).toBe(1);
		expect(nombreExperiences(false, 0)).toBe(1);
	});

	it('ne fait JAMAIS disparaître une expérience', () => {
		// Une durée absente ou aberrante doit compter 1, pas 0 : le contenu n'est
		// pas validé côté serveur, et un 0 retirerait silencieusement un acquis.
		for (const durée of [0, -3, NaN, Infinity, undefined as unknown as number]) {
			expect(nombreExperiences(true, durée)).toBe(1);
		}
	});

	it('tronque une durée fractionnaire', () => {
		expect(nombreExperiences(true, 2.9)).toBe(2);
	});
});

describe('anneesDepuisNom', () => {
	it('lit les années dans le libellé de l’API', () => {
		expect(anneesDepuisNom('Alternance 2 ans')).toBe(2);
		expect(anneesDepuisNom('ALTERNANCE 1 AN')).toBe(1);
		expect(anneesDepuisNom('Alternance 3ans')).toBe(3);
	});

	it('compte une année quand le nom ne dit rien', () => {
		expect(anneesDepuisNom('Alternance')).toBe(1);
		expect(anneesDepuisNom('Internship')).toBe(1);
	});
});
