import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { __avatarCacheBytes, __setAvatarDeps, AvatarBusyError, getAvatar, parseAvatarUrl } from './avatarProxy.service.js';
import { avatarRoutes } from '../routes/avatar.routes.js';

const GOOD = 'https://cdn.intra.42.fr/users/fe48abd92cbb4edfffed3b38c717f129/small_thmouty.jpg';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

afterEach(() => __setAvatarDeps(null));

describe('parseAvatarUrl — seules les photos du CDN 42 passent (pas de relais vers ailleurs)', () => {
	it('accepte une URL de photo 42', () => {
		expect(parseAvatarUrl(GOOD)?.toString()).toBe(GOOD);
	});

	it.each([
		['autre hôte', 'https://evil.example.com/users/fe48abd92cbb4edfffed3b38c717f129/a.jpg'],
		['sous-domaine piège', 'https://cdn.intra.42.fr.evil.com/users/fe48abd92cbb4edfffed3b38c717f129/a.jpg'],
		['http', 'http://cdn.intra.42.fr/users/fe48abd92cbb4edfffed3b38c717f129/a.jpg'],
		['port', 'https://cdn.intra.42.fr:8443/users/fe48abd92cbb4edfffed3b38c717f129/a.jpg'],
		['identifiants', 'https://x:y@cdn.intra.42.fr/users/fe48abd92cbb4edfffed3b38c717f129/a.jpg'],
		['query', `${GOOD}?a=1`],
		['chemin hors /users', 'https://cdn.intra.42.fr/admin/fe48abd92cbb4edfffed3b38c717f129/a.jpg'],
		['remontée', 'https://cdn.intra.42.fr/users/../secret/a.jpg'],
		['pas une image', 'https://cdn.intra.42.fr/users/fe48abd92cbb4edfffed3b38c717f129/a.html'],
		['pas une chaîne', 42],
	])('refuse : %s', (_label, value) => {
		expect(parseAvatarUrl(value)).toBeNull();
	});
});

