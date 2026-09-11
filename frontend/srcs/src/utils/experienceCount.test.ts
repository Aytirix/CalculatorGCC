import { describe, it, expect } from 'vitest';
import {
	anneesDepuisNom,
	compterExperiencesApi,
	compterExperiencesApiValidees,
	estSousProjetOuEvaluation,
	nombreExperiences,
	type EntreeApi,
} from './experienceCount';

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

	it('PLAFONNE une durée absurde', () => {
		// La durée n'est validée nulle part côté serveur : `duration: 1e9` affichait
		// « 1 000 000 000 expériences projetées », y compris à qui consulte le profil.
		expect(nombreExperiences(true, 1e9)).toBe(10);
		expect(nombreExperiences(true, 11)).toBe(10);
		expect(nombreExperiences(true, 10)).toBe(10);
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

/**
 * Les deux compteurs venus du `Dashboard`, où ils vivaient en filtres anonymes :
 * un `.filter()` dans le corps d'un composant n'est atteint par aucun test de ce
 * dépôt, qui ne monte pas de DOM. Les exclusions y sont pourtant tout le sujet.
 */
const ligne = (nom: string, slug: string, validated: boolean): EntreeApi => ({ nom, slug, validated });

describe('estSousProjetOuEvaluation', () => {
	it('écarte les sous-projets d’un stage', () => {
		// Leur slug répète celui du parent. Les compter ajoutait quatre expériences
		// professionnelles par stage au niveau projeté.
		expect(estSousProjetOuEvaluation('Duration', 'work-experience-i-work-experience-i-duration')).toBe(true);
		expect(estSousProjetOuEvaluation('Peer Video', 'work-experience-i-work-experience-i-peer-video')).toBe(true);
		expect(estSousProjetOuEvaluation('Contract Upload', 'work-experience-i-work-experience-i-contract')).toBe(true);
		expect(estSousProjetOuEvaluation('Évaluation entreprise', 'stage-evaluation')).toBe(true);
		expect(estSousProjetOuEvaluation('Evaluation', 'stage-evaluation')).toBe(true);
	});

	it('garde le projet PARENT', () => {
		expect(estSousProjetOuEvaluation('Work Experience I', 'work-experience-i')).toBe(false);
		expect(estSousProjetOuEvaluation('Alternance 2 ans', 'fr-alternance-2-ans')).toBe(false);
	});
});

describe('compterExperiencesApiValidees', () => {
	it('compte une alternance de 2 ans pour DEUX expériences', () => {
		expect(compterExperiencesApiValidees([ligne('Alternance 2 ans', 'fr-alternance-2-ans', true)])).toBe(2);
	});

	it('ignore ce qui n’est pas validé', () => {
		expect(compterExperiencesApiValidees([ligne('Alternance 2 ans', 'fr-alternance-2-ans', false)])).toBe(0);
	});

	it('ignore les sous-projets, même validés', () => {
		expect(compterExperiencesApiValidees([
			ligne('Work Experience I', 'work-experience-i', true),
			ligne('Duration', 'work-experience-i-work-experience-i-duration', true),
			ligne('Peer Video', 'work-experience-i-work-experience-i-peer-video', true),
		])).toBe(1);
	});

	it('ignore un projet qui n’est pas une expérience professionnelle', () => {
		expect(compterExperiencesApiValidees([ligne('ft_transcendence', 'ft-transcendence', true)])).toBe(0);
	});
});

describe('compterExperiencesApi — les expériences EN COURS', () => {
	it('compte une expérience commencée et non validée', () => {
		expect(compterExperiencesApi([ligne('Work Experience I', 'work-experience-i', false)])).toBe(1);
	});

	it('compte une alternance de 2 ans en cours pour DEUX', () => {
		expect(compterExperiencesApi([ligne('Alternance 2 ans', 'fr-alternance-2-ans', false)])).toBe(2);
	});

	it('ne compte PAS deux fois ce qui est déjà validé', () => {
		// Le total additionne acquis et en cours : compter une ligne validée ici la
		// ferait apparaître deux fois dans le niveau projeté.
		expect(compterExperiencesApi([ligne('Work Experience I', 'work-experience-i', true)])).toBe(0);
	});

	it('ignore les sous-projets en cours', () => {
		expect(compterExperiencesApi([
			ligne('Work Experience I', 'work-experience-i', false),
			ligne('Duration', 'work-experience-i-work-experience-i-duration', false),
			ligne('Évaluation', 'work-experience-i-evaluation', false),
		])).toBe(1);
	});
});
