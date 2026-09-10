import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
// `?raw` de Vite : le fichier est importé comme TEXTE. Évite d'ajouter les types
// Node au tsconfig du frontend pour un seul test.
import mainSource from '../../main.tsx?raw';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * Le filet de dernier recours de l'application.
 *
 * CE QUE CES TESTS COUVRENT — et surtout ce qu'ils NE couvrent PAS.
 *
 * `vitest.config.ts` tourne en `environment: 'node'`, sans jsdom : un composant ne
 * peut pas être monté, donc l'interception réelle d'une erreur de rendu par React
 * n'est pas éprouvable ici. Un audit l'a montré crûment — on pouvait débrancher le
 * boundary de `main.tsx` sans qu'un seul test ne tombe, et un test prétendait
 * vérifier l'interception alors qu'il vérifiait exactement l'inverse.
 *
 * On teste donc ce qui EST vérifiable sans DOM :
 *  - le contrat statique (`getDerivedStateFromError`) qui décide du repli ;
 *  - le contenu du repli, y compris sur une valeur lancée qui n'est pas une Error ;
 *  - le CÂBLAGE dans `main.tsx`, seul moyen ici d'attraper un débranchement.
 *
 * Reste non couvert, faute de DOM : le clic sur « Recharger », le contournement de
 * cache, et l'interception elle-même.
 */

const rendu = (error: unknown) => {
	const b = new ErrorBoundary({ children: null });
	b.state = { aEchoue: true, error };
	return renderToStaticMarkup(b.render() as React.ReactElement);
};

describe('ErrorBoundary', () => {
	it('laisse passer les enfants quand rien n’a échoué', () => {
		const b = new ErrorBoundary({ children: React.createElement('p', null, 'contenu normal') });
		b.state = { aEchoue: false, error: null };
		expect(renderToStaticMarkup(b.render() as React.ReactElement)).toContain('contenu normal');
	});

	it('bascule sur le repli dès qu’une erreur survient', () => {
		const etat = ErrorBoundary.getDerivedStateFromError(new Error('boum'));
		expect(etat.aEchoue).toBe(true);
		expect((etat.error as Error).message).toBe('boum');
	});

	it('bascule aussi sur une valeur lancée FALSY', () => {
		// `throw null` est du JavaScript légal. Tant que l'état ne portait que
		// l'erreur, une valeur falsy re-rendait le sous-arbre fautif : boucle.
		for (const valeur of [null, undefined, 0, '']) {
			expect(ErrorBoundary.getDerivedStateFromError(valeur).aEchoue).toBe(true);
		}
	});

	it('affiche un message, une porte de sortie et le détail technique', () => {
		const html = rendu(new Error('boum pendant le rendu'));
		expect(html).toContain('interrompu');
		expect(html).toContain('Recharger la page');
		expect(html).toContain('accueil');
		expect(html).toContain('role="alert"');
	});

	it('affiche le message même sans pile d’appel', () => {
		// Sans `stack`, l'assertion d'origine passait grâce à la pile — qui répète le
		// message. Elle ne distinguait donc pas « message affiché » de « pile affichée ».
		const sansPile = new Error('message seul');
		sansPile.stack = '';
		expect(rendu(sansPile)).toContain('message seul');
	});

	it('affiche quelque chose de lisible même si la valeur n’est pas une Error', () => {
		expect(rendu('juste une chaîne')).toContain('juste une chaîne');
		expect(rendu(null)).toContain('null');
	});

	it('ne dépend pas de la feuille de styles pour être visible', () => {
		// Styles en ligne : le composant couvre aussi le cas où le CSS n'a pas chargé.
		const html = rendu(new Error('x'));
		expect(html).toContain('min-height:100vh');
	});

	it('est bien CÂBLÉ autour de l’application dans main.tsx', () => {
		// Le seul mutant que les tests ne voyaient pas : débrancher le boundary de
		// `main.tsx` laissait la suite entièrement verte, alors que c'est précisément
		// la régression qui ramène l'écran noir muet.
		expect(mainSource).toMatch(/import\s+ErrorBoundary\s+from/);
		expect(mainSource).toMatch(/<ErrorBoundary>[\s\S]*<App\s*\/>[\s\S]*<\/ErrorBoundary>/);
	});
});
