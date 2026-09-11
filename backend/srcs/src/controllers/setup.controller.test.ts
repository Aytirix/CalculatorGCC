import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `/setup/status` — la réponse RÉELLEMENT mise sur le fil.
 *
 * `originGate.test.ts` couvre la décision, jamais le câblage qui la produit :
 * `faitAutorite()` n'avait AUCUN test, et sept mutants du contrôleur survivaient
 * en silence — dont celui qui réécrit `origin_allowed: originAllowed ?? true`,
 * c'est-à-dire la régression même que ce commit prétend corriger.
 */

const miroirActif = vi.fn((): boolean => false);
const dansLaListe = vi.fn(async (origine: string): Promise<boolean> => origine.length < 0);
const configuree = vi.fn(async (): Promise<boolean> => true);

vi.mock('../db/configRepository.js', () => ({ isConfigured: () => configuree() }));
vi.mock('../services/mirror.service.js', () => ({ isMirrorActiveCached: () => miroirActif() }));
vi.mock('../db/allowedOriginRepository.js', async () => {
	const reel = await vi.importActual<typeof import('../db/allowedOriginRepository.js')>(
		'../db/allowedOriginRepository.js'
	);
	return {
		normalizeOrigin: reel.normalizeOrigin,
		allowedOriginRepository: { isAllowed: (o: string) => dansLaListe(o) },
	};
});

const { setupController } = await import('./setup.controller.js');

/** Répond comme Fastify : `send` renvoie le corps, qu'on inspecte. */
const appeler = async (query: Record<string, unknown>) => {
	const reply = { send: (corps: unknown) => corps };
	return (await setupController.getStatus(
		{ query } as never,
		reply as never
	)) as { configured: boolean; origin_allowed: boolean | null; message: string };
};

const APP_DOMAIN = process.env.APP_DOMAIN;
beforeEach(() => {
	vi.clearAllMocks();
	miroirActif.mockReturnValue(false);
	dansLaListe.mockResolvedValue(false);
	configuree.mockResolvedValue(true);
	process.env.APP_DOMAIN = 'https://rncp.exemple.fr';
});
afterEach(() => {
	if (APP_DOMAIN === undefined) delete process.env.APP_DOMAIN;
	else process.env.APP_DOMAIN = APP_DOMAIN;
});

describe('GET /setup/status', () => {
	it('REFUSE une origine absente de la liste', async () => {
		expect((await appeler({ origin: 'https://intrus.fr' })).origin_allowed).toBe(false);
	});

	it('accepte une origine déclarée', async () => {
		dansLaListe.mockResolvedValue(true);
		expect((await appeler({ origin: 'https://miroir.exemple.fr' })).origin_allowed).toBe(true);
	});

	it('transmet à la liste blanche l’origine REÇUE, normalisée', async () => {
		// Sans cela, le contrôle porte sur autre chose que la question posée.
		await appeler({ origin: 'https://miroir.exemple.fr/page?x=1' });
		expect(dansLaListe).toHaveBeenCalledWith('https://miroir.exemple.fr');
	});

	describe('faitAutorite()', () => {
		it('rend null — et PAS true — quand APP_DOMAIN est absent', async () => {
			delete process.env.APP_DOMAIN;
			const corps = await appeler({ origin: 'https://miroir.exemple.fr' });
			expect(corps.origin_allowed).toBeNull();
			expect(dansLaListe).not.toHaveBeenCalled();
		});

		it('rend null — et PAS true — quand cette instance est elle-même un miroir', async () => {
			// Elle s'auto-autorisait : un feu vert sur la panne à signaler.
			miroirActif.mockReturnValue(true);
			const corps = await appeler({ origin: 'https://miroir.exemple.fr' });
			expect(corps.origin_allowed).toBeNull();
			expect(dansLaListe).not.toHaveBeenCalled();
		});

		it('tranche bel et bien quand les deux conditions sont réunies', async () => {
			// Le pendant : la garde ne doit pas tout désactiver.
			dansLaListe.mockResolvedValue(true);
			expect((await appeler({ origin: 'https://miroir.exemple.fr' })).origin_allowed).toBe(true);
		});
	});

	it('met le verdict sur le fil sous le nom `origin_allowed`, null compris', async () => {
		// Le frontend lit EXACTEMENT ce nom, et distingue `null` de `true`.
		// `origin_allowed: originAllowed ?? true` reproduirait la régression corrigée.
		miroirActif.mockReturnValue(true);
		const corps = await appeler({ origin: 'https://miroir.exemple.fr' });
		expect(Object.prototype.hasOwnProperty.call(corps, 'origin_allowed')).toBe(true);
		expect(corps.origin_allowed).toBeNull();
	});

	it('ne bloque pas l’appelant qui ne pose pas la question', async () => {
		expect((await appeler({})).origin_allowed).toBe(true);
	});

	it('rend aussi l’état de configuration', async () => {
		configuree.mockResolvedValue(false);
		const corps = await appeler({});
		expect(corps.configured).toBe(false);
		expect(corps.message).toMatch(/setup/i);
	});
});
