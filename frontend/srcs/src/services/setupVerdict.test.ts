import { describe, it, expect } from 'vitest';
import { lireVerdictSetup, prochainConfigured } from './setupVerdict';
import type { SetupStatus } from './setup.service';

/**
 * Ce que le frontend retient de `/setup/status`.
 *
 * Cette logique vivait dans `useSetupCheck`, donc dans un hook — intestable ici,
 * `vitest.config.ts` tournant en `environment: 'node'` sans jsdom. Les seuls tests
 * possibles étaient alors des expressions régulières sur le texte source, et un
 * audit par mutation a montré qu'ils ne détectaient RIEN : onze mutants
 * préservant ce texte ont survécu, dont ceux qui rendaient la branche de refus
 * inatteignable. Extraite, la décision se vérifie par son résultat.
 */

const reponse = (partiel: Partial<SetupStatus>): (() => Promise<SetupStatus>) =>
	async () => ({ configured: true, message: 'ok', ...partiel });

/** Une erreur telle qu'axios la présente, avec le corps du serveur. */
const echec = (data?: unknown) => async (): Promise<SetupStatus> => {
	throw data === undefined ? new Error('réseau') : { response: { data } };
};

describe('lireVerdictSetup', () => {
	it('retient un refus d’origine explicite', async () => {
		// LE cas qui fait tout exister : sans ce `false`, rien n'avertit jamais.
		expect(await lireVerdictSetup(reponse({ origin_allowed: false })))
			.toEqual({ configured: true, originAllowed: false });
	});

	it('retient une origine acceptée', async () => {
		expect((await lireVerdictSetup(reponse({ origin_allowed: true }))).originAllowed).toBe(true);
	});

	it('ne conclut RIEN sur un champ absent', async () => {
		// Instance antérieure à ce contrôle. En déduire « non autorisée » ferait
		// avertir à tort tout miroir pointé sur une principale pas encore à jour.
		expect((await lireVerdictSetup(reponse({}))).originAllowed).toBeNull();
	});

	it('ne conclut RIEN sur un null explicite', async () => {
		// L'instance dit « je ne fais pas autorité » : miroir applicatif, ou
		// domaine propre inconnu. C'est une non-réponse, pas un refus.
		expect((await lireVerdictSetup(reponse({ origin_allowed: null }))).originAllowed).toBeNull();
	});

	it('ne conclut RIEN sur une valeur d’un type inattendu', async () => {
		const bizarre = reponse({ origin_allowed: 'oui' as unknown as boolean });
		expect((await lireVerdictSetup(bizarre)).originAllowed).toBeNull();
	});

	it('revient à l’inconnu quand la requête échoue', async () => {
		// Sans cela, un `false` obtenu plus tôt restait affiché alors qu'on ne
		// savait plus rien : un avertissement qu'aucune réponse ne soutient.
		expect((await lireVerdictSetup(echec())).originAllowed).toBeNull();
	});

	it('ne laisse jamais échapper l’erreur', async () => {
		// Le premier rendu de l'application en dépend : une exception ici laisserait
		// l'écran de chargement en place pour toujours.
		await expect(lireVerdictSetup(echec())).resolves.toBeDefined();
	});

	describe('configured', () => {
		it('ne conclut « non configurée » que sur une réponse explicite du serveur', async () => {
			expect((await lireVerdictSetup(echec({ configured: false }))).configured).toBe(false);
			expect((await lireVerdictSetup(echec({ setupRequired: true }))).configured).toBe(false);
		});

		it('reste dans l’inconnu sur une panne réseau', async () => {
			// « Le serveur DIT qu'il n'est pas configuré » et « le serveur ne répond
			// pas » sont deux choses différentes : les confondre fait mentir l'écran
			// « ce site n'a pas encore reçu ses identifiants » à chaque hoquet.
			expect((await lireVerdictSetup(echec())).configured).toBeNull();
			expect((await lireVerdictSetup(echec({}))).configured).toBeNull();
			expect((await lireVerdictSetup(echec({ configured: true }))).configured).toBeNull();
		});

		it('transmet la réponse nominale', async () => {
			expect((await lireVerdictSetup(reponse({ configured: false }))).configured).toBe(false);
			expect((await lireVerdictSetup(reponse({ configured: true }))).configured).toBe(true);
		});
	});
});

describe('prochainConfigured', () => {
	it('ne revient JAMAIS de « configurée » à « non configurée »', () => {
		// LA régression : depuis que le porteur de jeton interroge cette route, un
		// `false` explicite remplaçait toute l'application par « non configurée » en
		// pleine session. Deux chemins le renvoient pour de bon — miroir applicatif
		// sans credentials 42, et credentials qui ne déchiffrent plus.
		expect(prochainConfigured(true, false)).toBe(true);
	});

	it('ne conclut rien sur un inconnu', () => {
		for (const precedent of [true, false, null] as const) {
			expect(prochainConfigured(precedent, null)).toBe(precedent);
		}
	});

	it('accepte la première réponse, quelle qu’elle soit', () => {
		expect(prochainConfigured(null, false)).toBe(false);
		expect(prochainConfigured(null, true)).toBe(true);
	});

	it('laisse « non configurée » devenir « configurée »', () => {
		// Le sens utile : on renseigne les identifiants depuis le panneau, on revient.
		expect(prochainConfigured(false, true)).toBe(true);
	});
});
