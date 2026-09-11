import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import type { ProfessionalExperience } from '@/types/professionalExperience.types';

/**
 * L'interrupteur « Expérience déjà acquise ».
 *
 * Il existe parce que `isSimulation` était codé en dur — d'abord à `false`, ce qui
 * faisait valider le prérequis RNCP par une simple projection ; puis à `true`, ce
 * qui privait de tout recours quiconque a réellement fait une alternance absente
 * de l'API 42. Le drapeau devient enfin une donnée choisie.
 *
 * Rendu réel plutôt qu'expression régulière sur le source : un audit de ce dépôt a
 * montré qu'une regex ne détecte que l'édition des caractères qu'elle épingle.
 */

const fenetreAvant = (globalThis as Record<string, unknown>).window;
beforeAll(() => {
	(globalThis as Record<string, unknown>).window = {
		location: { origin: 'http://localhost' },
		addEventListener: () => {}, removeEventListener: () => {},
		matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
	};
});
afterAll(() => {
	if (fenetreAvant === undefined) delete (globalThis as Record<string, unknown>).window;
	else (globalThis as Record<string, unknown>).window = fenetreAvant;
});

const rendu = async (initialValues?: ProfessionalExperience | null) => {
	const { default: AlternanceForm } = await import('./AlternanceForm');
	return renderToStaticMarkup(
		React.createElement(AlternanceForm, { onSubmit: () => {}, onCancel: () => {}, initialValues })
	);
};

/** Radix rend l'état d'un Switch dans `data-state` et `aria-checked`. */
const interrupteurAcquise = (html: string) => {
	const m = html.match(/<button[^>]*id="acquise"[^>]*>/);
	return m ? m[0] : '';
};

const base: ProfessionalExperience = {
	id: 'a', type: 'alternance', startDate: '', duration: 1,
	validationPercentage: 100, coalitionBoost: 0, isSimulation: true, xpEarned: 90_000,
};

describe('AlternanceForm — « Expérience déjà acquise »', () => {
	it('propose le choix', async () => {
		const html = await rendu();
		expect(html).toContain('Expérience déjà acquise');
		expect(interrupteurAcquise(html)).not.toBe('');
	});

	it('par défaut, une NOUVELLE saisie est une simulation', async () => {
		// Le défaut compte : c'est lui qui empêche une projection de valider le RNCP.
		expect(interrupteurAcquise(await rendu())).toContain('aria-checked="false"');
	});

	it('rouvre une expérience marquée ACQUISE dans cet état', async () => {
		const html = await rendu({ ...base, isSimulation: false, simulationExplicite: true });
		expect(interrupteurAcquise(html)).toContain('aria-checked="true"');
	});

	it('rouvre une expérience marquée SIMULATION dans cet état', async () => {
		const html = await rendu({ ...base, isSimulation: true, simulationExplicite: true });
		expect(interrupteurAcquise(html)).toContain('aria-checked="false"');
	});

	it('traite un enregistrement SANS choix explicite comme une simulation', async () => {
		// Les données antérieures à l'interrupteur portent `isSimulation: false` que
		// personne n'a décidé : les rouvrir ne doit pas les présenter comme acquises.
		const html = await rendu({ ...base, isSimulation: false });
		expect(interrupteurAcquise(html)).toContain('aria-checked="false"');
	});
});
