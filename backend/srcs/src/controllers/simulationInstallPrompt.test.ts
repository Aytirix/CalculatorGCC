import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

/**
 * `GET|PUT /simulation/install-prompt` — « Ne plus me le rappeler » sur le
 * bandeau « Installer l'application ».
 *
 * Testé de bout en bout côté HTTP (`fastify.inject`) sur les VRAIES routes et
 * le VRAI contrôleur ; seuls l'authentification et le dépôt sont remplacés. Le
 * dépôt factice garde l'état en mémoire, par utilisateur, pour vérifier
 * l'aller-retour PUT → GET.
 */

const etat = new Map<number, boolean>();
const enregistrer = vi.fn(
	async (id: number, _login: string, _img: string | null, dismissed: boolean, _prenom?: string | null, _nom?: string | null) => {
		etat.set(id, dismissed);
		return dismissed;
	}
);

vi.mock('../db/simulationRepository.js', () => ({
	simulationRepository: {
		getInstallPromptDismissed: async (id: number) => etat.get(id) ?? false,
		saveInstallPromptDismissed: (
			id: number,
			login: string,
			img: string | null,
			dismissed: boolean,
			prenom?: string | null,
			nom?: string | null
		) => enregistrer(id, login, img, dismissed, prenom, nom),
	},
}));

// Le JWT est remplacé par un en-tête de test : `x-test-user` = identifiant 42.
// Sans en-tête → 401, comme le vrai middleware sur un token absent.
vi.mock('../middlewares/auth.middleware.js', () => ({
	authenticate: async (request: { headers: Record<string, unknown>; user: unknown }, reply: { code: (c: number) => { send: (x: unknown) => unknown } }) => {
		const id = Number(request.headers['x-test-user']);
		if (!id) return reply.code(401).send({ error: 'Token invalide ou expiré' });
		request.user = { user_id_42: id, login: `user${id}`, image_url: null };
		return undefined;
	},
}));

const { simulationRoutes } = await import('../routes/simulation.routes.js');

const app = Fastify();
await app.register(simulationRoutes);
await app.ready();

const get = (user = 42, url = '/simulation/install-prompt') =>
	app.inject({ method: 'GET', url, headers: { 'x-test-user': String(user) } });

const put = (payload: unknown, user = 42, url = '/simulation/install-prompt') =>
	app.inject({
		method: 'PUT',
		url,
		headers: { 'x-test-user': String(user), 'content-type': 'application/json' },
		payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
	});

beforeEach(() => {
	etat.clear();
	enregistrer.mockClear();
});

describe('GET /simulation/install-prompt', () => {
	it('vaut false par défaut (jamais refusé, ou pas encore de ligne)', async () => {
		const res = await get();
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ dismissed: false });
	});

	it('exige une authentification', async () => {
		const res = await app.inject({ method: 'GET', url: '/simulation/install-prompt' });
		expect(res.statusCode).toBe(401);
	});
});

describe('PUT /simulation/install-prompt', () => {
	it('PUT true puis GET → true', async () => {
		const res = await put({ dismissed: true });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ dismissed: true });
		expect(enregistrer).toHaveBeenCalledWith(42, 'user42', null, true, undefined, undefined);

		expect((await get()).json()).toEqual({ dismissed: true });
	});

	it('PUT false annule le refus', async () => {
		await put({ dismissed: true });
		const res = await put({ dismissed: false });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ dismissed: false });
		expect((await get()).json()).toEqual({ dismissed: false });
	});

	it('REFUSE (400) tout ce qui n’est pas un vrai booléen, sans rien écrire', async () => {
		for (const tordu of [{}, { dismissed: 'true' }, { dismissed: 1 }, { dismissed: 0 }, { dismissed: null }, { autre: true }, [], 'true']) {
			const res = await put(tordu);
			expect(res.statusCode, JSON.stringify(tordu)).toBe(400);
		}
		// Corps absent
		const vide = await app.inject({ method: 'PUT', url: '/simulation/install-prompt', headers: { 'x-test-user': '42' } });
		expect(vide.statusCode).toBe(400);
		expect(enregistrer).not.toHaveBeenCalled();
		expect((await get()).json()).toEqual({ dismissed: false });
	});

	it('exige une authentification', async () => {
		const res = await app.inject({
			method: 'PUT', url: '/simulation/install-prompt',
			headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ dismissed: true }),
		});
		expect(res.statusCode).toBe(401);
		expect(enregistrer).not.toHaveBeenCalled();
	});

	it('écrit TOUJOURS sur le compte du JWT, jamais sur view_user_id', async () => {
		await put({ dismissed: true, view_user_id: 7 }, 42, '/simulation/install-prompt?view_user_id=7');
		expect(enregistrer).toHaveBeenCalledTimes(1);
		expect(enregistrer.mock.calls[0][0]).toBe(42);
		expect((await get(7)).json()).toEqual({ dismissed: false });
		expect((await get(42, '/simulation/install-prompt?view_user_id=7')).json()).toEqual({ dismissed: true });
	});

	it('isole les utilisateurs entre eux', async () => {
		await put({ dismissed: true }, 42);
		expect((await get(42)).json()).toEqual({ dismissed: true });
		expect((await get(43)).json()).toEqual({ dismissed: false });
	});
});
