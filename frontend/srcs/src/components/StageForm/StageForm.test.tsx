import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import type { ProfessionalExperience } from '@/types/professionalExperience.types';

/**
 * Le formulaire de STAGE — le jumeau d'`AlternanceForm`, et le seul des deux qui
 * n'était couvert par rien.
 *
 * Deux choses s'y vérifient par rendu réel :
 *   • l'interrupteur « Expérience déjà acquise » et son DÉFAUT (simulation) —
 *     c'est lui qui empêche une projection de valider le prérequis RNCP ;
 *   • l'avertissement « note orpheline », affiché pour une expérience enregistrée
 *     avant le modèle à quatre sous-notes : sans lui, la carte affiche 115 % et le
 *     formulaire 100 %, sans qu'on sache lequel fait foi.
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
	const { default: StageForm } = await import('./StageForm');
	return renderToStaticMarkup(
		React.createElement(StageForm, { onSubmit: () => {}, onCancel: () => {}, initialValues })
	);
};

const interrupteurAcquise = (html: string) => html.match(/<button[^>]*id="acquise"[^>]*>/)?.[0] ?? '';

const base: ProfessionalExperience = {
	id: 's', type: 'stage', startDate: '', duration: 0,
	validationPercentage: 115, coalitionBoost: 0, isSimulation: true, xpEarned: 60_000,
};

describe('StageForm — « Expérience déjà acquise »', () => {
	it('propose le choix', async () => {
		const html = await rendu();
		expect(html).toContain('Expérience déjà acquise');
		expect(interrupteurAcquise(html)).not.toBe('');
	});

	it('par défaut, une NOUVELLE saisie est une simulation', async () => {
		expect(interrupteurAcquise(await rendu())).toContain('aria-checked="false"');
	});

	it('rouvre une expérience marquée ACQUISE dans cet état', async () => {
		const html = await rendu({ ...base, isSimulation: false, simulationExplicite: true });
		expect(interrupteurAcquise(html)).toContain('aria-checked="true"');
	});

	it('traite un enregistrement SANS choix explicite comme une simulation', async () => {
		const html = await rendu({ ...base, isSimulation: false });
		expect(interrupteurAcquise(html)).toContain('aria-checked="false"');
	});
});

describe('StageForm — note orpheline', () => {
	it('AVERTIT quand l’expérience n’a pas de sous-notes', async () => {
		const html = await rendu({ ...base, validationPercentage: 115 });
		expect(html).toContain('stage-form__note-orpheline');
		expect(html).toContain('115');
	});

	it('n’avertit PAS quand les sous-notes existent', async () => {
		const html = await rendu({
			...base,
			subNotes: { duration: 110, mid: 100, final: 100, peer: 100 },
		});
		expect(html).not.toContain('stage-form__note-orpheline');
	});

	it('n’avertit PAS sur une création', async () => {
		expect(await rendu()).not.toContain('stage-form__note-orpheline');
	});
});
