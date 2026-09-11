import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Le bandeau d'avertissement est-il RÉELLEMENT rendu sur un refus d'origine ?
 *
 * Test par rendu de l'arbre de routes, et non par expression régulière sur le
 * source. Un audit par mutation a montré trois fois que les secondes ne
 * détectent rien : `{false && origineRefusee(originAllowed) && <OriginWarning/>}`
 * laissait toutes les assertions vertes alors que le bandeau ne s'affichait plus
 * jamais — c'est-à-dire que la livraison entière était neutralisée en un mot.
 *
 * Seuls les hooks de données sont bouchonnés ; `AppRoutes`, le contexte
 * d'origine, le bandeau et la page de connexion sont les vrais.
 */

const etat = { originAllowed: null as boolean | null, configured: true as boolean | null };

vi.mock('@/hooks/useSetupCheck', () => ({
	useSetupCheck: () => ({
		isConfigured: etat.configured,
		isChecking: false,
		originAllowed: etat.originAllowed,
		checkSetupStatus: () => {},
	}),
}));
vi.mock('@/contexts/useAuth', () => ({ useAuth: () => ({ isAuthenticated: false, login: () => {} }) }));
vi.mock('@/contexts/useViewingUser', () => ({ useViewingUser: () => ({ viewingUser: null }) }));
vi.mock('@/components/PrivacyChoiceModal/PrivacyGate', () => ({ default: () => null }));
vi.mock('@/components/GithubLink/GithubLink', () => ({ default: () => null }));

// `window` est TOUJOURS remplacé, puis restauré à l'identique. Une version
// antérieure sautait quand `window` existait déjà : un autre fichier de test en
// laissant un incomplet derrière lui (`setup.service.test.ts` le faisait), celui-ci
// l'adoptait tel quel et tombait sur « addEventListener is not a function ». Le
// garde transformait une fuite en panne dure au lieu de s'en protéger.
const fenetreAvant = (globalThis as Record<string, unknown>).window;
beforeAll(() => {
	(globalThis as Record<string, unknown>).window = {
		location: { origin: 'https://copie.exemple.fr' },
		addEventListener: () => {},
		removeEventListener: () => {},
		matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
	};
});
afterAll(() => {
	if (fenetreAvant === undefined) delete (globalThis as Record<string, unknown>).window;
	else (globalThis as Record<string, unknown>).window = fenetreAvant;
});

const rendu = async (valeur: boolean | null, configured: boolean | null = true) => {
	etat.originAllowed = valeur;
	etat.configured = configured;
	const { AppRoutes } = await import('./App');
	return renderToStaticMarkup(
		React.createElement(MemoryRouter, { initialEntries: ['/'] }, React.createElement(AppRoutes))
	);
};

describe('AppRoutes — bandeau d’origine', () => {
	it('AFFICHE le bandeau sur un refus explicite', async () => {
		expect(await rendu(false)).toContain('class="origin-warning"');
	});

	it('ne l’affiche pas quand l’origine est acceptée', async () => {
		expect(await rendu(true)).not.toContain('origin-warning');
	});

	it('ne l’affiche pas tant qu’on ne sait pas', async () => {
		// `null` au premier rendu et à chaque hoquet : avertir là, ce serait
		// affirmer sans avoir vérifié — la faute même qu'on corrige.
		expect(await rendu(null)).not.toContain('origin-warning');
	});

	it('désactive AUSSI le bouton de connexion, et non le bandeau seul', async () => {
		// Les deux passent par le même verdict, mais par deux chemins : le bandeau
		// lit `originAllowed` directement, le bouton le reçoit par le contexte.
		// Un contexte trafiqué affichait l'avertissement tout en laissant le bouton
		// actif — le visiteur lit « ça ne marchera pas », clique quand même, et
		// atterrit ailleurs. Avertir sans empêcher ne vaut pas mieux que se taire.
		const html = await rendu(false);
		expect(html).toContain('class="origin-warning"');
		const bouton = html.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*?Se connecter avec 42/);
		expect(bouton?.[0]).toContain('disabled');
	});

	it('n’annonce PAS « non configurée » tant qu’on ne sait pas', async () => {
		// Même confusion `null` / `false` que pour l'origine, un étage plus haut :
		// `isConfigured !== true` afficherait l'écran d'installation pendant tout
		// l'intervalle d'incertitude, y compris au premier rendu.
		expect(await rendu(null, null)).toContain('Se connecter avec 42');
		expect(await rendu(null, false)).not.toContain('Se connecter avec 42');
	});

	it('laisse la page rendue dans tous les cas', async () => {
		// Le bandeau AVERTIT, il ne remplace pas l'application. Un écran plein a
		// été livré ici puis retiré : il éteignait un miroir servi sur un port
		// différent de son APP_DOMAIN, là où seule la connexion était cassée.
		for (const valeur of [false, true, null] as const) {
			expect(await rendu(valeur)).toContain('Se connecter avec 42');
		}
	});
});
