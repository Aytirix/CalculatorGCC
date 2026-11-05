import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import ProfExpList from './ProfExpList';
import type { ProfessionalExperience } from '@/types/professionalExperience.types';

/**
 * Le MARQUEUR de simulation sur la liste des expériences.
 *
 * Deux expériences visuellement identiques pouvaient être comptées
 * différemment — l'une dans les acquis du RNCP, l'autre non — sans que rien ne
 * le montre. Le badge et la pastille verte sont donc la seule chose qui distingue
 * les deux à l'écran : les vérifier par RENDU, et non par expression régulière
 * sur le source, est la seule façon de voir une condition inversée.
 */

const exp = (p: Partial<ProfessionalExperience>): ProfessionalExperience => ({
	id: 'x', type: 'alternance', startDate: '', duration: 1,
	validationPercentage: 110, coalitionBoost: 0, isSimulation: true,
	simulationExplicite: true, xpEarned: 90_000, ...p,
});

const rendu = (experiences: ProfessionalExperience[]) =>
	renderToStaticMarkup(
		React.createElement(ProfExpList, {
			entries: [], evalsByParent: {}, manualExperiences: experiences,
			getParentKey: () => '', onDeleteManual: () => {}, onEditManual: () => {},
			apiExpPercentages: {}, onApiExpPercentageChange: () => {},
		})
	);

describe('ProfExpList — simulé vs acquis', () => {
	it('MARQUE une expérience simulée', () => {
		const html = rendu([exp({ isSimulation: true })]);
		expect(html).toContain('prof-exp-pill--simulated');
		expect(html).toContain('Simulée');
	});

	it('ne marque PAS une expérience acquise', () => {
		expect(rendu([exp({ isSimulation: false })])).not.toContain('prof-exp-pill--simulated');
	});

	it('réserve la pastille verte aux expériences ACQUISES', () => {
		// `validated` sur une simulation contredirait, sur la même page, le calcul
		// qui vient de la déclasser en projection.
		expect(rendu([exp({ isSimulation: false })])).toContain('prof-exp-pill--validated');
		expect(rendu([exp({ isSimulation: true })])).not.toContain('validated');
	});

	it('affiche le pourcentage dans les deux cas', () => {
		expect(rendu([exp({ isSimulation: true })])).toContain('110 %');
		expect(rendu([exp({ isSimulation: false })])).toContain('110 %');
	});
});

const alternanceApi = {
	id: 4549567, final_mark: null, validated: false, status: 'in_progress',
	project: { id: 1, name: 'FR - Alternance - RNCP7 - 2 ans', slug: 'fr-alternance-rncp7-2-ans' },
} as never;

const renduApi = (props: Record<string, unknown>) =>
	renderToStaticMarkup(
		React.createElement(ProfExpList, {
			entries: [alternanceApi], evalsByParent: {}, manualExperiences: [],
			getParentKey: () => '', onDeleteManual: () => {}, onEditManual: () => {},
			apiExpPercentages: {}, onApiExpPercentageChange: () => {},
			onToggleDisabled: () => {}, ...props,
		})
	);

describe('ProfExpList — expérience détectée désactivable', () => {
	it('active : pourcentage réglable, XP prévu, bouton « Désactiver »', () => {
		const html = renduApi({});
		expect(html).toMatch(/180\s000 XP prévus/);
		expect(html).toContain('Désactiver');
		expect(html).toContain('<input');
	});

	it('désactivée : barrée, plus d’XP prévu ni de réglage, « Réactiver » et l’explication', () => {
		const html = renduApi({ disabledIds: [4549567] });
		expect(html).toContain('is-disabled');
		expect(html).toContain('Désactivée');
		expect(html).toContain('Réactiver');
		expect(html).toContain('Ne compte plus');
		expect(html).not.toContain('XP prévus');
		expect(html).not.toContain('<input');
	});

	it('consultation : ni bouton ni réglage', () => {
		const html = renduApi({ readOnly: true });
		expect(html).not.toContain('Désactiver');
		expect(html).not.toContain('<input');
	});
});

