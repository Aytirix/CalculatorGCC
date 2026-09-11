import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { OriginStatusContext } from '../../contexts/OriginStatusContext';

/**
 * Le bouton « Se connecter avec 42 » se désactive-t-il VRAIMENT ?
 *
 * Test par RENDU, et non par expression régulière sur le source. Un audit par
 * mutation a montré trois fois que les secondes ne détectent rien : insérer
 * `&& false` après la condition la rendait inatteignable sans toucher au texte
 * épinglé, le bouton restait actif, et la suite restait verte. Ici, le mutant
 * change la sortie — donc le test tombe.
 *
 * `vitest.config.ts` tourne en `environment: 'node'`. Pas d'obstacle :
 * `renderToStaticMarkup` est fait pour ça, `MemoryRouter` n'a pas besoin de DOM,
 * et seul `useAuth` est bouchonné — le composant testé reste le vrai.
 */

vi.mock('../../contexts/useAuth', () => ({ useAuth: () => ({ login: () => {} }) }));

let fenetreAjoutee = false;
beforeAll(() => {
	// framer-motion inspecte `window` au chargement ; il n'a besoin de rien d'autre.
	if (typeof (globalThis as Record<string, unknown>).window === 'undefined') {
		(globalThis as Record<string, unknown>).window = {
			location: { origin: 'https://copie.exemple.fr' },
			addEventListener: () => {},
			removeEventListener: () => {},
			matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
		};
		fenetreAjoutee = true;
	}
});
afterAll(() => {
	if (fenetreAjoutee) delete (globalThis as Record<string, unknown>).window;
});

const rendu = async (originAllowed: boolean | null) => {
	const { default: Login } = await import('./Login');
	return renderToStaticMarkup(
		React.createElement(
			MemoryRouter,
			null,
			React.createElement(
				OriginStatusContext.Provider,
				{ value: { originAllowed } },
				React.createElement(Login)
			)
		)
	);
};

/** Le `<button>` qui porte le libellé de connexion 42. */
const boutonConnexion = (html: string) => {
	const m = html.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*?Se connecter avec 42/);
	return m ? m[0] : '';
};

describe('Login — bouton de connexion 42', () => {
	it('est DÉSACTIVÉ quand l’origine est refusée', async () => {
		// Le cœur de la livraison : un bouton qui mène ailleurs sans le dire est
		// pire qu'un bouton éteint.
		const bouton = boutonConnexion(await rendu(false));
		expect(bouton).not.toBe('');
		expect(bouton).toContain('disabled');
	});

	it('reste ACTIF quand l’origine est acceptée', async () => {
		expect(boutonConnexion(await rendu(true))).not.toContain('disabled');
	});

	it('reste ACTIF tant qu’on ne sait pas', async () => {
		// `null` au premier rendu et à chaque hoquet réseau. Désactiver là
		// couperait la connexion pour tout le monde, principale comprise.
		expect(boutonConnexion(await rendu(null))).not.toContain('disabled');
	});

	it('explique pourquoi, et rattache l’explication au bouton', async () => {
		const html = await rendu(false);
		expect(boutonConnexion(html)).toContain('aria-describedby="login-note"');
		expect(html).toMatch(/id="login-note"[^>]*>[^<]*indisponible/);
	});

	it('garde sa note d’usage habituelle quand tout va bien', async () => {
		// L'apostrophe ressort échappée en `&#x27;` : on cherche de part et d'autre.
		expect(await rendu(true)).toMatch(/Connexion via l.{0,8}intra 42/);
	});
});