describe('getAvatar', () => {
	it('envoie le jeton 42 et met la photo en cache', async () => {
		const fetcher = vi.fn(async () => ({ status: 200, body: JPEG, contentType: 'image/jpeg' }));
		__setAvatarDeps({ fetcher, getToken: async () => 'tok' });
		const url = parseAvatarUrl(GOOD)!;
		const a = await getAvatar(url);
		const b = await getAvatar(url);
		expect(a?.contentType).toBe('image/jpeg');
		expect(b).toBe(a);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher).toHaveBeenCalledWith(GOOD, 'tok');
	});

	it('ne relaie pas une réponse qui n’est pas une image (ex. page d’erreur HTML)', async () => {
		__setAvatarDeps({ fetcher: async () => ({ status: 200, body: Buffer.from('<html>'), contentType: 'text/html' }), getToken: async () => 't' });
		expect(await getAvatar(parseAvatarUrl(GOOD)!)).toBeNull();
	});

	it('404 de 42 : null, mémorisé un moment (pas de nouvel appel vers 42)', async () => {
		const fetcher = vi.fn(async () => ({ status: 404, body: Buffer.alloc(0), contentType: 'text/html' }));
		__setAvatarDeps({ fetcher, getToken: async () => 't' });
		expect(await getAvatar(parseAvatarUrl(GOOD)!)).toBeNull();
		expect(await getAvatar(parseAvatarUrl(GOOD)!)).toBeNull();
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('403 de 42 : null mais PAS mémorisé (peut venir du jeton, pas de la photo)', async () => {
		const fetcher = vi.fn(async () => ({ status: 403, body: Buffer.alloc(0), contentType: 'text/html' }));
		__setAvatarDeps({ fetcher, getToken: async () => 't' });
		expect(await getAvatar(parseAvatarUrl(GOOD)!)).toBeNull();
		expect(await getAvatar(parseAvatarUrl(GOOD)!)).toBeNull();
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('erreur 5xx / 429 de 42 : « occupé » (503), pas mémorisée (on réessaiera)', async () => {
		const fetcher = vi.fn(async () => ({ status: 429, body: Buffer.alloc(0), contentType: '' }));
		__setAvatarDeps({ fetcher, getToken: async () => 't' });
		await expect(getAvatar(parseAvatarUrl(GOOD)!)).rejects.toBeInstanceOf(AvatarBusyError);
		await expect(getAvatar(parseAvatarUrl(GOOD)!)).rejects.toBeInstanceOf(AvatarBusyError);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('401 : jeton invalidé, rien de mémorisé — l\u2019appel suivant réussit avec un nouveau jeton', async () => {
		let calls = 0;
		const invalidate = vi.fn();
		__setAvatarDeps({
			fetcher: async () => (++calls === 1
				? { status: 401, body: Buffer.alloc(0), contentType: '' }
				: { status: 200, body: JPEG, contentType: 'image/jpeg' }),
			getToken: async () => 't',
			invalidateToken: invalidate,
		});
		await expect(getAvatar(parseAvatarUrl(GOOD)!)).rejects.toThrow();
		expect(invalidate).toHaveBeenCalledOnce();
		await expect(getAvatar(parseAvatarUrl(GOOD)!)).resolves.not.toBeNull();
	});

	it('part par visiteur : un client qui épuise la sienne ne bloque pas les autres', async () => {
		__setAvatarDeps({ fetcher: async () => ({ status: 200, body: JPEG, contentType: 'image/jpeg' }), getToken: async () => 't' });
		const url = (i: number) => parseAvatarUrl(`https://cdn.intra.42.fr/users/${String(i).padStart(32, 'b')}/a.jpg`)!;
		for (let i = 0; i < 20; i++) await getAvatar(url(i), 'abuseur');
		await expect(getAvatar(url(99), 'abuseur')).rejects.toBeInstanceOf(AvatarBusyError);
		await expect(getAvatar(url(100), 'quelqu-un')).resolves.not.toBeNull();
		// Déjà en cache : servi même à l'abuseur, sans appel vers 42.
		await expect(getAvatar(url(0), 'abuseur')).resolves.not.toBeNull();
	});

	it('cache borné en octets (50 Mo), pas seulement en nombre de photos', async () => {
		const big = Buffer.alloc(3 * 1024 * 1024 - 10, 1);
		__setAvatarDeps({ fetcher: async () => ({ status: 200, body: big, contentType: 'image/jpeg' }), getToken: async () => 't' });
		for (let i = 0; i < 30; i++) {
			const hash = i.toString(16).padStart(32, '0');
			await getAvatar(parseAvatarUrl(`https://cdn.intra.42.fr/users/${hash}/a.jpg`)!, `c${i}`);
		}
		expect(__avatarCacheBytes()).toBeLessThanOrEqual(50 * 1024 * 1024);
		expect(__avatarCacheBytes()).toBeGreaterThan(40 * 1024 * 1024);
	});

	it('plafond global d\u2019appels vers 42 : au-delà, AvatarBusyError (503)', async () => {
		let release!: () => void;
		const gate = new Promise<void>(r => { release = r; });
		__setAvatarDeps({ fetcher: async () => { await gate; return { status: 200, body: JPEG, contentType: 'image/jpeg' }; }, getToken: async () => 't' });
		const urls = Array.from({ length: 5 }, (_, i) => parseAvatarUrl(`https://cdn.intra.42.fr/users/${String(i).padStart(32, 'a')}/a.jpg`)!);
		const running = urls.slice(0, 4).map((u, i) => getAvatar(u, `client-${i}`));
		await expect(getAvatar(urls[4], 'client-4')).rejects.toBeInstanceOf(AvatarBusyError);
		release();
		await Promise.all(running);
		await expect(getAvatar(urls[4], 'client-4')).resolves.not.toBeNull();
	});
});

describe('GET /avatar', () => {
	async function app() {
		const f = Fastify();
		await f.register(avatarRoutes);
		return f;
	}

	it('200 avec l’image et un cache navigateur long', async () => {
		__setAvatarDeps({ fetcher: async () => ({ status: 200, body: JPEG, contentType: 'image/jpeg' }), getToken: async () => 't' });
		const res = await (await app()).inject({ method: 'GET', url: `/avatar?u=${encodeURIComponent(GOOD)}` });
		expect(res.statusCode).toBe(200);
		expect(res.headers['content-type']).toBe('image/jpeg');
		expect(res.headers['cache-control']).toContain('max-age=604800');
		expect(res.rawPayload.equals(JPEG)).toBe(true);
	});

	it('400 sur une URL refusée, sans aucun appel réseau', async () => {
		const fetcher = vi.fn();
		__setAvatarDeps({ fetcher, getToken: async () => 't' });
		const res = await (await app()).inject({ method: 'GET', url: `/avatar?u=${encodeURIComponent('https://evil.example.com/a.jpg')}` });
		expect(res.statusCode).toBe(400);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('404 quand 42 ne fournit pas la photo, 502 quand le jeton est indisponible', async () => {
		__setAvatarDeps({ fetcher: async () => ({ status: 404, body: Buffer.alloc(0), contentType: '' }), getToken: async () => 't' });
		const a = await (await app()).inject({ method: 'GET', url: `/avatar?u=${encodeURIComponent(GOOD)}` });
		expect(a.statusCode).toBe(404);
		__setAvatarDeps({ getToken: async () => { throw new Error('no creds'); } });
		const b = await (await app()).inject({ method: 'GET', url: `/avatar?u=${encodeURIComponent(GOOD)}` });
		expect(b.statusCode).toBe(502);
	});
});
