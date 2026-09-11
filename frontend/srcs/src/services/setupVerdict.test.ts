import { describe, it, expect } from 'vitest';
import {
	lireVerdictSetup,
	prochainConfigured,
	doitInterroger,
	rafraichirStatut,
	INTERVALLE_MIN_MS,
} from './setupVerdict';
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

describe('doitInterroger', () => {
	it('interroge à la toute première occasion', () => {
		// `dernierInstant` vaut 0 au montage : la première vérification ne doit
		// jamais être escamotée par le plafond.
		expect(doitInterroger(Date.now(), 0)).toBe(true);
	});

	it('ne réinterroge pas dans la foulée', () => {
		// Sinon chaque navigation coûte une requête à tout le monde.
		const t = 1_000_000;
		expect(doitInterroger(t + 1, t)).toBe(false);
		expect(doitInterroger(t + INTERVALLE_MIN_MS - 1, t)).toBe(false);
	});

	it('réinterroge une fois le délai écoulé', () => {
		// Sinon une origine révoquée reste invisible, ce qui était le bug.
		const t = 1_000_000;
		expect(doitInterroger(t + INTERVALLE_MIN_MS, t)).toBe(true);
		expect(doitInterroger(t + INTERVALLE_MIN_MS * 10, t)).toBe(true);
	});

	it('obéit toujours à une demande explicite', () => {
		// Un bouton « Réessayer » ne doit pas se heurter au plafond.
		expect(doitInterroger(1_000_000, 1_000_000, true)).toBe(true);
	});

	it('garde un plafond utile — ni nul, ni d’une durée absurde', () => {
		// Un plafond à zéro rétablit une requête par clic ; un plafond de plusieurs
		// heures rétablit le bug qu'il corrige.
		expect(INTERVALLE_MIN_MS).toBeGreaterThan(1_000);
		expect(INTERVALLE_MIN_MS).toBeLessThanOrEqual(120_000);
	});
});

describe('rafraichirStatut', () => {
	/** Un espion pour chacun des trois états du hook. */
	const espions = () => {
		const etat = { isChecking: true, isConfigured: null as boolean | null, originAllowed: undefined as unknown };
		return {
			etat,
			setters: {
				setIsChecking: (v: boolean) => { etat.isChecking = v; },
				setIsConfigured: (calcul: (p: boolean | null) => boolean | null) => {
					etat.isConfigured = calcul(etat.isConfigured);
				},
				setOriginAllowed: (v: boolean | null) => { etat.originAllowed = v; },
			},
		};
	};
	const repond = (origin_allowed: boolean | null, configured = true) =>
		async () => ({ configured, message: 'ok', origin_allowed });

	it('POSE le verdict d’origine reçu — c’est toute la raison d’être du dispositif', async () => {
		// Le mutant qui a imposé cette extraction : `setOriginAllowed(null)` au lieu
		// du verdict laissait 137 tests verts en rétablissant la panne d'origine.
		const { etat, setters } = espions();
		await rafraichirStatut({
			maintenant: 1e6, dernierInstant: 0, forcer: false,
			commencer: () => 1,
			lire: repond(false), estPerime: () => false, setters,
		});
		expect(etat.originAllowed).toBe(false);
	});

	it('transmet aussi un accord et une incertitude, sans les confondre', async () => {
		for (const attendu of [true, null] as const) {
			const { etat, setters } = espions();
			await rafraichirStatut({
				maintenant: 1e6, dernierInstant: 0, forcer: false,
				commencer: () => 1,
				lire: repond(attendu), estPerime: () => false, setters,
			});
			expect(etat.originAllowed).toBe(attendu);
		}
	});

	it('lève l’écran de chargement', async () => {
		const { etat, setters } = espions();
		await rafraichirStatut({
			maintenant: 1e6, dernierInstant: 0, forcer: false,
			commencer: () => 1,
			lire: repond(true), estPerime: () => false, setters,
		});
		expect(etat.isChecking).toBe(false);
	});

	it('RESPECTE le plafond : n’interroge pas et ne touche à rien', async () => {
		// Sans cette garde, chaque navigation coûte une requête à tout le monde.
		let lu = 0;
		let commence = 0;
		const { etat, setters } = espions();
		const aInterroge = await rafraichirStatut({
			maintenant: 1e6, dernierInstant: 1e6, forcer: false,
			commencer: () => 1,
			lire: async () => { lu++; return { configured: true, message: 'ok', origin_allowed: false }; },
			estPerime: () => false, setters,
		});
		expect(aInterroge).toBe(false);
		expect(lu).toBe(0);
		// Et surtout : l'instant n'est PAS mémorisé pour un appel qui n'a rien émis.
		expect(commence).toBe(0);
		expect(etat.originAllowed).toBeUndefined();
		expect(etat.isChecking).toBe(true);
	});

	it('obéit à une demande explicite malgré le plafond', async () => {
		const { etat, setters } = espions();
		const aInterroge = await rafraichirStatut({
			maintenant: 1e6, dernierInstant: 1e6, forcer: true,
			commencer: () => 1,
			lire: repond(false), estPerime: () => false, setters,
		});
		expect(aInterroge).toBe(true);
		expect(etat.originAllowed).toBe(false);
	});

	it('ÉCARTE une réponse périmée, mais lève quand même le chargement', async () => {
		// Une réponse lente d'un appel dépassé ne doit pas écraser la plus récente.
		// Mais sortir sans relâcher `isChecking` figeait « Loading… » à vie.
		const { etat, setters } = espions();
		await rafraichirStatut({
			maintenant: 1e6, dernierInstant: 0, forcer: false,
			commencer: () => 1,
			lire: repond(false), estPerime: () => true, setters,
		});
		expect(etat.originAllowed).toBeUndefined();
		expect(etat.isChecking).toBe(false);
	});

	it('applique la règle de monotonie à `configured`', async () => {
		const { etat, setters } = espions();
		etat.isConfigured = true;
		await rafraichirStatut({
			maintenant: 1e6, dernierInstant: 0, forcer: false,
			commencer: () => 1,
			lire: repond(true, false), estPerime: () => false, setters,
		});
		expect(etat.isConfigured).toBe(true);
	});

	it('MÉMORISE l’instant AVANT la lecture, pas après', async () => {
		// Le plafond doit couvrir la requête EN VOL. Mémoriser après l'attente
		// laissait deux navigations rapprochées émettre deux appels — « une requête
		// par navigation », exactement ce que le plafond existe pour éviter.
		const ordre: string[] = [];
		const { setters } = espions();
		await rafraichirStatut({
			maintenant: 1e6, dernierInstant: 0, forcer: false,
			commencer: () => { ordre.push('commencer'); return 1; },
			lire: async () => { ordre.push('lire'); return { configured: true, message: 'ok', origin_allowed: true }; },
			estPerime: () => false, setters,
		});
		expect(ordre).toEqual(['commencer', 'lire']);
	});

	it('confronte la réponse au numéro d’ordre de SON appel', async () => {
		// `estPerime` reçoit le numéro rendu par `commencer` : sans ce lien, un
		// appel plafonné — qui n'émet rien — pouvait périmer la réponse en vol.
		let recu = -1;
		const { setters } = espions();
		await rafraichirStatut({
			maintenant: 1e6, dernierInstant: 0, forcer: false,
			commencer: () => 7,
			lire: repond(false),
			estPerime: (numero) => { recu = numero; return false; },
			setters,
		});
		expect(recu).toBe(7);
	});
});
