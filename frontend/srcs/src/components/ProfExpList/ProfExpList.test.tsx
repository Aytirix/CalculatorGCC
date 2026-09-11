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
		expect(html).toContain('prof-exp-item__simule');
		expect(html).toContain('Simulé');
	});

	it('ne marque PAS une expérience acquise', () => {
		expect(rendu([exp({ isSimulation: false })])).not.toContain('prof-exp-item__simule');
	});

	it('réserve la pastille verte aux expériences ACQUISES', () => {
		// `validated` sur une simulation contredirait, sur la même page, le calcul
		// qui vient de la déclasser en projection.
		expect(rendu([exp({ isSimulation: false })])).toContain('prof-exp-item__status validated');
		expect(rendu([exp({ isSimulation: true })])).not.toContain('validated');
	});

	it('affiche le pourcentage dans les deux cas', () => {
		expect(rendu([exp({ isSimulation: true })])).toContain('110%');
		expect(rendu([exp({ isSimulation: false })])).toContain('110%');
	});
});
