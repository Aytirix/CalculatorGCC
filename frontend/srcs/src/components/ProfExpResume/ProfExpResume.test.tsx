import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import ProfExpResume from './ProfExpResume';
import type { ProfessionalExperience } from '@/types/professionalExperience.types';

/**
 * Le récapitulatif avait disparu avec la page « Expérience professionnelle », et
 * avec lui la seule vue de la part SIMULÉE. Ces tests rendent le composant : un
 * `filter` inversé entre acquis et simulé passerait sans bruit à la relecture.
 */

const exp = (p: Partial<ProfessionalExperience>): ProfessionalExperience => ({
	id: 'x', type: 'stage', startDate: '', duration: 6,
	validationPercentage: 115, coalitionBoost: 0, isSimulation: true,
	simulationExplicite: true, xpEarned: 10_000, ...p,
});

const rendu = (experiences: ProfessionalExperience[]) =>
	renderToStaticMarkup(React.createElement(ProfExpResume, { experiences }));

/** Le même formatage que le composant : l'espace des milliers dépend de l'ICU. */
const xp = (n: number) => `${n.toLocaleString('fr-FR')} XP`;

describe('ProfExpResume', () => {
	it('ne rend RIEN sans expérience', () => {
		expect(rendu([])).toBe('');
	});

	it('sépare l’XP acquise de l’XP simulée', () => {
		const html = rendu([
			exp({ id: 'a', isSimulation: false, xpEarned: 30_000 }),
			exp({ id: 'b', isSimulation: true, xpEarned: 12_000 }),
		]);
		expect(html).toContain(xp(42_000));
		expect(html).toContain(xp(30_000));
		expect(html).toContain(xp(12_000));
	});

	it('affiche 0 XP simulée quand tout est acquis', () => {
		// La carte reste présente : son absence se lirait comme « pas de simulation
		// possible », alors que c'est « rien de simulé pour l'instant ».
		const html = rendu([exp({ isSimulation: false, xpEarned: 30_000 })]);
		expect(html).toContain('Simulé');
		expect(html).toContain(xp(0));
	});

	it('compte une alternance de 2 ans pour DEUX expériences', () => {
		// La règle métier du RNCP, et la raison pour laquelle ce n'est pas
		// `experiences.length` : l'en-tête annonçait « 1 expérience » au-dessus d'un
		// calcul qui en comptait deux.
		const html = rendu([exp({ type: 'alternance', duration: 2, isSimulation: false })]);
		expect(html).toContain('2 expériences');
		expect(html).not.toContain('1 expérience<');
	});

	it('répartit le décompte entre acquis et simulé', () => {
		const html = rendu([
			exp({ id: 'a', type: 'alternance', duration: 2, isSimulation: false }),
			exp({ id: 'b', type: 'stage', isSimulation: true }),
		]);
		// 3 au total, 2 acquises, 1 simulée.
		expect(html).toContain('3 expériences');
		expect(html).toContain('2 expériences');
		expect(html).toContain('1 expérience<');
	});

	it('accorde le singulier', () => {
		const html = rendu([exp({ isSimulation: false })]);
		expect(html).toContain('1 expérience<');
		expect(html).not.toContain('1 expériences');
	});
});
