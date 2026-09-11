import { describe, it, expect } from 'vitest';
import {
	BOOST_COALITION,
	POURCENTAGE_MAX,
	POURCENTAGE_MIN,
	XP_PAR_AN,
	bornerPourcentage,
	dejaAcquiseInitiale,
	pourcentageEffectif,
	xpAlternance,
} from './experienceForm';
import type { ProfessionalExperience } from '@/types/professionalExperience.types';

/**
 * Ces fonctions viennent du corps d'`AlternanceForm`, où l'audit par mutation
 * montrait 0 détection : le bornage, le repli sur la valeur précédente et le
 * calcul d'XP pouvaient être inversés sans qu'aucun test ne bouge.
 */

describe('bornerPourcentage', () => {
	it('laisse passer ce qui est déjà dans les bornes', () => {
		expect(bornerPourcentage(0)).toBe(0);
		expect(bornerPourcentage(60)).toBe(60);
		expect(bornerPourcentage(125)).toBe(125);
	});

	it('plafonne au maximum et plancher au minimum', () => {
		expect(bornerPourcentage(1_000)).toBe(POURCENTAGE_MAX);
		expect(bornerPourcentage(126)).toBe(125);
		expect(bornerPourcentage(-5)).toBe(POURCENTAGE_MIN);
	});

	it('ramène au minimum ce qui n’est pas un nombre', () => {
		// `NaN` traverse `Math.min`/`Math.max` sans être borné : il serait reparti
		// tel quel dans l'XP, puis en base.
		expect(bornerPourcentage(NaN)).toBe(0);
		expect(bornerPourcentage(Infinity)).toBe(0);
	});
});

describe('pourcentageEffectif', () => {
	it('lit la saisie quand elle est exploitable', () => {
		expect(pourcentageEffectif('60', 100)).toBe(60);
		expect(pourcentageEffectif('0', 100)).toBe(0);
	});

	it('GARDE la valeur précédente sur un champ vidé', () => {
		// « Tout sélectionner, effacer, regarder ailleurs » faisait tomber le
		// pourcentage à 0 % et l'XP à 0.
		expect(pourcentageEffectif('', 120)).toBe(120);
	});

	it('garde la valeur précédente sur une saisie illisible', () => {
		expect(pourcentageEffectif('abc', 115)).toBe(115);
	});

	it('borne la saisie', () => {
		expect(pourcentageEffectif('999', 100)).toBe(125);
	});
});

describe('xpAlternance', () => {
	it('vaut 90 000 XP par an à 100 %', () => {
		expect(xpAlternance(1, 100, false)).toBe(XP_PAR_AN);
		expect(xpAlternance(2, 100, false)).toBe(2 * XP_PAR_AN);
	});

	it('applique le pourcentage au prorata', () => {
		expect(xpAlternance(1, 50, false)).toBe(45_000);
		expect(xpAlternance(1, 0, false)).toBe(0);
		expect(xpAlternance(1, 125, false)).toBe(112_500);
	});

	it('ajoute le boost de coalition à l’XP de base', () => {
		expect(xpAlternance(1, 100, true)).toBe(Math.round(XP_PAR_AN * (1 + BOOST_COALITION / 100)));
		expect(xpAlternance(1, 100, true)).toBeGreaterThan(xpAlternance(1, 100, false));
	});

	it('rend un entier', () => {
		expect(Number.isInteger(xpAlternance(1, 37, true))).toBe(true);
	});
});

describe('dejaAcquiseInitiale', () => {
	const exp = (p: Partial<ProfessionalExperience>): ProfessionalExperience => ({
		id: 'x', type: 'alternance', startDate: '', duration: 1,
		validationPercentage: 100, coalitionBoost: 0, isSimulation: true,
		xpEarned: 0, ...p,
	});

	it('est fermé sur une création', () => {
		expect(dejaAcquiseInitiale(null)).toBe(false);
		expect(dejaAcquiseInitiale(undefined)).toBe(false);
	});

	it('rouvre une expérience déclarée ACQUISE', () => {
		expect(dejaAcquiseInitiale(exp({ isSimulation: false, simulationExplicite: true }))).toBe(true);
	});

	it('rouvre une expérience déclarée SIMULÉE', () => {
		expect(dejaAcquiseInitiale(exp({ isSimulation: true, simulationExplicite: true }))).toBe(false);
	});

	it('ne prend PAS un ancien enregistrement pour un choix', () => {
		// Avant l'interrupteur, les deux formulaires écrivaient `isSimulation: false`
		// en dur. Le lire comme « acquis » aurait fait compter ces expériences dans
		// les prérequis RNCP sans que personne ne l'ait jamais dit.
		expect(dejaAcquiseInitiale(exp({ isSimulation: false }))).toBe(false);
		expect(dejaAcquiseInitiale(exp({ isSimulation: false, simulationExplicite: false }))).toBe(false);
	});
});
