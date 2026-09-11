import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import appSource from '../../App.tsx?raw';
import loginSource from '../../pages/Login/Login.tsx?raw';

/**
 * Le bandeau « la connexion 42 ne peut pas aboutir depuis cette adresse ».
 *
 * `vitest.config.ts` tourne en `environment: 'node'`, sans jsdom. Un audit a
 * montré que l'excuse ne tenait pas pour autant : `ErrorBoundary.test.tsx` rend
 * déjà un composant via `renderToStaticMarkup`. On rend donc le vrai composant,
 * avec un `window` minimal — ce qui attrape les mutants qu'aucune regex ne voit
 * (un composant qui ne rend plus rien, un rôle ARIA retiré).
 *
 * Restent vérifiés par CÂBLAGE, faute de pouvoir monter l'arbre : la présence du
 * bandeau dans `App` et la désactivation du bouton dans `Login`. C'est plus
 * faible, et c'est dit.
 */

// Volontairement SANS le mot « miroir » : un test plus bas vérifie que le
// libellé ne l'emploie pas, et la fixture ne doit pas le lui souffler.
const ORIGINE = 'https://copie.exemple.fr';
let fenetreAjoutee = false;

beforeAll(() => {
	if (typeof (globalThis as Record<string, unknown>).window === 'undefined') {
		(globalThis as Record<string, unknown>).window = { location: { origin: ORIGINE } };
		fenetreAjoutee = true;
	}
});
afterAll(() => {
	if (fenetreAjoutee) delete (globalThis as Record<string, unknown>).window;
});

const rendu = async () => {
	const { default: OriginWarning } = await import('./OriginWarning');
	return renderToStaticMarkup(React.createElement(OriginWarning));
};

describe('OriginWarning', () => {
	it('rend quelque chose de visible', async () => {
		// Mutant attrapé : un composant qui renvoie `null` laissait tous les tests
		// de câblage au vert, bandeau invisible.
		const html = await rendu();
		expect(html.length).toBeGreaterThan(100);
		expect(html).toContain('origin-warning');
	});

	it('dit la conséquence concrète, pas seulement qu’il y a un problème', async () => {
		const html = await rendu();
		expect(html).toContain('connexion');
		// Ce que risque le visiteur : partir ailleurs sans explication.
		expect(html).toMatch(/renvoyé|déclarée/);
	});

	it('affiche l’adresse exacte à déclarer', async () => {
		// C'est la seule information actionnable : sans elle, l'administrateur doit
		// deviner la chaîne que le panneau attend.
		expect(await rendu()).toContain(ORIGINE);
	});

	it('est annoncé aux lecteurs d’écran', async () => {
		// `status` et non `alert` : l'information est importante mais n'interrompt
		// pas une action en cours, et le bandeau reste affiché en permanence.
		expect(await rendu()).toContain('role="status"');
	});

	it('ne parle pas de « miroir » — le cas principal existe aussi', async () => {
		// La même réponse survient sur une instance principale dont l'APP_DOMAIN ne
		// correspond pas au domaine servi ; y parler de miroir serait faux.
		expect((await rendu()).toLowerCase()).not.toContain('miroir');
	});
});

describe('câblage', () => {
	it('App affiche le bandeau sur un refus EXPLICITE', async () => {
		expect(appSource).toMatch(/import OriginWarning from/);
		expect(appSource).toMatch(/originAllowed === false && <OriginWarning \/>/);
	});

	it('App ne remplace plus toute la page', async () => {
		// La régression corrigée : l'écran plein éteignait un miroir servi sur un
		// port différent de son APP_DOMAIN, là où seule la connexion était cassée.
		expect(appSource).not.toMatch(/return <OriginNotAllowed/);
	});

	it('Login désactive le bouton plutôt que de mentir', async () => {
		expect(loginSource).toMatch(/originAllowed === false/);
		expect(loginSource).toMatch(/disabled=\{connexionImpossible\}/);
	});
});
